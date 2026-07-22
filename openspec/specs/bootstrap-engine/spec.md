## ADDED Requirements

### Requirement: BootstrapEngine sequential phase execution
The system SHALL provide a `BootstrapEngine` class that executes registered `BootstrapPhase` instances sequentially in registration order. Each phase has a name, an async check function, and a failure classification.

#### Scenario: All phases pass
- **WHEN** all registered phases return success
- **THEN** the engine SHALL return a `BootstrapResult` with status `READY` and total duration in milliseconds

#### Scenario: FATAL failure aborts
- **WHEN** a phase with `failureClass: 'FATAL'` returns failure
- **THEN** the engine SHALL immediately stop execution and return `BootstrapResult` with status `FAILED`, including the failed phase name and error details

#### Scenario: RECOVERABLE failure with retry
- **WHEN** a phase with `failureClass: 'RECOVERABLE'` returns failure
- **THEN** the engine SHALL retry up to 3 times with exponential backoff (100ms, 200ms, 400ms)
- **AND** if all retries fail in strict mode, return `FAILED`
- **AND** if all retries fail in tolerant mode, mark as `DEGRADED` and continue

#### Scenario: ADVISORY failure continues
- **WHEN** a phase with `failureClass: 'ADVISORY'` returns failure
- **THEN** the engine SHALL log a warning and continue to the next phase

### Requirement: Bootstrap timeout enforcement
The system SHALL enforce a total bootstrap timeout (default 15 seconds). Before executing each phase, the engine SHALL check elapsed time.

#### Scenario: Timeout exceeded
- **WHEN** elapsed time exceeds the configured timeout before a phase starts
- **THEN** the engine SHALL throw `BootstrapTimeoutError` with the phase name that was about to execute

### Requirement: BootstrapContext immutable context
The system SHALL provide a `BootstrapContext` carrying dependencies required by bootstrap phases:
- `cmkProvider` (required) — the CmkProvider instance
- `vaultStore` (optional) — the VaultStore instance
- `strictMode` (default `true`) — whether RECOVERABLE failures escalate to FATAL
- `bootstrapTimeoutMs` (default `15000`) — total timeout in milliseconds
- `onEvent` (optional) — callback `(eventName, detail)` for event notification

#### Scenario: Missing required cmkProvider
- **WHEN** BootstrapContext is constructed without cmkProvider
- **THEN** the system SHALL throw an Error

### Requirement: BootstrapResult structured output
The system SHALL provide `BootstrapResult` with:
- `status`: `'READY'` | `'FAILED'` | `'DEGRADED'`
- `phaseResults`: array of `PhaseResult` objects
- `durationMs`: total execution time
- `failedPhase`: name of failing phase (null if READY)
- `errorDetails`: error message (null if READY)
- `timestamp`: Date when bootstrap completed

Each `PhaseResult` SHALL contain: `name`, `success` (boolean), `durationMs`, `error` (nullable string).

### Requirement: Event emission
The engine SHALL emit events via `context.onEvent` at:
- `lcl.bootstrap.started` — before first phase
- `lcl.bootstrap.<phase>.started` — before each phase
- `lcl.bootstrap.<phase>.completed` — on phase success
- `lcl.bootstrap.<phase>.failed` — on phase failure
- `lcl.bootstrap.<phase>.degraded` — on recoverable failure downgraded
- `lcl.bootstrap.ready` — after all phases pass
- `lcl.bootstrap.timeout` — on timeout

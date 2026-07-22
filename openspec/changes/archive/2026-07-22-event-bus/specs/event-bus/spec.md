## ADDED Requirements

### Requirement: EventBus abstract base class
The system SHALL provide an `EventBus` abstract base class defining the contract for emitting structured LCL events. Implementations MUST NOT throw exceptions to the caller.

#### Scenario: Emit event
- **WHEN** `emit(event)` is called with a valid LclEvent
- **THEN** the implementation SHALL process the event without throwing

#### Scenario: Subclass must override
- **WHEN** a subclass does not override `emit(event)`
- **THEN** calling `emit()` SHALL throw 'Not implemented'

### Requirement: LclEvent immutable event model
The system SHALL provide an immutable `LclEvent` class constructed via Builder pattern with the following fields:
- `event` (string, required) — event name following `lcl.<subsystem>.<operation>.<status>` convention, max 96 chars
- `tier` (EventTier, required) — event tier classification
- `timestamp` (Date, default now) — when the event occurred
- `durationMicros` (number, default -1) — operation duration in microseconds
- `result` (string, required) — outcome (e.g., 'success', 'failed', 'started')
- `namespace` (string, optional) — LCL namespace
- `algorithm` (string, optional) — algorithm identifier
- `dekVersion` (number, default -1) — DEK version
- `errorType` (string, optional) — error classification
- `attributes` (Map<string,string>, default empty) — additional key-value pairs

#### Scenario: Build valid event
- **WHEN** Builder has event, tier, and result set
- **THEN** `build()` SHALL return an immutable LclEvent with all fields frozen

#### Scenario: Missing required field
- **WHEN** Builder is missing `event`, `tier`, or `result`
- **THEN** `build()` SHALL throw an Error identifying the missing field

#### Scenario: Event name validation
- **WHEN** event name exceeds 96 characters
- **THEN** `build()` SHALL throw an Error

#### Scenario: Security constraint
- **WHEN** an LclEvent is constructed
- **THEN** it SHALL NOT contain IV, Tag, ciphertext, wrapped DEK, CMK material, plaintext values, query values, or personal data

### Requirement: EventTier classification
The system SHALL provide `EventTier` constants:
- `L1` — Diagnostic, best-effort delivery (e.g., cache eviction)
- `L2` — Operational, reliable delivery for monitoring (e.g., encrypt/decrypt/rotation)
- `L3` — Audit, guaranteed delivery for compliance

### Requirement: NoOpEventBus default implementation
The system SHALL provide a `NoOpEventBus` singleton that silently discards all events with zero overhead.

#### Scenario: Default when unconfigured
- **WHEN** no EventBus is configured
- **THEN** the system SHALL use `NoOpEventBus.INSTANCE`

### Requirement: CompositeEventBus multi-cast
The system SHALL provide a `CompositeEventBus` that delegates to multiple EventBus implementations in order with failure isolation.

#### Scenario: All delegates receive event
- **WHEN** `emit(event)` is called with N delegates
- **THEN** all N delegates SHALL receive the event in registration order

#### Scenario: Delegate failure isolation
- **WHEN** a delegate throws during `emit(event)`
- **THEN** the exception SHALL be caught and logged
- **AND** remaining delegates SHALL still receive the event

#### Scenario: Empty delegates
- **WHEN** CompositeEventBus is constructed with empty array
- **THEN** `emit()` SHALL be a no-op

### Requirement: BootstrapEngine EventBus integration
The `BootstrapEngine` SHALL use `EventBus.emit(LclEvent)` for event notification instead of the `onEvent` callback.

#### Scenario: EventBus in BootstrapContext
- **WHEN** BootstrapContext is constructed with `eventBus` option
- **THEN** BootstrapEngine SHALL emit structured LclEvent objects to that bus

#### Scenario: Backward compatibility with onEvent
- **WHEN** BootstrapContext is constructed with `onEvent` callback (deprecated) but no `eventBus`
- **THEN** the system SHALL wrap the callback in an adapter EventBus for backward compatibility

#### Scenario: Default NoOp
- **WHEN** neither `eventBus` nor `onEvent` is provided
- **THEN** the system SHALL use `NoOpEventBus.INSTANCE`

### Requirement: Plugin eventBus option
The `lclCryptoPlugin` SHALL accept an optional `eventBus` option (EventBus instance) passed to BootstrapContext.

#### Scenario: Custom EventBus
- **WHEN** `eventBus` option is provided
- **THEN** bootstrap events SHALL be emitted to that bus

#### Scenario: No EventBus configured
- **WHEN** `eventBus` option is not provided
- **THEN** the system SHALL use NoOpEventBus (zero overhead)

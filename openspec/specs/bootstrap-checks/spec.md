## ADDED Requirements

### Requirement: ConfigValidationCheck
The system SHALL provide a `ConfigValidationCheck` implementing BootstrapCheck that validates the bootstrap context configuration.

#### Scenario: Valid configuration
- **WHEN** `context.cmkProvider` is present and has `getProviderId()` returning a non-empty string
- **THEN** the check SHALL return `PhaseResult.success('BOOT-1 Config', durationMs)`

#### Scenario: Missing CmkProvider
- **WHEN** `context.cmkProvider` is null/undefined
- **THEN** the check SHALL return `PhaseResult.failure('BOOT-1 Config', durationMs, 'cmkProvider is required')`

#### Scenario: Invalid CmkProvider
- **WHEN** `context.cmkProvider.getProviderId()` returns empty or throws
- **THEN** the check SHALL return `PhaseResult.failure('BOOT-1 Config', durationMs, errorMessage)`

### Requirement: KmsReachabilityCheck
The system SHALL provide a `KmsReachabilityCheck` implementing BootstrapCheck that verifies the CMK Provider is reachable.

#### Scenario: KMS reachable
- **WHEN** `context.cmkProvider.getPublicReference()` resolves successfully
- **THEN** the check SHALL return `PhaseResult.success('BOOT-2 KMS', durationMs)`

#### Scenario: KMS unreachable
- **WHEN** `context.cmkProvider.getPublicReference()` throws or rejects
- **THEN** the check SHALL return `PhaseResult.failure('BOOT-2 KMS', durationMs, errorMessage)`

#### Scenario: Provider lacks getPublicReference
- **WHEN** `context.cmkProvider.getPublicReference` is not a function
- **THEN** the check SHALL return `PhaseResult.success('BOOT-2 KMS', durationMs)` with advisory note "skipped: no getPublicReference"

### Requirement: VaultReachabilityCheck
The system SHALL provide a `VaultReachabilityCheck` implementing BootstrapCheck that verifies the VaultStore is accessible.

#### Scenario: Vault reachable
- **WHEN** `context.vaultStore.exists('__lcl_bootstrap_probe')` resolves without error
- **THEN** the check SHALL return `PhaseResult.success('BOOT-3 Vault', durationMs)`

#### Scenario: Vault unreachable
- **WHEN** `context.vaultStore.exists()` throws or rejects
- **THEN** the check SHALL return `PhaseResult.failure('BOOT-3 Vault', durationMs, errorMessage)`

#### Scenario: No VaultStore configured
- **WHEN** `context.vaultStore` is null/undefined
- **THEN** the check SHALL return `PhaseResult.success('BOOT-3 Vault', durationMs)` with advisory note "skipped: no vaultStore"

### Requirement: Default phase registration
The system SHALL provide a factory function `createDefaultPhases()` that returns the standard bootstrap phases in order:
1. `{ name: 'BOOT-1 Config', check: new ConfigValidationCheck(), failureClass: 'FATAL' }`
2. `{ name: 'BOOT-2 KMS', check: new KmsReachabilityCheck(), failureClass: 'RECOVERABLE' }`
3. `{ name: 'BOOT-3 Vault', check: new VaultReachabilityCheck(), failureClass: 'RECOVERABLE' }`
4. `{ name: 'BOOT-4 KAT', check: new KatRunner(), failureClass: 'FATAL' }`

### Requirement: Plugin bootstrap integration
The `lclCryptoPlugin` SHALL accept an optional `bootstrap` option:
- `bootstrap: true` — run bootstrap with default phases before schema registration
- `bootstrap: false` (default) — skip bootstrap
- `bootstrap: { strictMode, timeoutMs, phases }` — custom configuration

#### Scenario: Bootstrap enabled and passes
- **WHEN** `bootstrap: true` and all checks pass
- **THEN** the plugin SHALL proceed with normal initialization

#### Scenario: Bootstrap enabled and fails
- **WHEN** `bootstrap: true` and a FATAL check fails
- **THEN** the plugin SHALL throw an Error with bootstrap failure details, preventing schema registration

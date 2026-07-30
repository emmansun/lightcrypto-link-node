## ADDED Requirements

### Requirement: Rewrap vault keys under a new CMK provider
The system SHALL provide a `rewrapVault(namespace, targetProvider, [options])` operation on `KeyVaultService` that re-wraps all key entries (ACTIVE and ROTATED) in the specified namespace's VaultDocument using the target CMK provider, without modifying the underlying DEK/HMAC key material or any business data.

#### Scenario: Successful re-wrap of a namespace with multiple key versions
- **WHEN** `rewrapVault` is called with a valid namespace and a target provider different from the current provider
- **THEN** the system SHALL unwrap every KeyEntry's `dek.wrapped` and `hmk.wrapped` using the current provider (`this._cmkProvider`), re-wrap them using the target provider, update `dek.algorithm` and `hmk.algorithm` to the target provider's algorithm, update `VaultDocument.cmk.provider` and `cmk.id` to the target provider's identifiers, increment the document version, and persist via `VaultStore.rotate()`

#### Scenario: KCV invariance verification
- **WHEN** re-wrap is performed
- **THEN** the system SHALL verify that recomputed KCV (`dek.kcv`, `hmk.kcv`) and `binding` values remain identical to the stored values after unwrapping, and SHALL abort with an Error if any mismatch is detected

#### Scenario: Post-rewrap roundtrip verification
- **WHEN** re-wrap completes for a namespace
- **THEN** the system SHALL perform a verification unwrap of the newly wrapped DEK and HMAC key using the target provider and confirm the raw key material matches the original, aborting if roundtrip fails

#### Scenario: Optimistic lock conflict during re-wrap
- **WHEN** a concurrent modification (e.g., DEK rotation) occurs on the same namespace during re-wrap
- **THEN** the system SHALL fail with a clear error indicating concurrent modification, leaving the vault document unchanged

#### Scenario: Re-wrap with same provider and same key is a no-op
- **WHEN** `rewrapVault` is called with a target provider whose `getProviderId()` equals the current `VaultDocument.cmk.provider` AND whose `getPublicReference()` equals `VaultDocument.cmk.id`
- **THEN** the system SHALL skip the operation and return a RewrapResult with `success: true` and `skipped: true` without modification

#### Scenario: Re-wrap with same providerId but different key proceeds
- **WHEN** `rewrapVault` is called with a target provider whose `getProviderId()` equals `VaultDocument.cmk.provider` but whose `getPublicReference()` differs from `VaultDocument.cmk.id`
- **THEN** the system SHALL proceed with re-wrap (same-type key rotation), updating `cmk.id` to the target's `getPublicReference()`

#### Scenario: Dry-run mode
- **WHEN** `rewrapVault` is called with `options.dryRun === true`
- **THEN** the system SHALL perform full validation (load vault, unwrap all entries, verify KCV/binding, canary wrap/unwrap with target provider) but SHALL NOT persist any changes via VaultStore, and SHALL return a RewrapResult with `dryRun: true`

### Requirement: Batch re-wrap all vaults
The system SHALL provide a `rewrapAllVaults(targetProvider, [options])` operation that iterates all namespaces via `VaultStore.loadAll()` and performs `rewrapVault` for each, with per-namespace error isolation.

#### Scenario: All namespaces re-wrapped successfully
- **WHEN** `rewrapAllVaults` is called and all namespaces succeed
- **THEN** the system SHALL return an array of RewrapResult objects with total count and all marked success

#### Scenario: Partial failure isolation
- **WHEN** re-wrap fails for one namespace (e.g., KMS timeout)
- **THEN** the system SHALL capture the error in that namespace's RewrapResult, continue processing remaining namespaces, and return the full results array including failed namespace name and error message

### Requirement: RewrapResult structure
The system SHALL return a plain object result from re-wrap operations with the following fields: `namespace` (string), `success` (boolean), `skipped` (boolean, default false), `dryRun` (boolean, default false), `keyCount` (number), `error` (string|null), `durationMicros` (number).

#### Scenario: Successful result
- **WHEN** a re-wrap completes successfully for a namespace with 3 key entries
- **THEN** the RewrapResult SHALL have `success: true`, `skipped: false`, `keyCount: 3`, `error: null`, and a positive `durationMicros`

#### Scenario: Failed result
- **WHEN** a re-wrap fails for a namespace
- **THEN** the RewrapResult SHALL have `success: false`, `error` containing the failure message, and `keyCount: 0`

### Requirement: Rewrap event emission
The system SHALL emit structured events via `EventBus` for re-wrap operations: `lcl.rewrap.namespace.completed` (L2) on successful per-namespace re-wrap, `lcl.rewrap.namespace.failed` (L2) on per-namespace failure, and `lcl.rewrap.batch.completed` (L2) on batch completion.

#### Scenario: Namespace re-wrap success event
- **WHEN** a single namespace re-wrap completes successfully
- **THEN** the system SHALL emit `lcl.rewrap.namespace.completed` with tier=L2, result="success", namespace, and durationMicros

#### Scenario: Namespace re-wrap failure event
- **WHEN** a single namespace re-wrap fails
- **THEN** the system SHALL emit `lcl.rewrap.namespace.failed` with tier=L2, result="failed", namespace, and errorType

#### Scenario: Batch completion event
- **WHEN** `rewrapAllVaults` finishes processing all namespaces
- **THEN** the system SHALL emit `lcl.rewrap.batch.completed` with tier=L2, result="success", and attributes containing totalCount, successCount, failedCount, and totalDurationMicros

#### Scenario: No event emitted when NoOpEventBus is used
- **WHEN** KeyVaultService is constructed without an eventBus option
- **THEN** the default NoOpEventBus SHALL silently discard all emitted events without error

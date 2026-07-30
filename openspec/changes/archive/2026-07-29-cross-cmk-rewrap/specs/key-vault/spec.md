## ADDED Requirements

### Requirement: KeyVaultService rewrap operations
The `KeyVaultService` SHALL expose `rewrapVault(namespace, targetProvider, [options])` and `rewrapAllVaults(targetProvider, [options])` as public operations for cross-CMK provider key migration. These operations SHALL NOT generate new DEK/HMAC key material — they only change the wrapping layer.

#### Scenario: rewrapVault delegates to VaultStore with optimistic locking
- **WHEN** `rewrapVault` is invoked for a namespace
- **THEN** the system SHALL load the VaultDocument, unwrap all entries with the current provider, re-wrap with the target provider, and persist via `VaultStore.rotate()` with version increment

#### Scenario: rewrapAllVaults uses VaultStore.loadAll
- **WHEN** `rewrapAllVaults` is invoked
- **THEN** the system SHALL call `VaultStore.loadAll()` to enumerate all namespaces and invoke `rewrapVault` for each with per-namespace error isolation

### Requirement: Rewrap invalidates DEK cache
After a successful `rewrapVault` for a namespace, the system SHALL evict the cached key context for that namespace so that subsequent operations use the newly re-wrapped keys via the target provider.

#### Scenario: Cache eviction after re-wrap
- **WHEN** `rewrapVault` completes successfully for namespace "default.default.User#phone"
- **THEN** the DEK cache entry for that namespace SHALL be invalidated, and the next encrypt/decrypt operation SHALL reload from VaultStore using the target provider

## MODIFIED Requirements

### Requirement: KeyVaultService SHALL depend on VaultStore interface instead of Mongoose Connection
The system SHALL decouple KeyVaultService from Mongoose by accepting a VaultStore implementation.

#### Scenario: Constructor accepts vaultStore
- **WHEN** constructing KeyVaultService
- **THEN** it SHALL accept `options.vaultStore` (a VaultStore implementation)
- **AND** it SHALL accept `options.cmkProvider` (a CmkProvider)
- **AND** it SHALL accept `options.cacheTtl` (optional, default 3600000ms)
- **AND** it SHALL accept `options.eventBus` (optional, default NoOpEventBus)
- **AND** it SHALL NOT accept `options.connection` directly

#### Scenario: Vault initialization via VaultStore
- **WHEN** `ensureVaultInitialized(namespace)` is called
- **THEN** the service SHALL call `vaultStore.load(namespace)` to check existence
- **AND** if not found, it SHALL create a new VaultDocument and call `vaultStore.save(doc)`
- **AND** the VaultDocument SHALL be a plain object (not a Mongoose Document)

#### Scenario: Key rotation via VaultStore
- **WHEN** `rotateDek(namespace)` is called
- **THEN** the service SHALL load the current vault, construct an updated VaultDocument with incremented version
- **AND** it SHALL call `vaultStore.rotate(updatedDoc)` for CAS-protected update
- **AND** if `OptimisticLockError` is thrown, it SHALL propagate to the caller

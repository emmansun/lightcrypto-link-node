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

#### Scenario: Vault initialization via VaultStore (encrypt path)
- **WHEN** `ensureVaultInitialized(namespace)` is called
- **THEN** the service SHALL call `vaultStore.load(namespace)` to check existence
- **AND** if not found, it SHALL create a new VaultDocument and call `vaultStore.save(doc)`
- **AND** the VaultDocument SHALL be a plain object (not a Mongoose Document)

#### Scenario: Key rotation via VaultStore
- **WHEN** `rotateDek(namespace)` is called
- **THEN** the service SHALL load the current vault, construct an updated VaultDocument with incremented version
- **AND** it SHALL call `vaultStore.rotate(updatedDoc)` for CAS-protected update
- **AND** if `OptimisticLockError` is thrown, it SHALL propagate to the caller

## ADDED Requirements

### Requirement: Decrypt path cache loading SHALL be read-only
The `getDekByVersion(namespace, dekVersion)` and `getKeyPair(namespace, kid)` methods SHALL use a read-only cache loading path that NEVER creates vault documents.

#### Scenario: Vault exists — cache populated from store
- **WHEN** `getDekByVersion(namespace, dekVersion)` is called and cache is cold
- **THEN** the service SHALL call `vaultStore.load(namespace)` (read-only)
- **AND** if the vault document exists, it SHALL unwrap keys and populate the cache
- **AND** it SHALL return the DEK for the requested version

#### Scenario: Vault does not exist — KeyResolutionError thrown
- **WHEN** `getDekByVersion(namespace, dekVersion)` is called and `vaultStore.load(namespace)` returns null
- **THEN** the service SHALL throw `KeyResolutionError` with `.namespace` set and `.vaultExists = false`
- **AND** the service SHALL NOT call `vaultStore.save()`

#### Scenario: Encrypt path still creates vault
- **WHEN** `getActiveKeyPair(namespace)` is called and no vault exists
- **THEN** the service SHALL create a new vault via `ensureVaultInitialized(namespace)` (existing behavior preserved)

### Requirement: Key resolution errors SHALL be typed
All key resolution failures in the decrypt path SHALL throw `KeyResolutionError` instead of generic `Error`.

#### Scenario: Unknown dekVersion
- **WHEN** `getDekByVersion(namespace, dekVersion)` is called and the vault has no entry for the requested version
- **THEN** the system SHALL throw `KeyResolutionError` with `.namespace`, `.dekVersion`, and `.vaultExists = true`

#### Scenario: Unknown kid
- **WHEN** `getKeyPair(namespace, kid)` is called and no key entry matches
- **THEN** the system SHALL throw `KeyResolutionError` with `.namespace` and `.kid`

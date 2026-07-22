## MODIFIED Requirements

### Requirement: KeyVaultService SHALL depend on VaultStore interface instead of Mongoose Connection
The system SHALL decouple KeyVaultService from Mongoose by accepting a VaultStore implementation.

#### Scenario: Constructor accepts vaultStore
- **WHEN** constructing KeyVaultService
- **THEN** it SHALL accept `options.vaultStore` (a VaultStore implementation)
- **AND** it SHALL accept `options.cmkProvider` (a CmkProvider)
- **AND** it SHALL accept `options.cacheTtl` (optional, default 3600000ms)
- **AND** it SHALL NOT accept `options.connection` directly

#### Scenario: Vault initialization via VaultStore
- **WHEN** `ensureVaultInitialized(entityName)` is called
- **THEN** the service SHALL call `vaultStore.load(vaultId)` to check existence
- **AND** if not found, it SHALL create a new VaultDocument and call `vaultStore.save(doc)`
- **AND** the VaultDocument SHALL be a plain object (not a Mongoose Document)

#### Scenario: Key rotation via VaultStore
- **WHEN** `rotateDek(entityName)` is called
- **THEN** the service SHALL load the current vault, construct an updated VaultDocument with incremented version
- **AND** it SHALL call `vaultStore.rotate(updatedDoc)` for CAS-protected update
- **AND** if `OptimisticLockError` is thrown, it SHALL propagate to the caller

#### Scenario: Cache behavior unchanged
- **WHEN** vault keys are loaded
- **THEN** the in-memory cache with TTL SHALL remain in KeyVaultService (not in VaultStore)
- **AND** cache flush SHALL still securely destroy keys

### Requirement: lclCryptoPlugin SHALL support both vaultStore and connection configuration
The plugin SHALL provide backward-compatible configuration while preferring explicit vaultStore.

#### Scenario: vaultStore provided
- **WHEN** plugin options include `vaultStore`
- **THEN** the plugin SHALL pass it directly to KeyVaultService

#### Scenario: connection provided (convenience)
- **WHEN** plugin options include `connection` but NOT `vaultStore`
- **THEN** the plugin SHALL extract the native MongoClient via `connection.getClient()`
- **AND** construct a `MongoVaultStore(client.db(connection.name))` automatically
- **AND** pass it to KeyVaultService

#### Scenario: Neither provided
- **WHEN** plugin options include neither `vaultStore` nor `connection`
- **THEN** the plugin SHALL throw a configuration error

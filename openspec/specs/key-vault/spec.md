## ADDED Requirements

### Requirement: Key vault SHALL be stored in __lcl_keyvault collection
The system SHALL manage a MongoDB collection named `__lcl_keyvault` containing encrypted DEK/HMAC key pairs.

#### Scenario: Vault document structure
- **WHEN** a vault document is created
- **THEN** it SHALL have `_id: "lcl-dek-{canonical-namespace}"` format (e.g., `lcl-dek-default.default.User#phone`)
- **AND** it SHALL contain fields: `v` (version), `status`, `activeKid`, `keys[]`, `cmk`, `createdAt`, `updatedAt`
- **AND** each entry in `keys[]` SHALL contain: `kid`, `status`, `dek`, `hmk`, `binding`, `createdAt`

#### Scenario: Vault initialization
- **WHEN** encryption is first used for a new namespace
- **THEN** a vault document SHALL be created with `id: "lcl-dek-{canonical-namespace}"`
- **AND** one initial key entry SHALL be generated with `kid: "v1-{8 hex chars}"`
- **AND** the vault SHALL be inserted into `__lcl_keyvault` collection

### Requirement: System SHALL support per-namespace DEK isolation
Each namespace (canonical form, e.g., `default.default.User#phone`) SHALL have its own vault document and DEK/HMAC key pair. KeyVaultService methods SHALL accept canonical namespace strings for vault routing.

#### Scenario: Entity-based vault routing by canonical namespace
- **WHEN** calling `ensureVaultInitialized("default.default.User#phone")`
- **THEN** the system SHALL use vault with `_id: "lcl-dek-default.default.User#phone"`

#### Scenario: Different fields have independent DEKs
- **WHEN** encrypting `User#phone` and `User#email`
- **THEN** they SHALL use different vaults with independent DEKs

### Requirement: DEK SHALL be wrapped (envelope encryption) by CMK
Raw DEK and HMAC keys SHALL be encrypted by a Customer Master Key (CMK) before storage.

#### Scenario: Key wrapping
- **WHEN** generating a new DEK
- **THEN** a 32-byte random DEK SHALL be generated
- **AND** a 32-byte random HMAC key SHALL be generated
- **AND** both keys SHALL be encrypted using the CMK provider
- **AND** the wrapped keys SHALL be stored in `keys[].dek.wrapped` and `keys[].hmk.wrapped`

#### Scenario: Key unwrapping
- **WHEN** loading vault for decryption
- **THEN** the system SHALL unwrap DEK and HMAC key using the CMK provider
- **AND** the unwrapped keys SHALL be cached in memory for performance

### Requirement: KCV verification SHALL be performed during vault loading
The system SHALL verify Key Check Values to ensure key integrity.

#### Scenario: DEK KCV verification
- **WHEN** unwrapping a DEK
- **THEN** the system SHALL compute KCV of the unwrapped DEK
- **AND** it SHALL match the stored `keys[].dek.kcv`
- **AND** if mismatched, a FatalCryptoException SHALL be thrown

#### Scenario: HMAC Key KCV verification
- **WHEN** unwrapping an HMAC key
- **THEN** the system SHALL compute KCV of the unwrapped HMAC key
- **AND** it SHALL match the stored `keys[].hmk.kcv`
- **AND** if mismatched, a FatalCryptoException SHALL be thrown

### Requirement: Binding hash SHALL verify DEK/HMAC key pair integrity
The system SHALL compute and verify a binding hash between DEK and HMAC key.

#### Scenario: Binding verification
- **WHEN** unwrapping keys
- **THEN** the system SHALL compute HMAC-SHA-256(hmacKey, dek)
- **AND** the result SHALL match the stored `keys[].binding` as lowercase hex
- **AND** if mismatched, a FatalCryptoException SHALL be thrown

### Requirement: System SHALL support DEK rotation
The system SHALL allow rotating the active DEK while maintaining backward compatibility with historical data.

#### Scenario: Key rotation
- **WHEN** `rotateDek(namespace)` is called
- **THEN** the current ACTIVE key entry SHALL be marked as ROTATED
- **AND** a new key entry SHALL be generated with incremented version number
- **AND** the new entry SHALL be marked as ACTIVE
- **AND** the `activeKid` SHALL be updated
- **AND** the `v` version SHALL be incremented

#### Scenario: Backward compatibility
- **WHEN** decrypting historical data encrypted with an old DEK
- **THEN** the system SHALL look up the `kid` from the encrypted sub-document
- **AND** it SHALL find the corresponding key entry in `keys[]`
- **AND** it SHALL decrypt successfully using the old DEK

#### Scenario: Rotation does not affect other namespaces
- **WHEN** `rotateDek("default.default.User#phone")` is called
- **THEN** the vault for `default.default.User#email` SHALL remain unchanged

### Requirement: System SHALL support optimistic locking during rotation
Concurrent key rotation SHALL be prevented using MongoDB atomic operations.

#### Scenario: Concurrent rotation protection
- **WHEN** rotating DEK
- **THEN** the update SHALL include filter: `{ _id: vaultId, v: doc.v - 1 }`
- **AND** if no document is matched, an OptimisticLockError SHALL be thrown
- **AND** this SHALL prevent concurrent rotation race conditions

### Requirement: getDek and getHmacKey SHALL accept kid only
The `getDek(kid)` and `getHmacKey(kid)` methods SHALL accept only a kid parameter and SHALL search across all cached namespaces to find the matching key pair.

#### Scenario: getDek by kid across namespaces
- **WHEN** `getDek('v1-abcd1234')` is called and kid `v1-abcd1234` exists in namespace `default.default.User#phone`
- **THEN** the system SHALL return the DEK for that kid regardless of namespace

#### Scenario: getDek with unknown kid throws
- **WHEN** `getDek('v99-nonexistent')` is called and no namespace contains that kid
- **THEN** the system SHALL throw an error containing `"Unknown kid"`

#### Scenario: getHmacKey by kid
- **WHEN** `getHmacKey('v1-abcd1234')` is called
- **THEN** the system SHALL return the HMAC key for that kid across all namespaces

### Requirement: getDekByVersion SHALL resolve DEK by namespace and version
The system SHALL provide `getDekByVersion(namespace, dekVersion)` that returns the DEK for a specific namespace and DEK version number.

#### Scenario: Get DEK by version
- **WHEN** `getDekByVersion("default.default.User#phone", 1)` is called
- **THEN** the system SHALL return the DEK for version 1 in that namespace's vault

#### Scenario: Get DEK by version after rotation
- **WHEN** a vault has been rotated to version 2 and `getDekByVersion(namespace, 1)` is called
- **THEN** the system SHALL return the historical DEK for version 1

#### Scenario: Unknown version throws
- **WHEN** `getDekByVersion("default.default.User#phone", 99)` is called and version 99 does not exist
- **THEN** the system SHALL throw an error

### Requirement: getActiveDekVersion SHALL return current DEK version
The system SHALL provide `getActiveDekVersion(namespace)` that returns the version number of the currently active DEK for the given namespace.

#### Scenario: Active DEK version for new vault
- **WHEN** `getActiveDekVersion("default.default.User#phone")` is called on a newly initialized vault
- **THEN** the result SHALL be `1`

#### Scenario: Active DEK version after rotation
- **WHEN** `rotateDek("default.default.User#phone")` is called and then `getActiveDekVersion("default.default.User#phone")` is called
- **THEN** the result SHALL be `2`

### Requirement: getActiveHmacKey SHALL return active HMAC key for namespace
The system SHALL provide `getActiveHmacKey(namespace)` that returns the HMAC key of the currently active key entry for the given namespace.

#### Scenario: Active HMAC key
- **WHEN** `getActiveHmacKey("default.default.User#phone")` is called
- **THEN** the result SHALL be the HMAC key of the active key entry

### Requirement: DEK SHALL be cached in memory with TTL per namespace
The system SHALL cache unwrapped DEKs per namespace with configurable TTL. The cache entry SHALL contain `activeKid`, `activeDekVersion`, `resolvedKeys` (kid→keyPair), and `resolvedKeysByVersion` (version→keyPair).

#### Scenario: Cache hit
- **WHEN** requesting DEK for namespace `"default.default.User#phone"` and cache is valid
- **THEN** the cached DEK SHALL be returned immediately
- **AND** TTL SHALL default to 1 hour (3600000 ms)

#### Scenario: Cache miss
- **WHEN** DEK is not in cache or TTL expired
- **THEN** the system SHALL unwrap DEK from vault
- **AND** the unwrapped DEK SHALL be cached with new expiration time

#### Scenario: Cache flush
- **WHEN** `flushCache()` is called
- **THEN** all cached DEKs SHALL be securely destroyed using `crypto.randomFillSync()`
- **AND** the cache SHALL be cleared

### Requirement: kid format SHALL follow versioning convention
Key IDs SHALL encode version information for easy tracking.

#### Scenario: kid generation
- **WHEN** generating a new kid
- **THEN** it SHALL have format `"v{version}-{8 hex chars}"`
- **AND** version SHALL start at 1 and increment with each rotation
- **AND** the 8 hex chars SHALL be random (4 bytes, generated using `crypto.randomBytes()`)

### Requirement: CMK provider SHALL be recorded in vault
The vault SHALL store CMK provider information for audit and verification.

#### Scenario: CMK info storage
- **WHEN** creating a vault
- **THEN** the `cmk.provider` field SHALL store the provider ID (e.g., "local-symmetric")
- **AND** the `cmk.id` field SHALL store the public reference (e.g., "local-cmk-sha256:abcd1234")

### Requirement: KeyVaultService SHALL depend on VaultStore interface instead of Mongoose Connection
The system SHALL decouple KeyVaultService from Mongoose by accepting a VaultStore implementation.

#### Scenario: Constructor accepts vaultStore
- **WHEN** constructing KeyVaultService
- **THEN** it SHALL accept `options.vaultStore` (a VaultStore implementation)
- **AND** it SHALL accept `options.cmkProvider` (a CmkProvider)
- **AND** it SHALL accept `options.cacheTtl` (optional, default 3600000ms)
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

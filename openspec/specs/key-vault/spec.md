## ADDED Requirements

### Requirement: Key vault SHALL be stored in __lcl_keyvault collection
The system SHALL manage a MongoDB collection named `__lcl_keyvault` containing encrypted DEK/HMAC key pairs.

#### Scenario: Vault document structure
- **WHEN** a vault document is created
- **THEN** it SHALL have `_id: "lcl-dek-{EntityName}"` format
- **AND** it SHALL contain fields: `v` (version), `status`, `activeKid`, `keys[]`, `cmk`, `createdAt`, `updatedAt`
- **AND** each entry in `keys[]` SHALL contain: `kid`, `status`, `dek`, `hmk`, `binding`, `createdAt`

#### Scenario: Vault initialization
- **WHEN** encryption is first used for a new entity class
- **THEN** a vault document SHALL be created with `id: "lcl-dek-{EntityName}"`
- **AND** one initial key entry SHALL be generated with `kid: "v1-{8 hex chars}"`
- **AND** the vault SHALL be inserted into `__lcl_keyvault` collection

### Requirement: System SHALL support per-entity DEK isolation
Each entity class SHALL have its own vault document and DEK/HMAC key pair.

#### Scenario: Entity-based vault routing
- **WHEN** encrypting User.phone
- **THEN** the system SHALL use vault with `_id: "lcl-dek-User"`
- **WHEN** encrypting Order.ssn
- **THEN** the system SHALL use vault with `_id: "lcl-dek-Order"`
- **AND** the two entities SHALL have independent DEKs

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
- **WHEN** `rotateDek(EntityClass)` is called
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

### Requirement: System SHALL support optimistic locking during rotation
Concurrent key rotation SHALL be prevented using MongoDB atomic operations.

#### Scenario: Concurrent rotation protection
- **WHEN** rotating DEK
- **THEN** the update SHALL include filter: `{ _id: vaultId, activeKid: expectedActiveKid, v: expectedVersion }`
- **AND** if no document is matched, a FatalCryptoException SHALL be thrown
- **AND** this SHALL prevent concurrent rotation race conditions

### Requirement: DEK SHALL be cached in memory with TTL
The system SHALL cache unwrapped DEKs to avoid repeated KMS API calls.

#### Scenario: Cache hit
- **WHEN** requesting DEK for an entity
- **THEN** the system SHALL check the in-memory cache first
- **AND** if cache hit and TTL not expired, the cached DEK SHALL be returned immediately
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

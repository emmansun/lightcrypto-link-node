## MODIFIED Requirements

### Requirement: System SHALL support per-namespace DEK isolation
Each namespace (canonical form, e.g., `default.default.User#phone`) SHALL have its own vault document and DEK/HMAC key pair. KeyVaultService methods SHALL accept canonical namespace strings for vault routing.

#### Scenario: Entity-based vault routing by canonical namespace
- **WHEN** calling `ensureVaultInitialized("default.default.User#phone")`
- **THEN** the system SHALL use vault with `_id: "lcl-dek-default.default.User#phone"`

#### Scenario: Different fields have independent DEKs
- **WHEN** encrypting `User#phone` and `User#email`
- **THEN** they SHALL use different vaults with independent DEKs

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

#### Scenario: Cache miss
- **WHEN** DEK is not in cache or TTL expired
- **THEN** the system SHALL unwrap DEK from vault and cache with new expiration

#### Scenario: Cache flush destroys key material
- **WHEN** `flushCache()` is called
- **THEN** all cached DEKs SHALL be securely destroyed and the cache cleared

### Requirement: DEK rotation SHALL work per namespace
The `rotateDek(namespace)` method SHALL rotate the DEK for the specified namespace, marking all ACTIVE keys as ROTATED and creating a new ACTIVE key.

#### Scenario: Key rotation
- **WHEN** `rotateDek("default.default.User#phone")` is called
- **THEN** the current ACTIVE key SHALL be marked as ROTATED
- **AND** a new key entry SHALL be generated with incremented version
- **AND** the `activeKid` and `v` SHALL be updated

#### Scenario: Rotation does not affect other namespaces
- **WHEN** `rotateDek("default.default.User#phone")` is called
- **THEN** the vault for `default.default.User#email` SHALL remain unchanged

### Requirement: CMK provider SHALL be recorded in vault
The vault SHALL store CMK provider information for audit and verification.

#### Scenario: CMK info storage
- **WHEN** creating a vault
- **THEN** the `cmk.provider` field SHALL store the provider ID
- **AND** the `cmk.id` field SHALL store the public reference

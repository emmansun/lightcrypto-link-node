## ADDED Requirements

### Requirement: BlindIndexEngine SHALL derive per-namespace HMAC key via HKDF-SHA256
The system SHALL derive a namespace-scoped HMAC key from the master HMAC key using HKDF-SHA256, matching Java BlindIndexEngine exactly.

#### Scenario: HKDF key derivation
- **WHEN** deriving a blind index key for a namespace
- **THEN** the system SHALL compute: `derivedKey = HKDF-SHA256(IKM=masterHmacKey, Salt=SHA-256(namespace.canonicalBytes()), Info="lcl-blind-index-v1", L=32)`
- **AND** the derived key SHALL be exactly 32 bytes
- **AND** the HKDF info string SHALL be exactly `"lcl-blind-index-v1"` (matching Java code, not LCL-CORE-006 spec)

#### Scenario: Different namespaces produce different keys
- **WHEN** deriving keys for `"default.default.User#phone"` and `"default.default.User#email"`
- **THEN** the derived keys SHALL be different (due to different SHA-256 salt)

#### Scenario: Same namespace produces same key
- **WHEN** deriving keys for the same namespace multiple times
- **THEN** the derived key SHALL be identical (deterministic)

### Requirement: BlindIndexEngine SHALL compute blind index as Base64URL HMAC-SHA256
The system SHALL compute the blind index using the derived key with field name isolation.

#### Scenario: Blind index computation
- **WHEN** computing blind index for a string value
- **THEN** the system SHALL compute: `Base64URL(HMAC-SHA256(derivedKey, fieldName + ":" + normalizedValue))`
- **AND** the separator SHALL be `:` (0x3A)
- **AND** the output SHALL be Base64URL encoded without padding

#### Scenario: String normalization
- **WHEN** the input value is a string
- **THEN** the value SHALL be normalized with trim + lowercase before HMAC computation
- **AND** `"  Test@Example.COM  "` SHALL become `"test@example.com"`

#### Scenario: Byte array input (no normalization)
- **WHEN** the input value is a Buffer/byte array
- **THEN** no normalization SHALL be applied (raw bytes used as-is)

### Requirement: BlindIndexEngine SHALL cache derived keys per namespace
The system SHALL cache derived keys to avoid redundant HKDF computation.

#### Scenario: Cache hit
- **WHEN** computing blind index for the same namespace repeatedly
- **THEN** the HKDF derivation SHALL occur only once
- **AND** subsequent calls SHALL use the cached derived key

#### Scenario: Cache keyed by canonical namespace
- **WHEN** computing blind index for `"User#phone"` (shorthand)
- **THEN** the cache key SHALL be the canonical form `"default.default.User#phone"`

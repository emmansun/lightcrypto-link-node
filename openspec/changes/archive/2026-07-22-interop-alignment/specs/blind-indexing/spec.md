## MODIFIED Requirements

### Requirement: Blind index SHALL enable exact-match queries on encrypted fields
The system SHALL generate deterministic HMAC-based blind indexes for encrypted fields with `blindIndex: true` option, using HKDF-derived namespace-scoped keys.

#### Scenario: Blind index generation
- **WHEN** a field has `blindIndex: true`
- **THEN** a blind index SHALL be computed using BlindIndexEngine (HKDF-derived key) and stored in the `b` field of the encrypted sub-document
- **AND** the same plaintext value with the same namespace SHALL always produce the same blind index

#### Scenario: Blind index format
- **WHEN** computing blind index
- **THEN** the system SHALL derive a per-namespace key via HKDF-SHA256(IKM=masterHmacKey, Salt=SHA-256(namespace), Info="lcl-blind-index-v1", L=32)
- **AND** compute HMAC-SHA-256(derivedKey, `fieldName:normalizedValue`)
- **AND** the output SHALL be Base64URL encoded without padding
- **AND** the blind index SHALL be exactly 43 characters for SHA-256

### Requirement: Blind index computation SHALL be deterministic
Given the same masterHmacKey, namespace, field name, and plaintext value, the blind index SHALL always be identical across Node.js and Java.

#### Scenario: Deterministic serialization
- **WHEN** serializing a value for blind index computation
- **THEN** String SHALL be normalized with trim + lowercase
- **AND** Integer/Long/Short/Byte SHALL be serialized as `value.toString()`
- **AND** BigDecimal SHALL be serialized as `value.toString()` (no scientific notation)
- **AND** Boolean SHALL be serialized as `"true"` or `"false"`
- **AND** LocalDate SHALL be serialized as `"YYYY-MM-DD"`
- **AND** LocalDateTime SHALL be serialized as `"YYYY-MM-DDTHH:mm:ss"`

#### Scenario: Field name inclusion
- **WHEN** computing blind index
- **THEN** the input SHALL be `HMAC-SHA-256(derivedKey, fieldName + ":" + normalizedValue)`
- **AND** the colon (`0x3A`) SHALL be used as separator between field name and value

#### Scenario: Namespace isolation
- **WHEN** computing blind index for the same value in different namespaces
- **THEN** the blind indexes SHALL be different (due to different HKDF-derived keys)
- **AND** this SHALL match Java BlindIndexEngine behavior verified by golden vectors

### Requirement: Blind index SHALL be stored in encrypted sub-document
The blind index SHALL be stored alongside ciphertext in the `b` field of the encrypted sub-document.

#### Scenario: Blind index storage
- **WHEN** a field is encrypted with `blindIndex: true`
- **THEN** the encrypted sub-document SHALL contain both `c` (String, Base64URL Wire Format V1) and `b` (String blind index)
- **AND** the `b` field SHALL be omitted if `blindIndex: false`

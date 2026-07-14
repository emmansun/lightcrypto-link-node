## ADDED Requirements

### Requirement: Blind index SHALL enable exact-match queries on encrypted fields
The system SHALL generate deterministic HMAC-based blind indexes for encrypted fields with `blindIndex: true` option.

#### Scenario: Blind index generation
- **WHEN** a field has `blindIndex: true`
- **THEN** a blind index SHALL be computed and stored in the `b` field of the encrypted sub-document
- **AND** the same plaintext value SHALL always produce the same blind index

#### Scenario: Blind index format
- **WHEN** computing blind index
- **THEN** the system SHALL compute HMAC-SHA-256(hmacKey, `fieldName:serializedValue`)
- **AND** the output SHALL be Base64URL encoded without padding
- **AND** the blind index SHALL be exactly 43 characters for SHA-256

### Requirement: Blind index computation SHALL be deterministic
Given the same hmacKey, field name, and plaintext value, the blind index SHALL always be identical across Node.js and Java.

#### Scenario: Deterministic serialization
- **WHEN** serializing a value for blind index computation
- **THEN** String SHALL be serialized as raw UTF-8 bytes
- **AND** Integer/Long/Short/Byte SHALL be serialized as `value.toString()`
- **AND** BigDecimal SHALL be serialized as `value.toString()` (no scientific notation)
- **AND** Boolean SHALL be serialized as `"true"` or `"false"`
- **AND** LocalDate SHALL be serialized as `"YYYY-MM-DD"`
- **AND** LocalDateTime SHALL be serialized as `"YYYY-MM-DDTHH:mm:ss"`

#### Scenario: Field name inclusion
- **WHEN** computing blind index
- **THEN** the input SHALL be `HMAC-SHA-256(hmacKey, fieldName + ":" + serializedValue)`
- **AND** the colon (`0x3A`) SHALL be used as separator between field name and value

### Requirement: System SHALL support blind index query rewriting
The system SHALL intercept Mongoose queries and rewrite field name conditions to blind index conditions.

#### Scenario: Exact-match query rewriting
- **WHEN** a query specifies `{ phone: "13800138000" }`
- **AND** the `phone` field has `blindIndex: true`
- **THEN** the query SHALL be rewritten to `{ "phone.b": "<computed-blind-index>" }`
- **AND** the rewritten query SHALL execute against the MongoDB index on `phone.b`

#### Scenario: $in operator query rewriting
- **WHEN** a query specifies `{ phone: { $in: ["13800138000", "13800138001"] } }`
- **AND** the `phone` field has `blindIndex: true`
- **THEN** the query SHALL be rewritten to `{ "phone.b": { $in: ["<index1>", "<index2>"] } }`

### Requirement: Field name SHALL be configurable for cross-entity blind index sharing
The system SHALL allow overriding the default field name used in blind index computation.

#### Scenario: Custom field name
- **WHEN** a field specifies `fieldName: "phone_global"` in the schema
- **THEN** the blind index SHALL be computed using `"phone_global"` instead of the actual field name
- **AND** this SHALL match Java `@Encrypted(fieldName = "phone_global")` behavior

### Requirement: Blind index SHALL be stored in encrypted sub-document
The blind index SHALL be stored alongside ciphertext in the `b` field of the encrypted sub-document.

#### Scenario: Blind index storage
- **WHEN** a field is encrypted with `blindIndex: true`
- **THEN** the encrypted sub-document SHALL contain both `c` (Binary ciphertext) and `b` (String blind index)
- **AND** the `b` field SHALL be omitted if `blindIndex: false`

### Requirement: Range queries SHALL NOT be supported on encrypted fields
The system SHALL NOT support range queries ($gt, $lt, $gte, $lte) on encrypted fields with blind indexes.

#### Scenario: Range query rejection
- **WHEN** a query uses range operators on an encrypted field
- **THEN** the system SHALL NOT rewrite the query to blind index
- **AND** the query SHALL fail or fall back to full collection scan
- **AND** documentation SHALL clearly state this limitation

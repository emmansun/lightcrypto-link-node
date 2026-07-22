## ADDED Requirements

### Requirement: Golden vector suite SHALL validate encryption byte-parity with Java
The system SHALL load and validate against the Java-generated golden vectors for all supported encryption algorithms.

#### Scenario: AES-256-GCM vector validation
- **WHEN** encrypting with key, IV, namespace, and dekVersion from `vectors/encryption/aes-256-gcm.json`
- **THEN** the Wire Format output hex SHALL match `expected.wireFormatHex` exactly
- **AND** the ciphertext hex SHALL match `expected.ciphertextHex` exactly

#### Scenario: AES-256-CBC vector validation
- **WHEN** encrypting with parameters from `vectors/encryption/aes-256-cbc.json`
- **THEN** the Wire Format output hex SHALL match `expected.wireFormatHex` exactly

#### Scenario: SM4-CBC vector validation
- **WHEN** encrypting with parameters from `vectors/encryption/sm4-cbc.json`
- **THEN** the Wire Format output hex SHALL match `expected.wireFormatHex` exactly

### Requirement: Golden vector suite SHALL validate blind index determinism with Java
The system SHALL validate blind index computation against Java-generated vectors.

#### Scenario: Blind index vector validation
- **WHEN** computing blind index with masterHmacKey, namespace, fieldName, and plaintext from `vectors/blind-index/hmac-sha256.json`
- **THEN** the derived HMAC key hex SHALL match `expected.derivedHmacKeyHex`
- **AND** the blind index Base64URL SHALL match `expected.blindIndexBase64url`

#### Scenario: Namespace isolation validation
- **WHEN** computing blind index for same plaintext with different namespaces (bi-003 vs bi-004)
- **THEN** the blind indexes SHALL be different (tenant isolation verified)

### Requirement: Golden vector suite SHALL validate KCV computation with Java
The system SHALL validate Key Check Value computation against Java-generated vectors.

#### Scenario: KCV vector validation
- **WHEN** computing KCV with key from `vectors/kcv/kcv.json`
- **THEN** the KCV hex SHALL match `expectedKcvHex` for each algorithm
- **AND** binding hex SHALL match `expectedBindingHex`

### Requirement: Golden vector suite SHALL validate roundtrip with Java
The system SHALL validate encrypt-then-decrypt roundtrip against Java-generated vectors.

#### Scenario: Roundtrip vector validation
- **WHEN** decrypting `expected.wireFormatBase64url` from `vectors/roundtrip/roundtrip.json` with the given key
- **THEN** the decrypted plaintext hex SHALL match `input.plaintextHex`
- **AND** re-encrypting with the same IV SHALL reproduce the same Wire Format blob

### Requirement: Golden vectors SHALL be copied into the Node.js test directory
The system SHALL maintain a local copy of the Java vectors for CI independence.

#### Scenario: Vector file location
- **WHEN** running golden vector tests
- **THEN** vectors SHALL be loaded from `test/vectors/` directory
- **AND** the directory structure SHALL mirror Java: `encryption/`, `blind-index/`, `kcv/`, `roundtrip/`
- **AND** `manifest.json` SHALL be included for version tracking

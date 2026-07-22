## MODIFIED Requirements

### Requirement: Encrypted sub-document format SHALL be 100% compatible with Java LightCrypto-Link
The encrypted field SHALL be stored as a BSON sub-document with exact field names and value ranges matching Java implementation.

#### Scenario: Field structure validation
- **WHEN** a field is encrypted
- **THEN** the sub-document SHALL contain exactly: `_e` (Integer 1), `_k` (String kid), `_a` (String algorithm), `_t` (String type marker), `c` (String, Base64URL Wire Format V1 blob), and optional `b` (String blind index)
- **AND** the `_e` field SHALL always equal 1

#### Scenario: Ciphertext format (Wire Format V1)
- **WHEN** using any supported algorithm (AES-256-GCM, AES-256-CBC, SM4-CBC)
- **THEN** the `c` field SHALL contain a Base64URL-encoded (no padding) Wire Format V1 string
- **AND** the Wire Format blob SHALL encode: version, algorithmId, namespace, dekVersion, iv, aadExt, ciphertext

### Requirement: System SHALL support AES-256-GCM encryption
The system SHALL implement AES-256-GCM with 12-byte IV, GCM authentication tag, and AAD binding as the default algorithm.

#### Scenario: AES-256-GCM encryption
- **WHEN** a field is encrypted with AES-256-GCM
- **THEN** a 12-byte random IV SHALL be generated externally
- **AND** AAD SHALL be constructed as `[0x01][algId=0x01][namespace UTF-8][dekVersion 4B BE]`
- **AND** the AAD SHALL be passed to the GCM cipher via `setAAD()`
- **AND** the encryptor SHALL return `ciphertext‖tag` (without IV)
- **AND** the IV and ciphertext SHALL be assembled into Wire Format V1 blob

#### Scenario: AES-256-GCM decryption
- **WHEN** decrypting AES-256-GCM from a Wire Format V1 blob
- **THEN** the system SHALL decode the blob to extract IV, namespace, dekVersion, and ciphertext
- **AND** the AAD SHALL be reconstructed from the decoded fields
- **AND** the GCM Auth Tag SHALL be verified (with AAD) before returning plaintext

### Requirement: System SHALL support AES-256-CBC encryption
The system SHALL implement AES-256-CBC with 16-byte IV and PKCS5 padding.

#### Scenario: AES-256-CBC encryption
- **WHEN** a field is encrypted with AES-256-CBC
- **THEN** a 16-byte random IV SHALL be generated externally
- **AND** the plaintext SHALL be padded to 16-byte block boundaries using PKCS5
- **AND** the encryptor SHALL return padded ciphertext (without IV)
- **AND** the IV and ciphertext SHALL be assembled into Wire Format V1 blob
- **AND** AAD parameter SHALL be ignored (CBC does not use AAD)

#### Scenario: AES-256-CBC decryption
- **WHEN** decrypting AES-256-CBC from a Wire Format V1 blob
- **THEN** the system SHALL decode the blob to extract IV and ciphertext
- **AND** PKCS5 padding SHALL be removed after decryption

### Requirement: System SHALL support SM4-CBC encryption
The system SHALL implement SM4-CBC with 16-byte IV, 16-byte key, and PKCS5 padding for China compliance.

#### Scenario: SM4-CBC encryption
- **WHEN** a field is encrypted with SM4-CBC
- **THEN** a 16-byte random IV SHALL be generated externally
- **AND** the key SHALL be exactly 16 bytes (128-bit SM4 key)
- **AND** the plaintext SHALL be padded using PKCS5
- **AND** the encryptor SHALL return padded ciphertext (without IV)
- **AND** the IV and ciphertext SHALL be assembled into Wire Format V1 blob

#### Scenario: SM4-CBC decryption
- **WHEN** decrypting SM4-CBC from a Wire Format V1 blob
- **THEN** the system SHALL decode the blob to extract IV and ciphertext
- **AND** PKCS5 padding SHALL be removed after decryption

### Requirement: KCV (Key Check Value) SHALL be computed deterministically
The system SHALL compute KCV to verify key integrity during vault loading, matching Java vectors.

#### Scenario: KCV computation for AES-256-GCM
- **WHEN** computing KCV for AES-256-GCM
- **THEN** the system SHALL use a 12-byte zero IV and 16-byte zero block
- **AND** the output SHALL be lowercase hex of `[encrypted zero block ‖ auth tag]` (32 bytes = 64 hex chars)
- **AND** the output SHALL match Java vector `kcv-aes256gcm-dek`

#### Scenario: KCV computation for CBC modes
- **WHEN** computing KCV for AES-256-CBC or SM4-CBC
- **THEN** the system SHALL use a 16-byte zero IV and 16-byte zero block
- **AND** the output SHALL be lowercase hex of the encrypted zero block (32 bytes with PKCS5 padding = 64 hex chars)

## ADDED Requirements

### Requirement: Field-level encryption MUST transparently encrypt Mongoose schema fields
The system SHALL automatically encrypt fields marked with `encrypt: true` before saving to MongoDB and decrypt them after retrieval.

#### Scenario: Pre-save encryption
- **WHEN** a Mongoose document with encrypted fields is saved
- **THEN** the plaintext values SHALL be replaced with encrypted sub-documents containing `_e`, `_k`, `_a`, `_t`, `c`, and optional `b` fields

#### Scenario: Post-find decryption
- **WHEN** a Mongoose document is retrieved from MongoDB
- **THEN** encrypted sub-documents SHALL be replaced with their original plaintext values

#### Scenario: Algorithm agility
- **WHEN** multiple algorithms are supported (AES-256-GCM, AES-256-CBC, SM4-CBC)
- **THEN** each encrypted field SHALL store its algorithm identifier in the `_a` field
- **AND** the system SHALL dispatch to the correct algorithm during decryption

### Requirement: Encrypted sub-document format SHALL be 100% compatible with Java LightCrypto-Link
The encrypted field SHALL be stored as a BSON sub-document with exact field names and value ranges matching Java implementation.

#### Scenario: Field structure validation
- **WHEN** a field is encrypted
- **THEN** the sub-document SHALL contain exactly: `_e` (Integer 1), `_k` (String kid), `_a` (String algorithm), `_t` (String type marker), `c` (Binary ciphertext), and optional `b` (String blind index)
- **AND** the `_e` field SHALL always equal 1

#### Scenario: Ciphertext format
- **WHEN** using AES-256-GCM
- **THEN** the `c` field SHALL contain `[12-byte IV] || [ciphertext] || [16-byte Auth Tag]`
- **WHEN** using AES-256-CBC or SM4-CBC
- **THEN** the `c` field SHALL contain `[16-byte IV] || [PKCS5-padded ciphertext]`

### Requirement: System SHALL support AES-256-GCM encryption
The system SHALL implement AES-256-GCM with 12-byte IV and GCM authentication tag as the default algorithm.

#### Scenario: AES-256-GCM encryption
- **WHEN** a field is encrypted with AES-256-GCM
- **THEN** a 12-byte random IV SHALL be generated
- **AND** the output SHALL be `[IV] || [ciphertext + 16-byte Auth Tag]`
- **AND** the Auth Tag SHALL be appended to the ciphertext (not separate)

#### Scenario: AES-256-GCM decryption
- **WHEN** decrypting AES-256-GCM ciphertext
- **THEN** the system SHALL extract IV (first 12 bytes), ciphertext, and Auth Tag (last 16 bytes)
- **AND** the GCM Auth Tag SHALL be verified before returning plaintext

### Requirement: System SHALL support AES-256-CBC encryption
The system SHALL implement AES-256-CBC with 16-byte IV and PKCS5 padding for legacy compatibility.

#### Scenario: AES-256-CBC encryption
- **WHEN** a field is encrypted with AES-256-CBC
- **THEN** a 16-byte random IV SHALL be generated
- **AND** the plaintext SHALL be padded to 16-byte block boundaries using PKCS5
- **AND** the output SHALL be `[IV] || [padded ciphertext]`

#### Scenario: AES-256-CBC decryption
- **WHEN** decrypting AES-256-CBC ciphertext
- **THEN** the system SHALL extract IV (first 16 bytes) and ciphertext
- **AND** PKCS5 padding SHALL be removed after decryption

### Requirement: System SHALL support SM4-CBC encryption
The system SHALL implement SM4-CBC with 16-byte IV, 16-byte key, and PKCS5 padding for China compliance.

#### Scenario: SM4-CBC encryption
- **WHEN** a field is encrypted with SM4-CBC
- **THEN** a 16-byte random IV SHALL be generated
- **AND** the key SHALL be exactly 16 bytes (128-bit SM4 key)
- **AND** the plaintext SHALL be padded using PKCS5
- **AND** the output SHALL be `[IV] || [padded ciphertext]`

#### Scenario: SM4-CBC decryption
- **WHEN** decrypting SM4-CBC ciphertext
- **THEN** the system SHALL extract IV (first 16 bytes) and ciphertext
- **AND** PKCS5 padding SHALL be removed after decryption

### Requirement: KCV (Key Check Value) SHALL be computed deterministically
The system SHALL compute KCV to verify key integrity during vault loading.

#### Scenario: KCV computation for AES-256-GCM
- **WHEN** computing KCV for AES-256-GCM
- **THEN** the system SHALL use a 12-byte zero IV and 16-byte zero block
- **AND** the output SHALL be a lowercase hex string of the encrypted zero block

#### Scenario: KCV computation for CBC modes
- **WHEN** computing KCV for AES-256-CBC or SM4-CBC
- **THEN** the system SHALL use a 16-byte zero IV and 16-byte zero block
- **AND** the output SHALL be a lowercase hex string of the encrypted zero block

### Requirement: System SHALL enforce zero third-party crypto dependencies
All encryption SHALL use native Node.js `crypto` module. No external crypto libraries SHALL be mandatory.

#### Scenario: Native crypto usage
- **WHEN** encrypting or decrypting
- **THEN** the system SHALL use `crypto.createCipheriv()` / `crypto.createDecipheriv()` with algorithm names: `aes-256-gcm`, `aes-256-cbc`, `sm4-cbc`
- **AND** no external crypto library SHALL be required for basic operation

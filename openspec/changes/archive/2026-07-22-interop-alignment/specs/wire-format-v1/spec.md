## ADDED Requirements

### Requirement: Wire Format V1 encoder SHALL produce byte-identical output to Java WireFormatEncoder
The system SHALL encode encrypted payloads into Wire Format V1 binary blobs matching the Java byte layout exactly.

#### Scenario: Binary blob layout
- **WHEN** encoding with algorithm, namespace, dekVersion, iv, and ciphertext
- **THEN** the output SHALL be: `[1B version=0x01][1B algId][2B nsLen big-endian][NB namespace UTF-8][4B dekVersion big-endian][1B ivLen][IV bytes][2B aadExtLen=0x0000][ciphertext bytes]`
- **AND** nsLen SHALL be the UTF-8 byte length of the canonical namespace string
- **AND** dekVersion SHALL be ≥ 1

#### Scenario: Base64URL encoding for storage
- **WHEN** encoding for MongoDB storage
- **THEN** the binary blob SHALL be Base64URL-encoded without padding
- **AND** the output SHALL be a JavaScript string (not Buffer)

#### Scenario: Empty namespace rejection
- **WHEN** namespace is empty or zero-length
- **THEN** the encoder SHALL throw an error

#### Scenario: Maximum namespace length
- **WHEN** namespace UTF-8 bytes exceed 65535
- **THEN** the encoder SHALL throw an error

### Requirement: Wire Format V1 decoder SHALL parse blobs produced by Java WireFormatDecoder
The system SHALL decode Wire Format V1 binary blobs back into constituent fields.

#### Scenario: Successful decode
- **WHEN** decoding a valid Wire Format V1 blob
- **THEN** the decoder SHALL return: version (0x01), algorithmId, namespace (string), dekVersion (int), iv (Buffer), aadExt (Buffer, empty in V1), ciphertext (Buffer)

#### Scenario: Base64URL decode
- **WHEN** decoding a Base64URL-encoded Wire Format V1 string
- **THEN** the decoder SHALL first Base64URL-decode (no padding) then parse the binary blob

#### Scenario: Version validation
- **WHEN** the first byte is not 0x01
- **THEN** the decoder SHALL throw an error indicating unsupported wire format version

#### Scenario: Truncated blob detection
- **WHEN** the blob is shorter than 12 bytes (minimum size)
- **THEN** the decoder SHALL throw an error

#### Scenario: Empty ciphertext rejection
- **WHEN** the blob contains no ciphertext bytes after parsing all headers
- **THEN** the decoder SHALL throw an error

### Requirement: AlgorithmId registry SHALL map algorithm names to 1-byte wire identifiers
The system SHALL maintain a registry of supported algorithms with their wire format byte identifiers.

#### Scenario: Algorithm ID mapping
- **WHEN** looking up algorithm identifiers
- **THEN** AES_256_GCM SHALL map to 0x01 (ivLen=12, keyLen=32)
- **AND** AES_256_CBC SHALL map to 0x02 (ivLen=16, keyLen=32)
- **AND** SM4_CBC SHALL map to 0x04 (ivLen=16, keyLen=16)

#### Scenario: Reverse lookup
- **WHEN** looking up by byte identifier
- **THEN** the system SHALL return the corresponding algorithm name and parameters
- **AND** unknown byte identifiers SHALL throw an error

#### Scenario: GCM detection
- **WHEN** querying whether an algorithm uses GCM mode
- **THEN** AES_256_GCM SHALL return true
- **AND** AES_256_CBC and SM4_CBC SHALL return false

### Requirement: AAD construction SHALL match Java WireFormatEncoder.buildAad()
The system SHALL construct Additional Authenticated Data for GCM modes identical to Java.

#### Scenario: AAD byte layout
- **WHEN** constructing AAD for GCM encryption
- **THEN** AAD SHALL be: `[0x01][algId byte][namespace UTF-8 bytes][dekVersion 4B big-endian]`
- **AND** total AAD length SHALL be 1 + 1 + nsLen + 4

#### Scenario: AAD reconstruction from decoded blob
- **WHEN** a Wire Format V1 blob is decoded
- **THEN** the AAD SHALL be reconstructable from the decoded fields (algorithm, namespace, dekVersion)
- **AND** the reconstructed AAD SHALL be byte-identical to the AAD used during encryption

### Requirement: SymmetricEncryptor interface SHALL accept explicit IV and AAD parameters
The encryptor interface SHALL be refactored to match Java's stateless, purely-functional design.

#### Scenario: Encrypt signature
- **WHEN** encrypting data
- **THEN** the encryptor SHALL accept (key, iv, plaintext, aad) parameters
- **AND** IV SHALL be generated externally (by CryptoCodec)
- **AND** the return value SHALL be ciphertext only (GCM: CT‖Tag; CBC: PKCS7-padded CT)
- **AND** the return value SHALL NOT include the IV

#### Scenario: Decrypt signature
- **WHEN** decrypting data
- **THEN** the encryptor SHALL accept (key, iv, ciphertext, aad) parameters
- **AND** GCM mode SHALL verify the authentication tag before returning plaintext
- **AND** CBC mode SHALL ignore the aad parameter

#### Scenario: GCM AAD binding
- **WHEN** encrypting with AES-256-GCM and non-empty AAD
- **THEN** the AAD SHALL be passed to `cipher.setAAD(aad)` before encryption
- **AND** decryption with mismatched AAD SHALL fail with authentication error

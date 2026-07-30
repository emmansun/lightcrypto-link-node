## MODIFIED Requirements

### Requirement: Wire Format V1 decoder SHALL parse blobs produced by Java WireFormatDecoder
The system SHALL decode Wire Format V1 binary blobs back into constituent fields. All parse failures SHALL throw `PayloadCorruptionError` with structured context.

#### Scenario: Successful decode
- **WHEN** decoding a valid Wire Format V1 blob
- **THEN** the decoder SHALL return: version (0x01), algorithmId, namespace (string), dekVersion (int), iv (Buffer), aadExt (Buffer, empty in V1), ciphertext (Buffer)

#### Scenario: Base64URL decode
- **WHEN** decoding a Base64URL-encoded Wire Format V1 string
- **THEN** the decoder SHALL first Base64URL-decode (no padding) then parse the binary blob

#### Scenario: Version validation
- **WHEN** the first byte is not 0x01
- **THEN** the decoder SHALL throw `PayloadCorruptionError` with `.cause` containing the version detail

#### Scenario: Truncated blob detection
- **WHEN** the blob is shorter than 12 bytes (minimum size)
- **THEN** the decoder SHALL throw `PayloadCorruptionError` with `.blobLength` set to actual length and `.expectedMinLength` set to 12

#### Scenario: Empty ciphertext rejection
- **WHEN** the blob contains no ciphertext bytes after parsing all headers
- **THEN** the decoder SHALL throw `PayloadCorruptionError`

#### Scenario: Non-Buffer input rejection
- **WHEN** the input to `decode()` is not a Buffer
- **THEN** the decoder SHALL throw `PayloadCorruptionError` with `.blobLength` set to 0

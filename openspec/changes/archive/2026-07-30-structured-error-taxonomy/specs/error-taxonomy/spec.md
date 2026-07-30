## ADDED Requirements

### Requirement: LclCryptoError base class with structured context
The system SHALL provide a `LclCryptoError` base class (extending `Error`) that all crypto-related errors inherit from. Every instance SHALL carry a machine-readable `.code` string and optional structured context fields.

#### Scenario: Base class fields
- **WHEN** any LclCryptoError subclass is instantiated
- **THEN** it SHALL have `.name` set to the subclass name
- **AND** `.code` set to a stable machine-readable identifier (e.g., `'ERR_LCL_PAYLOAD_CORRUPTION'`)
- **AND** optional `.namespace` (string), `.dekVersion` (number), `.kid` (string), `.fieldName` (string)
- **AND** optional `.cause` (Error) preserving the original underlying error

#### Scenario: instanceof checks work across hierarchy
- **WHEN** a `PayloadCorruptionError` is thrown
- **THEN** `err instanceof LclCryptoError` SHALL be true
- **AND** `err instanceof PayloadCorruptionError` SHALL be true
- **AND** `err instanceof Error` SHALL be true

### Requirement: PayloadCorruptionError for unparseable ciphertext
The system SHALL throw `PayloadCorruptionError` (code: `ERR_LCL_PAYLOAD_CORRUPTION`) when a ciphertext blob cannot be parsed due to structural corruption.

#### Scenario: Truncated wire format blob
- **WHEN** a Wire Format V1 blob is shorter than the minimum size (12 bytes)
- **THEN** the system SHALL throw `PayloadCorruptionError` with `.blobLength` set to actual length and `.expectedMinLength` set to 12

#### Scenario: Unsupported wire format version
- **WHEN** the first byte of a blob is not 0x01
- **THEN** the system SHALL throw `PayloadCorruptionError` with the original version error as `.cause`

#### Scenario: Non-Buffer/non-string ciphertext input
- **WHEN** ciphertext is neither a string nor a Buffer
- **THEN** the system SHALL throw `PayloadCorruptionError`

### Requirement: KeyResolutionError for missing decryption keys
The system SHALL throw `KeyResolutionError` (code: `ERR_LCL_KEY_RESOLUTION`) when the required DEK or vault cannot be found during decryption.

#### Scenario: Vault not found on decrypt path
- **WHEN** `getDekByVersion(namespace, dekVersion)` is called and no vault document exists for the namespace
- **THEN** the system SHALL throw `KeyResolutionError` with `.namespace` set and `.vaultExists` set to `false`
- **AND** the system SHALL NOT create a vault document

#### Scenario: DEK version not found
- **WHEN** `getDekByVersion(namespace, dekVersion)` is called and the vault exists but has no entry for the requested dekVersion
- **THEN** the system SHALL throw `KeyResolutionError` with `.namespace`, `.dekVersion`, and `.vaultExists` set to `true`

#### Scenario: Kid not found
- **WHEN** `getKeyPair(namespace, kid)` is called and no key entry matches the kid
- **THEN** the system SHALL throw `KeyResolutionError` with `.namespace` and `.kid` set

### Requirement: CryptoAuthenticationError for auth tag / padding failures
The system SHALL throw `CryptoAuthenticationError` (code: `ERR_LCL_CRYPTO_AUTH`) when cryptographic authentication fails during decryption (AES-GCM auth tag mismatch or AES-CBC padding error).

#### Scenario: AES-GCM auth tag verification failure
- **WHEN** AES-256-GCM decryption fails due to auth tag mismatch
- **THEN** the system SHALL throw `CryptoAuthenticationError` with `.cause` set to the original Node.js crypto error
- **AND** `.namespace` and `.dekVersion` set from the wire format header

#### Scenario: AES-CBC padding error
- **WHEN** AES-CBC decryption fails due to invalid padding
- **THEN** the system SHALL throw `CryptoAuthenticationError` with `.cause` set to the original error

### Requirement: SchemaDriftError for type deserialization failures
The system SHALL throw `SchemaDriftError` (code: `ERR_LCL_SCHEMA_DRIFT`) when decryption succeeds but the plaintext cannot be deserialized according to the stored type marker.

#### Scenario: Type deserialization failure
- **WHEN** `TypeDeserializer.deserialize(typeMarker, stringValue)` throws an error
- **THEN** the system SHALL throw `SchemaDriftError` with `.typeMarker` set to the stored type marker
- **AND** `.rawBytes` set to the decrypted plaintext Buffer
- **AND** `.cause` set to the original deserialization error

### Requirement: UnsupportedAlgorithmError for unregistered algorithms
The system SHALL throw `UnsupportedAlgorithmError` (code: `ERR_LCL_UNSUPPORTED_ALGORITHM`) when an algorithm identifier is not recognized by the CryptoCodec registry.

#### Scenario: Unknown algorithm in sub-document
- **WHEN** `decryptField` encounters an `_a` field value not registered in CryptoCodec
- **THEN** the system SHALL throw `UnsupportedAlgorithmError` with `.algorithm` set to the unrecognized identifier

#### Scenario: No algorithm specified
- **WHEN** neither `_a` field nor default algorithm is available
- **THEN** the system SHALL throw `UnsupportedAlgorithmError` with `.algorithm` set to `null`

### Requirement: Decrypt failure EventBus emission
The system SHALL emit a structured event via EventBus when a field decryption fails in the plugin decrypt path.

#### Scenario: CryptoAuthenticationError emits L3 event
- **WHEN** a `CryptoAuthenticationError` occurs during `decryptSubDoc`
- **THEN** the system SHALL emit `lcl.decrypt.field.failed` with tier=L3 (Audit)
- **AND** attributes SHALL include `namespace`, `dekVersion`, `errorType: 'CryptoAuthenticationError'`, `errorCode`

#### Scenario: KeyResolutionError emits L2 event
- **WHEN** a `KeyResolutionError` occurs during `decryptSubDoc`
- **THEN** the system SHALL emit `lcl.decrypt.field.failed` with tier=L2 (Operational)

#### Scenario: SchemaDriftError emits L1 event
- **WHEN** a `SchemaDriftError` occurs during `decryptSubDoc`
- **THEN** the system SHALL emit `lcl.decrypt.field.failed` with tier=L1 (Diagnostic)

#### Scenario: Event emission does not suppress original error
- **WHEN** a decrypt failure event is emitted
- **THEN** the original error SHALL still be re-thrown to the caller after emission

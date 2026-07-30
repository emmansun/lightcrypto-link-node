## MODIFIED Requirements

### Requirement: FieldCryptoService SHALL use StorageAdapter for payload construction
The system SHALL delegate encrypted payload building and parsing to the StorageAdapter interface. Decryption failures SHALL throw typed errors from the `LclCryptoError` hierarchy.

#### Scenario: Encryption output
- **WHEN** encrypting a field via FieldCryptoService
- **THEN** the service SHALL call `storageAdapter.buildEncryptedPayload(blob, typeMarker, blindIndex)` to construct the output
- **AND** the output format SHALL be determined by the StorageAdapter implementation

#### Scenario: Decryption input
- **WHEN** decrypting a field via FieldCryptoService
- **THEN** the service SHALL call `storageAdapter.extractBlob(payload)` to retrieve the wire-format blob
- **AND** it SHALL call `storageAdapter.extractTypeMarker(payload)` to determine the deserialization type

#### Scenario: StorageAdapter injection
- **WHEN** constructing FieldCryptoService
- **THEN** it SHALL accept a `storageAdapter` parameter
- **AND** if not provided, it SHALL default to `MongooseStorageAdapter`

#### Scenario: Missing ciphertext throws PayloadCorruptionError
- **WHEN** `extractBlob(payload)` returns null or undefined
- **THEN** the service SHALL throw `PayloadCorruptionError` indicating missing ciphertext field

#### Scenario: Crypto failure throws CryptoAuthenticationError
- **WHEN** `CryptoCodec.decrypt()` throws due to auth tag or padding failure
- **THEN** the service SHALL propagate the `CryptoAuthenticationError` without wrapping

#### Scenario: Algorithm not recognized throws UnsupportedAlgorithmError
- **WHEN** the resolved algorithm (from `_a` field or default) is not registered in CryptoCodec
- **THEN** the service SHALL throw `UnsupportedAlgorithmError` with `.algorithm` set

#### Scenario: No algorithm available throws UnsupportedAlgorithmError
- **WHEN** neither `_a` field nor default algorithm parameter is provided
- **THEN** the service SHALL throw `UnsupportedAlgorithmError` with `.algorithm` set to null

#### Scenario: Type deserialization failure throws SchemaDriftError
- **WHEN** decryption succeeds but `TypeDeserializer.deserialize(typeMarker, stringValue)` throws
- **THEN** the service SHALL throw `SchemaDriftError` with `.typeMarker`, `.rawBytes`, and `.cause` set

#### Scenario: Invalid encryption marker throws PayloadCorruptionError
- **WHEN** `_e` field is present but not equal to 1
- **THEN** the service SHALL throw `PayloadCorruptionError` indicating invalid encryption marker

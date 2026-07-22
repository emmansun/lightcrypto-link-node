## MODIFIED Requirements

### Requirement: FieldCryptoService SHALL use StorageAdapter for payload construction
The system SHALL delegate encrypted payload building and parsing to the StorageAdapter interface.

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

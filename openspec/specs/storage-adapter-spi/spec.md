## ADDED Requirements

### Requirement: StorageAdapter SHALL define an interface for encrypted payload construction and parsing
The system SHALL provide a StorageAdapter abstract class for building and extracting encrypted field payloads.

#### Scenario: Interface methods
- **WHEN** implementing a StorageAdapter
- **THEN** it SHALL implement: `buildEncryptedPayload(blob, typeMarker, blindIndex)`, `extractBlob(payload)`, `extractTypeMarker(payload)`, `extractBlindIndex(payload)`, `isEncryptedPayload(value)`
- **AND** unimplemented methods SHALL throw `Error('Not implemented')`

#### Scenario: buildEncryptedPayload
- **WHEN** calling `buildEncryptedPayload(blob, typeMarker, blindIndex)`
- **THEN** it SHALL return an object containing the wire-format blob, type marker, and optional blind index
- **AND** blindIndex SHALL be omitted from the result if null

#### Scenario: extractBlob
- **WHEN** calling `extractBlob(payload)` with an encrypted payload object
- **THEN** it SHALL return the Base64URL wire-format blob string

#### Scenario: extractTypeMarker
- **WHEN** calling `extractTypeMarker(payload)`
- **THEN** it SHALL return the type marker string (e.g., "STR", "INT", "DOC")

#### Scenario: extractBlindIndex
- **WHEN** calling `extractBlindIndex(payload)`
- **THEN** it SHALL return the blind index value or `null` if absent

#### Scenario: isEncryptedPayload
- **WHEN** calling `isEncryptedPayload(value)`
- **THEN** it SHALL return `true` if the value is an encrypted payload object, `false` otherwise

### Requirement: MongooseStorageAdapter SHALL produce `{c, _e, _t, b}` sub-documents
The system SHALL provide a Mongoose-compatible StorageAdapter implementation.

#### Scenario: Encrypted payload format
- **WHEN** building an encrypted payload
- **THEN** the result SHALL be `{ c: blob, _e: 1, _t: typeMarker }` with optional `b: blindIndex`

#### Scenario: Detection via _e marker
- **WHEN** checking `isEncryptedPayload(value)`
- **THEN** it SHALL return `true` only if `value` is a non-null object with `_e === 1`

#### Scenario: Extraction
- **WHEN** extracting components from a valid payload
- **THEN** `extractBlob` SHALL return `payload.c`
- **AND** `extractTypeMarker` SHALL return `payload._t`
- **AND** `extractBlindIndex` SHALL return `payload.b` or `null`

#### Scenario: Null/invalid handling
- **WHEN** the input to extract methods is null, undefined, or not an object
- **THEN** they SHALL return `null`

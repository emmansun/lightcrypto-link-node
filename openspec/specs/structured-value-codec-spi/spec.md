## ADDED Requirements

### Requirement: StructuredValueCodec SHALL define an interface for structured value serialization
The system SHALL provide a StructuredValueCodec abstract class for encoding and decoding structured values (DOC/COL/MAP).

#### Scenario: Interface methods
- **WHEN** implementing a StructuredValueCodec
- **THEN** it SHALL implement: `encode(structuredValue, typeMarker)`, `decode(data, typeMarker)`
- **AND** unimplemented methods SHALL throw `Error('Not implemented')`

#### Scenario: encode
- **WHEN** calling `encode(value, typeMarker)`
- **THEN** it SHALL return a Buffer containing the serialized binary representation

#### Scenario: decode
- **WHEN** calling `decode(data, typeMarker)`
- **THEN** it SHALL return the deserialized structured value

#### Scenario: Round-trip invariant
- **WHEN** encoding then decoding a value with the same typeMarker
- **THEN** the result SHALL be structurally equivalent to the original value

### Requirement: BsonStructuredValueCodec SHALL use BSON binary format
The system SHALL provide a BSON-based StructuredValueCodec implementation.

#### Scenario: DOC encoding
- **WHEN** encoding with typeMarker "DOC"
- **THEN** the value SHALL be serialized via `BSON.serialize(value)`

#### Scenario: MAP encoding
- **WHEN** encoding with typeMarker "MAP"
- **THEN** the value SHALL be serialized via `BSON.serialize(value)`

#### Scenario: COL encoding
- **WHEN** encoding with typeMarker "COL"
- **THEN** the value SHALL be wrapped as `{ _v: value }` and serialized via `BSON.serialize({ _v: value })`

#### Scenario: DOC/MAP decoding
- **WHEN** decoding with typeMarker "DOC" or "MAP"
- **THEN** the data SHALL be deserialized via `BSON.deserialize(data)`

#### Scenario: COL decoding
- **WHEN** decoding with typeMarker "COL"
- **THEN** the data SHALL be deserialized and `result._v` SHALL be returned

#### Scenario: Invalid typeMarker
- **WHEN** encoding or decoding with an unsupported typeMarker
- **THEN** the system SHALL throw an error

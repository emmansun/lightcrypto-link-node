## MODIFIED Requirements

### Requirement: lclCryptoPlugin SHALL delegate to SPI implementations
The plugin SHALL be refactored from a monolith into an orchestration layer that delegates to SPI interfaces.

#### Scenario: Plugin construction with SPI overrides
- **WHEN** configuring the plugin with `options.storageAdapter`, `options.documentAccessor`, or `options.structuredValueCodec`
- **THEN** the plugin SHALL use the provided implementations instead of defaults

#### Scenario: Default SPI implementations
- **WHEN** no SPI overrides are provided
- **THEN** the plugin SHALL use `MongooseStorageAdapter`, `MongooseDocumentAccessor`, and `BsonStructuredValueCodec` as defaults

#### Scenario: Encrypted payload format unchanged
- **WHEN** encrypting or decrypting fields through the plugin
- **THEN** the encrypted payload SHALL still be `{ c, _e: 1, _t, b? }` sub-document format
- **AND** existing tests SHALL continue to pass without modification

#### Scenario: Query rewriting delegation
- **WHEN** a blind-index query is detected
- **THEN** the plugin SHALL delegate to `MongooseQueryTransformer` for field and value rewriting

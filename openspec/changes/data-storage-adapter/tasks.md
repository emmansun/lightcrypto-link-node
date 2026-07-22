## 1. SPI Interface Definitions (src/spi/)

- [ ] 1.1 Create `src/spi/StorageAdapter.js` — abstract base class with buildEncryptedPayload/extractBlob/extractTypeMarker/extractBlindIndex/isEncryptedPayload (throw 'Not implemented')
- [ ] 1.2 Create `src/spi/DocumentAccessor.js` — abstract base class with getField/setField/isDocumentLike/asList/asMap (throw 'Not implemented')
- [ ] 1.3 Create `src/spi/StructuredValueCodec.js` — abstract base class with encode/decode (throw 'Not implemented')
- [ ] 1.4 Create `src/spi/QueryTransformer.js` — abstract base class with rewriteFieldName/rewriteQueryValue/supportsField (throw 'Not implemented')

## 2. Mongoose/BSON Default Implementations (src/adapter/)

- [ ] 2.1 Create `src/adapter/MongooseStorageAdapter.js` — implements StorageAdapter; payload `{c, _e:1, _t, b?}`; detection via `_e === 1`
- [ ] 2.2 Create `src/adapter/MongooseDocumentAccessor.js` — implements DocumentAccessor; bracket notation field access; isDocumentLike excludes null/Array/Buffer/Date/ObjectId
- [ ] 2.3 Create `src/adapter/BsonStructuredValueCodec.js` — implements StructuredValueCodec; BSON.serialize/deserialize; COL wraps in `{_v: value}`
- [ ] 2.4 Create `src/adapter/MongooseQueryTransformer.js` — implements QueryTransformer; `field + '.b'` rewriting; BlindIndexEngine delegation for value hashing

## 3. SPI Unit Tests

- [ ] 3.1 Write `test/unit/adapter/MongooseStorageAdapter.test.js` — build/extract/isEncrypted + null handling + round-trip
- [ ] 3.2 Write `test/unit/adapter/MongooseDocumentAccessor.test.js` — getField/setField/isDocumentLike/asList/asMap edge cases
- [ ] 3.3 Write `test/unit/adapter/BsonStructuredValueCodec.test.js` — DOC/COL/MAP encode/decode round-trip
- [ ] 3.4 Write `test/unit/adapter/MongooseQueryTransformer.test.js` — rewriteFieldName/rewriteQueryValue/supportsField

## 4. FieldCryptoService Refactor

- [ ] 4.1 Refactor `src/service/FieldCryptoService.js` — accept `storageAdapter` parameter; delegate payload building to `storageAdapter.buildEncryptedPayload()`; delegate extraction to `extractBlob/extractTypeMarker`
- [ ] 4.2 Update `test/unit/service/FieldCryptoService.test.js` — verify StorageAdapter integration

## 5. Plugin Refactor (src/plugin/)

- [ ] 5.1 Refactor `src/plugin/lclCryptoPlugin.js` — extract inline payload construction into MongooseStorageAdapter usage; extract document traversal into MongooseDocumentAccessor usage; extract BSON codec into BsonStructuredValueCodec usage; accept SPI overrides via options
- [ ] 5.2 Refactor `src/plugin/queryRewriter.js` — thin wrapper over MongooseQueryTransformer; maintain backward-compatible `rewriteQuery` export
- [ ] 5.3 Update `test/unit/plugin/lclCryptoPlugin.test.js` — verify SPI delegation + override options
- [ ] 5.4 Update `test/unit/plugin/queryRewriter.test.js` — verify MongooseQueryTransformer integration

## 6. Cleanup & Integration

- [ ] 6.1 Delete `src/crypto/BsonCodec.js` — logic moved to BsonStructuredValueCodec
- [ ] 6.2 Update `src/index.js` — export new SPI classes and Mongoose implementations
- [ ] 6.3 Update `test/unit/index.test.js` — verify new exports
- [ ] 6.4 Run full test suite (`npx jest --forceExit`) and fix any remaining failures

## 7. Documentation Update (docs/ + README.md)

- [ ] 7.1 Update `docs/architecture.md` — add SPI layer description (src/spi/); document StorageAdapter/DocumentAccessor/StructuredValueCodec/QueryTransformer interfaces and their Mongoose implementations
- [ ] 7.2 Update `docs/configuration.md` — document new plugin options (storageAdapter, documentAccessor, structuredValueCodec overrides)
- [ ] 7.3 Update `README.md` — update architecture diagram to show SPI layer; mention pluggable data storage adapters
- [ ] 7.4 Update `docs/troubleshooting.md` — add common issues related to SPI adapter configuration and payload format

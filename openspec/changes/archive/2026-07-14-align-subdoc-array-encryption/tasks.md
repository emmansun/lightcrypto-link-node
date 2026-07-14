## 1. BsonCodec Helper

- [x] 1.1 Create `src/crypto/BsonCodec.js` with `encodeDocument(obj)` → Buffer, `encodeCollection(arr)` → Buffer (wraps `{ _v: arr }`), `decodeDocument(buf)` → plain object, `decodeCollection(buf)` → array (unwraps `_v`), using the `bson` package's `serialize`/`deserialize`
- [x] 1.2 Add unit tests for BsonCodec covering: encode/decode round-trip for simple objects, nested objects, arrays, empty object/array, mixed types, and verify byte output matches Java's `DocumentCodec.encode()` fixture

## 2. FieldCryptoService Structured Type Support

- [x] 2.1 Extend `FieldCryptoService.encryptField()` to accept a `structuredType` option (`'DOC'`/`'COL'`/`'MAP'`); when set, use `BsonCodec` to serialize instead of `TypeSerializer`, skip blind index, and use the structured type marker
- [x] 2.2 Extend `FieldCryptoService.decryptField()` to detect `_t: 'DOC'`/`'COL'`/`'MAP'` and use `BsonCodec` to deserialize instead of `TypeDeserializer`
- [x] 2.3 Add unit tests: encrypt plain object → `_t: 'DOC'` sub-document with no `b` field; decrypt back to object
- [x] 2.4 Add unit tests: encrypt array → `_t: 'COL'` sub-document; decrypt back to array (unwrap `_v`)
- [x] 2.5 Add unit test: decrypt `_t: 'MAP'` sub-document → plain object

## 3. Mongoose Plugin — Whole-Object (DOC) Encryption

- [x] 3.1 Extend `prepareEncryptedSchema()` to extract `mode` option alongside `encrypt`/`blindIndex`/`fieldName`
- [x] 3.2 Extend the plugin's schema-collection phase to detect sub-document Schema instances and nested object definitions with `encrypt: true` and register them as whole-object encrypted fields (`structuredType: 'DOC'`)
- [x] 3.3 Implement mode resolution logic matching Java's `resolveWholeObjectMode()`: AUTO → DOC for POJOs; ELEMENT → error for POJOs; WHOLE → DOC for POJOs
- [x] 3.4 Add validation matching Java's `validateWholeObjectMode()`: throw if `blindIndex: true` combined with whole-object mode
- [x] 3.5 Add integration test: save and findOne round-trip for a sub-document field encrypted as DOC (whole-object)

## 4. Mongoose Plugin — Collection (COL) and Element-Level Encryption

- [x] 4.1 Extend the plugin to detect array-typed encrypted fields and apply mode resolution: AUTO → element-level for scalar arrays, whole-array (COL) for sub-doc arrays; ELEMENT → element-level (reject sub-doc arrays); WHOLE → COL for all arrays
- [x] 4.2 Implement element-level encryption in pre-save hook: iterate over array elements, encrypt each independently as a scalar sub-document
- [x] 4.3 Implement element-level decryption in post-find hooks: iterate over array elements, decrypt each sub-document
- [x] 4.4 Implement whole-array (COL) encryption in pre-save hook: pass entire array to `FieldCryptoService.encryptField()` with `structuredType: 'COL'`
- [x] 4.5 Add integration test: element-level encryption of `[String]` array — save and findOne round-trip
- [x] 4.6 Add integration test: whole-array COL encryption of `[String]` with `mode: 'WHOLE'` — save and findOne round-trip
- [x] 4.7 Add integration test: whole-array COL encryption of `[Schema]` array — save and findOne round-trip
- [x] 4.8 Add test: `mode: 'ELEMENT'` on sub-doc array throws configuration error

## 5. Mongoose Plugin — Nested Path Encryption

- [x] 5.1 Implement nested encrypted field detection: scan sub-document schemas for inner fields with `encrypt: true`, build path metadata with `[FIELD, FIELD]` navigation
- [x] 5.2 Implement nested encryption in pre-save hook: navigate to the parent sub-document, encrypt only the leaf field
- [x] 5.3 Implement nested decryption in post-find hooks: navigate to the parent sub-document, decrypt only the leaf field
- [x] 5.4 Add integration test: nested encrypted field inside sub-document — only `street` encrypted, `city` visible
- [x] 5.5 Implement array element nested path detection: scan array-of-sub-document schemas for inner encrypted fields, build path metadata with `[LIST_ITER, FIELD]` navigation
- [x] 5.6 Implement array element nested encryption/decryption: iterate over array elements, encrypt/decrypt the specific nested field in each
- [x] 5.7 Add integration test: encrypted field inside array of sub-documents — `items[].price` encrypted per-element

## 6. ProgrammaticCryptoService Structured Type Support

- [x] 6.1 Extend `encryptValue()` to detect plain objects and arrays at runtime: objects → `BsonCodec.encodeDocument()` + `_t: 'DOC'`; arrays → `BsonCodec.encodeCollection()` + `_t: 'COL'`
- [x] 6.2 Extend `decryptValue()` to detect `_t: 'DOC'`/`'COL'`/`'MAP'` and use `BsonCodec` to decode (matching Java's `decodeStructuredValue()`)
- [x] 6.3 Add integration test: `encryptValue({ city: "Shanghai" }, 'User')` → `_t: 'DOC'`, then `decryptValue()` restores the object
- [x] 6.4 Add integration test: `encryptValue(["a", "b"], 'User')` → `_t: 'COL'`, then `decryptValue()` restores the array
- [x] 6.5 Add integration test: `decryptDocument()` with DOC and COL fields

## 7. Java Interoperability Tests

- [x] 7.1 Add interop test: construct a Java-style DOC encrypted sub-document (using Java-generated BSON binary fixture) and verify Node.js decrypts it correctly
- [x] 7.2 Add interop test: construct a Java-style COL encrypted sub-document (BSON binary of `{ _v: [...] }`) and verify Node.js decrypts it correctly
- [x] 7.3 Add interop test: construct a Java-style MAP encrypted sub-document and verify Node.js decrypts it correctly
- [x] 7.4 Add interop test: verify Node.js BsonCodec output for a given object is parseable by Java's `RawBsonDocument.decode(DocumentCodec)`
- [x] 7.5 Add interop test: element-level encrypted array — verify each element sub-document format matches Java's output

## 8. Documentation

- [x] 8.1 Update `docs/type-mapping.md` to add `DOC`, `COL`, `MAP` rows to the type compatibility matrix with BSON binary serialization notes
- [x] 8.2 Update `docs/configuration.md` to document the `mode` option (AUTO/ELEMENT/WHOLE) with examples
- [x] 8.3 Document supported schema patterns for sub-document, array, and nested path encryption in `docs/troubleshooting.md`

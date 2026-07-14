## Requirements

### Requirement: BsonCodec SHALL encode and decode structured values as BSON binary
The system SHALL provide a `BsonCodec` helper that serializes plain objects and arrays to BSON binary bytes (matching Java's `BsonBinaryWriter` + `DocumentCodec` output) and deserializes BSON binary bytes back to JavaScript values.

#### Scenario: Encode a plain object as BSON binary
- **WHEN** `BsonCodec.encodeDocument({ street: "123 Main", city: "Shanghai" })` is called
- **THEN** the result SHALL be a `Buffer` containing the BSON binary encoding of the object
- **AND** the output SHALL be byte-compatible with Java `DocumentCodec.encode()` output for the same structure

#### Scenario: Encode a collection as BSON binary with `_v` wrapper
- **WHEN** `BsonCodec.encodeCollection(["a", "b", "c"])` is called
- **THEN** the result SHALL be a `Buffer` containing the BSON binary encoding of `{ _v: ["a", "b", "c"] }`

#### Scenario: Decode BSON binary to a plain object
- **WHEN** `BsonCodec.decodeDocument(<BSON binary buffer>)` is called
- **THEN** the result SHALL be the original plain object

#### Scenario: Decode BSON binary to a collection (unwrap `_v`)
- **WHEN** `BsonCodec.decodeCollection(<BSON binary buffer>)` is called
- **THEN** the result SHALL be the original array (the `_v` field unwrapped)

### Requirement: System SHALL support whole sub-document encryption with `DOC` type marker
The system SHALL serialize a plain JavaScript object to BSON binary via `BsonCodec.encodeDocument()`, encrypt the BSON bytes as a single ciphertext, and store it as a canonical LCL sub-document with `_t: "DOC"`.

#### Scenario: Encrypt a plain object as DOC
- **WHEN** `encryptField({ street: "123 Main", city: "Shanghai" }, 'address', dek, hmacKey, kid, 'AES_256_GCM', { structuredType: 'DOC' })` is called
- **THEN** the result SHALL contain `_t: "DOC"` and `c` as a Buffer of the encrypted BSON binary
- **AND** the sub-document SHALL NOT contain a `b` field (no blind index)

#### Scenario: Decrypt a DOC sub-document
- **WHEN** `decryptField({ _e:1, _k:kid, _a:'AES_256_GCM', _t:'DOC', c:<Buffer> }, dek, hmacKey, 'AES_256_GCM')` is called
- **THEN** the result SHALL be the original plain object

#### Scenario: Round-trip a nested object as DOC
- **WHEN** a plain object with nested objects is encrypted then decrypted
- **THEN** the decrypted value SHALL be structurally equal (deep-equal) to the original

### Requirement: System SHALL support whole collection encryption with `COL` type marker
The system SHALL wrap a JavaScript array as `{ _v: arr }`, serialize to BSON binary via `BsonCodec.encodeCollection()`, encrypt as a single ciphertext, and store with `_t: "COL"`.

#### Scenario: Encrypt an array as COL
- **WHEN** `encryptField(["tag1", "tag2"], 'tags', dek, hmacKey, kid, 'AES_256_GCM', { structuredType: 'COL' })` is called
- **THEN** the result SHALL contain `_t: "COL"` and the ciphertext SHALL be the encryption of the BSON binary for `{ _v: ["tag1", "tag2"] }`

#### Scenario: Decrypt a COL sub-document
- **WHEN** `decryptField({ _e:1, _k:kid, _a:'AES_256_GCM', _t:'COL', c:<Buffer> }, dek, hmacKey, 'AES_256_GCM')` is called
- **THEN** the result SHALL be the original array

#### Scenario: Round-trip an array of sub-objects as COL
- **WHEN** an array containing plain objects is encrypted then decrypted
- **THEN** the decrypted value SHALL be structurally equal to the original array

### Requirement: System SHALL support whole map encryption with `MAP` type marker
The system SHALL serialize a plain object (used as a key-value map) to BSON binary via `BsonCodec.encodeDocument()`, encrypt as a single ciphertext, and store with `_t: "MAP"`.

#### Scenario: Decrypt a MAP sub-document from Java
- **WHEN** `decryptField({ _e:1, _k:kid, _a:'AES_256_GCM', _t:'MAP', c:<Buffer> }, dek, hmacKey, 'AES_256_GCM')` is called
- **THEN** the result SHALL be the original plain object (map)

### Requirement: System SHALL support element-level collection encryption
When `mode: 'ELEMENT'` is configured on an array field, the system SHALL encrypt each array element independently as its own encrypted sub-document.

#### Scenario: Element-level encryption of scalar array
- **WHEN** a schema defines `tags: { type: [String], encrypt: true, mode: 'ELEMENT' }` and a document has `tags: ["a", "b", "c"]`
- **THEN** the stored `tags` field in MongoDB SHALL be an array of three encrypted sub-documents, each with `_e: 1`, `_t: "STR"`, and independent ciphertexts

#### Scenario: Element-level decryption of scalar array
- **WHEN** a document with element-level encrypted array is retrieved
- **THEN** each element SHALL be decrypted independently and the field SHALL be restored to the original array

#### Scenario: Element-level encryption rejects sub-document arrays
- **WHEN** a schema defines `items: { type: [itemSchema], encrypt: true, mode: 'ELEMENT' }` where `itemSchema` is a sub-document schema
- **THEN** the plugin SHALL throw a configuration error (matching Java's validation)

### Requirement: System SHALL support nested path encryption inside sub-documents
The system SHALL support encrypting specific fields nested inside a sub-document, while the container structure remains visible (unencrypted).

#### Scenario: Nested field encryption inside sub-document
- **WHEN** a schema defines `address: { street: { type: String, encrypt: true }, city: String }` and a document has `address: { street: "123 Main", city: "Shanghai" }`
- **THEN** the stored `address` in MongoDB SHALL be `{ street: { _e:1, _t:"STR", ... }, city: "Shanghai" }` (street encrypted, city visible)

#### Scenario: Nested field decryption inside sub-document
- **WHEN** a document with a nested encrypted field is retrieved via `findOne()`
- **THEN** only the encrypted nested field SHALL be decrypted; sibling fields remain unchanged

### Requirement: System SHALL support nested path encryption inside array elements
The system SHALL support encrypting specific fields inside each element of an array of sub-documents (matching Java's `LIST_ITER` + `FIELD` path navigation).

#### Scenario: Encrypted field inside array of sub-documents
- **WHEN** a schema defines `items: [{ sku: String, price: { type: Number, encrypt: true } }]` and a document has `items: [{ sku: "A", price: 100 }, { sku: "B", price: 200 }]`
- **THEN** the stored `items` in MongoDB SHALL be `[{ sku: "A", price: { _e:1, _t:"INT", ... } }, { sku: "B", price: { _e:1, _t:"INT", ... } }]`

#### Scenario: Decryption of nested fields inside array elements
- **WHEN** a document with nested encrypted fields inside array elements is retrieved
- **THEN** each element's encrypted field SHALL be decrypted independently

### Requirement: EncryptionMode SHALL control structured field behavior
The `mode` option on encrypted fields SHALL control whether structured values (sub-documents, collections) are encrypted as a whole unit or element-by-element.

#### Scenario: AUTO mode on sub-document field → whole-object (DOC)
- **WHEN** `address: { type: addressSchema, encrypt: true }` (no mode specified, AUTO default)
- **THEN** the entire address SHALL be encrypted as a single `DOC` sub-document

#### Scenario: AUTO mode on scalar array → element-level
- **WHEN** `tags: { type: [String], encrypt: true }` (no mode specified, AUTO default)
- **THEN** each tag SHALL be encrypted independently (element-level)

#### Scenario: AUTO mode on sub-document array → whole-array (COL)
- **WHEN** `items: { type: [itemSchema], encrypt: true }` (no mode specified, AUTO default)
- **THEN** the entire items array SHALL be encrypted as a single `COL` sub-document

#### Scenario: WHOLE mode on scalar array → whole-array (COL)
- **WHEN** `tags: { type: [String], encrypt: true, mode: 'WHOLE' }`
- **THEN** the entire tags array SHALL be encrypted as a single `COL` sub-document

#### Scenario: ELEMENT mode on sub-document field → configuration error
- **WHEN** `address: { type: addressSchema, encrypt: true, mode: 'ELEMENT' }`
- **THEN** the plugin SHALL throw a configuration error

### Requirement: Blind indexes SHALL NOT be computed for DOC/COL/MAP fields
The system SHALL skip blind index generation for whole-object, whole-collection, and whole-map encrypted fields.

#### Scenario: DOC field with blindIndex: true → error
- **WHEN** a sub-document field is configured with `encrypt: true, blindIndex: true` and mode resolves to whole-object
- **THEN** the plugin SHALL throw a configuration error (matching Java's `validateWholeObjectMode()`)

#### Scenario: COL field with blindIndex: true → error
- **WHEN** an array field is configured with `encrypt: true, blindIndex: true, mode: 'WHOLE'`
- **THEN** the plugin SHALL throw a configuration error

### Requirement: ProgrammaticCryptoService SHALL support DOC/COL/MAP structured values
`encryptValue()` and `decryptValue()` SHALL accept structured values and produce/consume DOC/COL/MAP sub-documents.

#### Scenario: encryptValue with a plain object
- **WHEN** `encryptValue({ name: "Alice", age: 30 }, 'User')` is called and the value type is detected as a structured object
- **THEN** the result SHALL contain `_t: "DOC"` and `_entity: "User"`

#### Scenario: encryptValue with an array
- **WHEN** `encryptValue([1, 2, 3], 'User')` is called
- **THEN** the result SHALL contain `_t: "COL"` and `_entity: "User"`

#### Scenario: decryptValue restores DOC
- **WHEN** `decryptValue({ _e:1, _k:kid, _a:'AES_256_GCM', _t:'DOC', c:<Buffer>, _entity:'User' })` is called
- **THEN** the result SHALL be the original plain object

#### Scenario: decryptValue restores COL
- **WHEN** `decryptValue({ _e:1, _k:kid, _a:'AES_256_GCM', _t:'COL', c:<Buffer>, _entity:'User' })` is called
- **THEN** the result SHALL be the original array

#### Scenario: decryptValue restores MAP from Java
- **WHEN** `decryptValue({ _e:1, _k:kid, _a:'AES_256_GCM', _t:'MAP', c:<Buffer>, _entity:'User' })` is called
- **THEN** the result SHALL be the original plain object (map)

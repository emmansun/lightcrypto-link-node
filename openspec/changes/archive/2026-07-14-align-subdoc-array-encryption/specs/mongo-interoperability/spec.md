## ADDED Requirements

### Requirement: DOC type marker SHALL be interoperable with Java LightCrypto-Link
The Node.js `DOC` encrypted sub-document (BSON binary ciphertext) SHALL be decryptable by Java, and Java-encrypted `DOC` sub-documents SHALL be decryptable by Node.js.

#### Scenario: Node.js encrypt DOC, Java decrypt
- **WHEN** Node.js encrypts a plain object `{ city: "Shanghai", street: "123 Main" }` with `_t: "DOC"`
- **THEN** Java `decryptValue()` SHALL return a `Document` with fields `city = "Shanghai"` and `street = "123 Main"`

#### Scenario: Java encrypt DOC, Node.js decrypt
- **WHEN** Java encrypts a POJO and stores `_t: "DOC"` with BSON binary ciphertext
- **THEN** Node.js `decryptValue()` SHALL return a plain JavaScript object structurally equal to the original POJO

#### Scenario: Nested object round-trip via DOC
- **WHEN** a nested plain object is encrypted by Node.js with `_t: "DOC"` and decrypted by Java
- **THEN** the decrypted structure SHALL be structurally equal to the original

### Requirement: COL type marker SHALL be interoperable with Java LightCrypto-Link
The Node.js `COL` encrypted sub-document (BSON binary of `{ _v: [...] }`) SHALL be decryptable by Java, and Java-encrypted `COL` sub-documents SHALL be decryptable by Node.js.

#### Scenario: Node.js encrypt COL, Java decrypt
- **WHEN** Node.js encrypts an array `["a", "b", "c"]` with `_t: "COL"`
- **THEN** Java `decryptValue()` SHALL return a `List` containing `["a", "b", "c"]`

#### Scenario: Java encrypt COL, Node.js decrypt
- **WHEN** Java encrypts a `List<String>` as `_t: "COL"` with BSON binary of `{ _v: [...] }`
- **THEN** Node.js `decryptValue()` SHALL return a JavaScript array equal to the original list

#### Scenario: Array of sub-objects round-trip via COL
- **WHEN** an array containing plain objects is encrypted by Node.js with `_t: "COL"` and decrypted by Java
- **THEN** Java SHALL return a `List<Document>` structurally equal to the original array

### Requirement: MAP type marker decryption SHALL be interoperable with Java LightCrypto-Link
Node.js SHALL be able to decrypt Java-encrypted `MAP` sub-documents.

#### Scenario: Java encrypt MAP, Node.js decrypt
- **WHEN** Java encrypts a `Map<String, Object>` as `_t: "MAP"` with BSON binary ciphertext
- **THEN** Node.js `decryptValue()` SHALL return a plain JavaScript object structurally equal to the original map

### Requirement: BSON binary encoding SHALL match between Node.js and Java
The BSON binary bytes produced by Node.js `BsonCodec` SHALL be byte-compatible with Java's `BsonBinaryWriter` + `DocumentCodec` output for the same structure.

#### Scenario: BSON encoding of a simple document
- **WHEN** Node.js encodes `{ name: "Alice", age: 30 }` via `BsonCodec.encodeDocument()`
- **THEN** the output bytes SHALL be parseable by Java's `RawBsonDocument.decode(DocumentCodec)`

#### Scenario: BSON encoding of a collection wrapper
- **WHEN** Node.js encodes `["a", "b"]` via `BsonCodec.encodeCollection()`
- **THEN** the output SHALL be the BSON binary of `{ _v: ["a", "b"] }`
- **AND** Java SHALL be able to decode it and extract the `_v` list

#### Scenario: Element-level encrypted array interop
- **WHEN** Node.js encrypts an array with element-level encryption (each element = separate sub-document)
- **THEN** Java SHALL be able to iterate and decrypt each element independently

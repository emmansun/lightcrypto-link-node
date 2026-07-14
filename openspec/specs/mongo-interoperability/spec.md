## ADDED Requirements

### Requirement: Encrypted documents SHALL be 100% interoperable with Java LightCrypto-Link
The system SHALL ensure that documents encrypted by Node.js can be decrypted by Java and vice versa.

#### Scenario: Java → Node.js interoperability
- **WHEN** a document is encrypted by Java LightCrypto-Link and stored in MongoDB
- **AND** Node.js retrieves and decrypts the document
- **THEN** the decrypted values SHALL match the original plaintext
- **AND** blind indexes SHALL match for exact-match queries

#### Scenario: Node.js → Java interoperability
- **WHEN** a document is encrypted by Node.js and stored in MongoDB
- **AND** Java LightCrypto-Link retrieves and decrypts the document
- **THEN** the decrypted values SHALL match the original plaintext
- **AND** the blind indexes SHALL be verifiable by Java

### Requirement: BSON sub-document format SHALL match Java implementation
The encrypted field sub-document structure SHALL exactly match Java's `CryptoBeforeSaveListener.buildEncryptedSubDoc()` output.

#### Scenario: Sub-document field order
- **WHEN** creating an encrypted sub-document
- **THEN** the fields SHALL be stored in this order: `c` (Binary), `_e` (Integer 1), `_t` (String), `_k` (String), `_a` (String), `b` (String optional)
- **AND** MongoDB BSON serialization SHALL preserve this structure

#### Scenario: Binary field encoding
- **WHEN** storing ciphertext in `c` field
- **THEN** the value SHALL be a BSON Binary with subType 0 (generic binary)
- **AND** Node.js Buffer SHALL be correctly serialized as BSON Binary

### Requirement: Key vault format SHALL match Java __lcl_keyvault collection
The vault document structure SHALL be compatible with Java's `KeyVaultDocument` class.

#### Scenario: Vault document schema
- **WHEN** creating a vault document
- **THEN** the `_id` SHALL be `"lcl-dek-{EntityName}"`
- **AND** the structure SHALL match Java's `KeyVaultDocument` class definition
- **AND** Java's `KeyVaultService.loadVaultDocument()` SHALL be able to parse it

#### Scenario: Key version entry structure
- **WHEN** creating a key version entry
- **THEN** the `dek.wrapped` SHALL be stored as BSON Binary
- **AND** the `dek.kcv` SHALL be lowercase hex string
- **AND** the `binding` SHALL be lowercase hex string

### Requirement: CMK provider SHALL match Java provider configuration
The Node.js CMK provider configuration SHALL be compatible with Java's CmkProvider interface.

#### Scenario: Local CMK compatibility
- **WHEN** using local-symmetric CMK provider
- **THEN** the CMK SHALL be 32 bytes (256 bits)
- **AND** the wrapping algorithm SHALL be AES-256-GCM
- **AND** the public reference format SHALL match Java: `"local-cmk-sha256:{8 hex chars}"`

#### Scenario: Azure CMK compatibility
- **WHEN** using Azure Key Vault CMK provider
- **THEN** the algorithm SHALL be RSA-OAEP (matches Java `RSA1_5` or `RSA-OAEP-256`)
- **AND** the encryption context (if any) SHALL match Java's Azure provider configuration

### Requirement: Query rewriting SHALL match Java query translation
The Node.js blind index query rewriting SHALL produce identical MongoDB queries as Java.

#### Scenario: Exact-match query compatibility
- **WHEN** a query specifies `{ phone: "13800138000" }`
- **THEN** the rewritten query SHALL be `{ "phone.b": "<blind-index>" }`
- **AND** the blind index SHALL match Java's output for the same input

#### Scenario: $in query compatibility
- **WHEN** a query uses `$in` operator
- **THEN** the rewritten query SHALL be `{ "phone.b": { $in: [<indexes>] } }`
- **AND** all blind indexes SHALL match Java's output

### Requirement: Type markers SHALL be compatible with Java type system
The `_t` type marker values SHALL exactly match Java's `TypeSerializer.resolveTypeMarker()` output.

#### Scenario: Primitive type compatibility
- **WHEN** Node.js encrypts a String field
- **THEN** the `_t` marker SHALL be `"STR"`
- **WHEN** Node.js encrypts a Number (Integer) field
- **THEN** the `_t` marker SHALL be `"INT"`
- **WHEN** Node.js encrypts a Boolean field
- **THEN** the `_t` marker SHALL be `"BOOL"`

#### Scenario: Java-specific type compatibility
- **WHEN** Node.js reads a Java-encrypted Long field
- **THEN** the `_t` marker SHALL be `"LONG"`
- **AND** the value SHALL be deserialized correctly using mongoose-long

### Requirement: Algorithm identifiers SHALL match Java enum names
The `_a` algorithm field SHALL use the exact string values from Java's `SymmetricAlgorithm` enum.

#### Scenario: Algorithm name compatibility
- **WHEN** storing algorithm identifier
- **THEN** it SHALL be one of: `"AES_256_GCM"`, `"AES_256_CBC"`, `"SM4_GCM"`, `"SM4_CBC"`
- **AND** `"SM4_GCM"` SHALL not be supported by Node.js until OpenSSL 3.3+ is widely available

### Requirement: Error handling SHALL match Java exception behavior
The system SHALL throw errors with messages compatible with Java exception handling.

#### Scenario: Missing kid field
- **WHEN** an encrypted sub-document is missing the `_k` field
- **THEN** the system SHALL throw an error with message containing `"missing '_k' (kid) field"`
- **AND** this SHALL match Java's `FatalCryptoException` message

#### Scenario: Unsupported algorithm
- **WHEN** an encrypted sub-document contains an unsupported algorithm
- **THEN** the system SHALL throw an error with message containing `"Unsupported algorithm"`
- **AND** this SHALL match Java's `DecryptionException` message

### Requirement: DEK rotation SHALL match Java rotation API
The `rotateDek()` method SHALL produce vault documents compatible with Java.

#### Scenario: Rotation compatibility
- **WHEN** Node.js rotates a DEK
- **THEN** the current ACTIVE key SHALL be marked as `"ROTATED"`
- **AND** the new key SHALL have incremented version number
- **AND** the vault document SHALL be parseable by Java's `KeyVaultService`

### Requirement: MongoDB driver SHALL support BSON Binary encoding
The system SHALL correctly encode/decode BSON Binary fields for compatibility with Java.

#### Scenario: Binary encoding
- **WHEN** storing ciphertext in MongoDB
- **THEN** the Node.js Buffer SHALL be serialized as BSON Binary with subType 0
- **AND** Java's MongoDB driver SHALL correctly parse it as `Binary` type

#### Scenario: Binary decoding
- **WHEN** retrieving ciphertext from MongoDB
- **THEN** the BSON Binary SHALL be deserialized as Node.js Buffer
- **AND** the binary data SHALL be byte-for-byte identical to Java's output

## ADDED Requirements (align-subdoc-array-encryption)

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

## Requirements

### Requirement: Constructor accepts service dependencies
The `ProgrammaticCryptoService` SHALL accept a configuration object with `keyVaultService`, `fieldCryptoService`, and optional `algorithm` (defaults to `AES_256_GCM`). The constructor SHALL throw if `keyVaultService` is not provided.

#### Scenario: Successful construction with all dependencies
- **WHEN** `new ProgrammaticCryptoService({ keyVaultService, fieldCryptoService })` is called
- **THEN** the instance SHALL be created with default algorithm `AES_256_GCM`

#### Scenario: Construction with custom algorithm
- **WHEN** `new ProgrammaticCryptoService({ keyVaultService, fieldCryptoService, algorithm: 'AES_256_CBC' })` is called
- **THEN** the instance SHALL use `AES_256_CBC` as the default encryption algorithm

#### Scenario: Construction fails without keyVaultService
- **WHEN** `new ProgrammaticCryptoService({})` is called
- **THEN** the constructor SHALL throw an error with message containing `keyVaultService`

### Requirement: encryptValue encrypts a value by namespace
The system SHALL provide `encryptValue(value, namespace)` that encrypts a value using the active DEK of the specified canonical namespace. The `namespace` parameter SHALL be a namespace string (e.g., `"User#phone"`) that is parsed and canonicalized internally. The result SHALL be a sub-document containing `_e: 1`, `_t: typeMarker`, and `c: Base64URL string`. The sub-document SHALL NOT contain an `_entity` field.

#### Scenario: Encrypt a string value
- **WHEN** `encryptValue('13800138000', 'User#phone')` is called
- **THEN** the system SHALL parse the namespace to `"default.default.User#phone"`
- **AND** use the active DEK of that namespace's vault
- **AND** the result SHALL contain `_e: 1`, `_t: 'STR'`, and `c` as a Base64URL string

#### Scenario: Encrypt a number value
- **WHEN** `encryptValue(42, 'User#phone')` is called
- **THEN** the result SHALL contain `_t: 'INT'` and the serialized number

#### Scenario: Encrypt with custom algorithm
- **WHEN** `encryptValue('secret', 'User#phone', 'SM4_CBC')` is called
- **THEN** the result SHALL contain `_a: 'SM4_CBC'`

#### Scenario: Encrypt null throws
- **WHEN** `encryptValue(null, 'User#phone')` is called
- **THEN** the system SHALL throw an error (Java behavior: throws on null)

#### Scenario: Sub-document does not contain _entity
- **WHEN** `encryptValue('data', 'User#phone')` is called
- **THEN** the result sub-document SHALL NOT contain an `_entity` field

### Requirement: decryptValue decrypts without entityName parameter
The system SHALL provide `decryptValue(encryptedSubDocument)` that decrypts a canonical LCL sub-document WITHOUT requiring an `entityName` parameter. It SHALL decode the Wire Format blob (`c` field) to extract the namespace and dekVersion, then resolve the DEK via `getDekByVersion(namespace, dekVersion)`.

#### Scenario: Decrypt extracts namespace from Wire Format
- **WHEN** `decryptValue({ _e: 1, _t: 'STR', c: '<base64url-blob>' })` is called
- **THEN** the system SHALL decode the blob to extract namespace and dekVersion
- **AND** call `ensureVaultInitialized(namespace)` and `getDekByVersion(namespace, dekVersion)`
- **AND** return the decrypted plaintext

#### Scenario: Decrypt a string sub-document
- **WHEN** `decryptValue({ _e: 1, _t: 'STR', c: '<Buffer>' })` is called
- **THEN** the result SHALL be the original plaintext string

#### Scenario: Decrypt with missing _e marker throws
- **WHEN** `decryptValue({ _t: 'STR', c: '...' })` is called
- **THEN** the system SHALL throw an error about missing `_e`

#### Scenario: Decrypt with missing _t marker throws
- **WHEN** `decryptValue({ _e: 1, c: '...' })` is called
- **THEN** the system SHALL throw an error about missing `_t`

#### Scenario: Decrypt null throws
- **WHEN** `decryptValue(null)` is called
- **THEN** the system SHALL throw an error

### Requirement: decryptDocument delegates to per-field decryption
The system SHALL provide `decryptDocument(rawDocument, entityName, encryptedFields)` that decrypts all specified encrypted fields in a raw MongoDB document. It SHALL mutate the document in-place and return the same reference.

#### Scenario: Decrypt multiple fields in a raw document
- **WHEN** `decryptDocument({ _id: '...', phone: { _e:1, ... }, ssn: { _e:1, ... } }, 'User', ['phone', 'ssn'])` is called
- **THEN** `phone` and `ssn` SHALL be replaced with their plaintext string values

#### Scenario: Skip non-encrypted fields
- **WHEN** `decryptDocument({ _id: '...', name: 'John', phone: { _e:1, ... } }, 'User', ['phone'])` is called
- **THEN** `name` SHALL remain unchanged and `phone` SHALL be decrypted

#### Scenario: Skip fields not present in document
- **WHEN** `decryptDocument({ _id: '...' }, 'User', ['phone'])` is called
- **THEN** the document SHALL be returned unchanged without error

#### Scenario: Mutates input in-place
- **WHEN** `decryptDocument(doc, 'User', ['phone'])` is called
- **THEN** the returned reference SHALL be the same object as `doc`

### Requirement: Round-trip compatibility with Java
The system SHALL produce encrypted sub-documents that are decryptable by the Java `ProgrammaticCryptoService`, and vice versa, for all supported type markers (`STR`, `INT`, `LONG`, `BOOL`, `FLOAT`, `DOUBLE`, `LDATE`, `LDT`, `BYTES`).

#### Scenario: Node.js encrypt, Java decrypt
- **WHEN** Node.js `encryptValue('hello', 'User#phone')` produces a sub-document
- **THEN** Java `decryptValue(subDocument)` SHALL return `"hello"`

#### Scenario: Java encrypt, Node.js decrypt
- **WHEN** Java `encryptValue("hello", User.class)` produces a sub-document
- **THEN** Node.js `decryptValue(subDocument)` SHALL return `"hello"`

### Requirement: Exported from main index
The `ProgrammaticCryptoService` class SHALL be exported from the package's main entry point so consumers can import it as `require('lightcrypto-link-node').ProgrammaticCryptoService`.

#### Scenario: Import from package
- **WHEN** `const { ProgrammaticCryptoService } = require('lightcrypto-link-node')` is executed
- **THEN** `ProgrammaticCryptoService` SHALL be a constructor function

## ADDED Requirements (align-subdoc-array-encryption)

### Requirement: encryptValue SHALL support structured object and array inputs
The `ProgrammaticCryptoService.encryptValue()` method SHALL detect plain objects and arrays, serialize them to BSON binary via `BsonCodec`, and produce `DOC` or `COL` encrypted sub-documents respectively.

#### Scenario: Encrypt a plain object as DOC
- **WHEN** `encryptValue({ name: "Alice", age: 30 }, 'User#address')` is called
- **THEN** the result SHALL contain `_t: "DOC"`, `_e: 1`, `_k` matching the active kid, and `c` as a Buffer of the encrypted BSON binary

#### Scenario: Encrypt an array as COL
- **WHEN** `encryptValue([1, 2, 3], 'User#tags')` is called
- **THEN** the result SHALL contain `_t: "COL"`, `_e: 1`, and `c` as a Buffer of the encrypted BSON binary for `{ _v: [1, 2, 3] }`

#### Scenario: Encrypt a nested object as DOC
- **WHEN** `encryptValue({ address: { city: "Shanghai" }, tags: ["a", "b"] }, 'User#profile')` is called
- **THEN** the result SHALL contain `_t: "DOC"` and the BSON binary ciphertext SHALL include the nested structure

#### Scenario: Encrypt an empty object
- **WHEN** `encryptValue({}, 'User#data')` is called
- **THEN** the result SHALL contain `_t: "DOC"` and the ciphertext SHALL encrypt the BSON binary of an empty document

#### Scenario: Encrypt an empty array
- **WHEN** `encryptValue([], 'User#items')` is called
- **THEN** the result SHALL contain `_t: "COL"` and the ciphertext SHALL encrypt the BSON binary of `{ _v: [] }`

### Requirement: decryptValue SHALL restore structured values from DOC/COL/MAP sub-documents
The `ProgrammaticCryptoService.decryptValue()` method SHALL detect `_t: "DOC"`, `_t: "COL"`, or `_t: "MAP"` and use `BsonCodec` to decode the decrypted BSON binary back to a plain object or array.

#### Scenario: Decrypt a DOC sub-document
- **WHEN** `decryptValue({ _e:1, _k:kid, _a:'AES_256_GCM', _t:'DOC', c:<Buffer> })` is called
- **THEN** the result SHALL be the original plain object

#### Scenario: Decrypt a COL sub-document
- **WHEN** `decryptValue({ _e:1, _k:kid, _a:'AES_256_GCM', _t:'COL', c:<Buffer> })` is called
- **THEN** the result SHALL be the original array (unwrapped from `_v`)

#### Scenario: Decrypt a MAP sub-document from Java
- **WHEN** `decryptValue({ _e:1, _k:kid, _a:'AES_256_GCM', _t:'MAP', c:<Buffer> })` is called
- **THEN** the result SHALL be the original plain object (map)

#### Scenario: Round-trip object through encryptValue/decryptValue
- **WHEN** `decryptValue(await encryptValue({ key: "value" }, 'User#data'))` is called
- **THEN** the result SHALL be deep-equal to `{ key: "value" }`

### Requirement: decryptDocument SHALL handle DOC/COL/MAP encrypted fields
The `ProgrammaticCryptoService.decryptDocument()` method SHALL correctly decrypt fields that are DOC, COL, or MAP encrypted sub-documents.

#### Scenario: Decrypt document with DOC field
- **WHEN** `decryptDocument({ _id: '...', address: { _e:1, _t:'DOC', ... } }, 'User', ['address'])` is called
- **THEN** `address` SHALL be replaced with the original plain object

#### Scenario: Decrypt document with COL field
- **WHEN** `decryptDocument({ _id: '...', tags: { _e:1, _t:'COL', ... } }, 'User', ['tags'])` is called
- **THEN** `tags` SHALL be replaced with the original array

#### Scenario: Decrypt document with MAP field from Java
- **WHEN** `decryptDocument({ _id: '...', metadata: { _e:1, _t:'MAP', ... } }, 'User', ['metadata'])` is called
- **THEN** `metadata` SHALL be replaced with the original plain object (map)

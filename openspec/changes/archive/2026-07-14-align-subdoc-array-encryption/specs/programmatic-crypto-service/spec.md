## ADDED Requirements

### Requirement: encryptValue SHALL support structured object and array inputs
The `ProgrammaticCryptoService.encryptValue()` method SHALL detect plain objects and arrays, serialize them to BSON binary via `BsonCodec`, and produce `DOC` or `COL` encrypted sub-documents respectively.

#### Scenario: Encrypt a plain object as DOC
- **WHEN** `encryptValue({ name: "Alice", age: 30 }, 'User')` is called
- **THEN** the result SHALL contain `_t: "DOC"`, `_entity: "User"`, `_e: 1`, `_k` matching the active kid, and `c` as a Buffer of the encrypted BSON binary

#### Scenario: Encrypt an array as COL
- **WHEN** `encryptValue([1, 2, 3], 'User')` is called
- **THEN** the result SHALL contain `_t: "COL"`, `_entity: "User"`, `_e: 1`, and `c` as a Buffer of the encrypted BSON binary for `{ _v: [1, 2, 3] }`

#### Scenario: Encrypt a nested object as DOC
- **WHEN** `encryptValue({ address: { city: "Shanghai" }, tags: ["a", "b"] }, 'User')` is called
- **THEN** the result SHALL contain `_t: "DOC"` and the BSON binary ciphertext SHALL include the nested structure

#### Scenario: Encrypt an empty object
- **WHEN** `encryptValue({}, 'User')` is called
- **THEN** the result SHALL contain `_t: "DOC"` and the ciphertext SHALL encrypt the BSON binary of an empty document

#### Scenario: Encrypt an empty array
- **WHEN** `encryptValue([], 'User')` is called
- **THEN** the result SHALL contain `_t: "COL"` and the ciphertext SHALL encrypt the BSON binary of `{ _v: [] }`

### Requirement: decryptValue SHALL restore structured values from DOC/COL/MAP sub-documents
The `ProgrammaticCryptoService.decryptValue()` method SHALL detect `_t: "DOC"`, `_t: "COL"`, or `_t: "MAP"` and use `BsonCodec` to decode the decrypted BSON binary back to a plain object or array.

#### Scenario: Decrypt a DOC sub-document
- **WHEN** `decryptValue({ _e:1, _k:kid, _a:'AES_256_GCM', _t:'DOC', c:<Buffer>, _entity:'User' })` is called
- **THEN** the result SHALL be the original plain object

#### Scenario: Decrypt a COL sub-document
- **WHEN** `decryptValue({ _e:1, _k:kid, _a:'AES_256_GCM', _t:'COL', c:<Buffer>, _entity:'User' })` is called
- **THEN** the result SHALL be the original array (unwrapped from `_v`)

#### Scenario: Decrypt a MAP sub-document from Java
- **WHEN** `decryptValue({ _e:1, _k:kid, _a:'AES_256_GCM', _t:'MAP', c:<Buffer>, _entity:'User' })` is called
- **THEN** the result SHALL be the original plain object (map)

#### Scenario: Round-trip object through encryptValue/decryptValue
- **WHEN** `decryptValue(await encryptValue({ key: "value" }, 'User'), 'User')` is called
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

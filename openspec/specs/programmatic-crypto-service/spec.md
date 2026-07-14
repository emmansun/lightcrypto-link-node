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

### Requirement: encryptValue encrypts a scalar value
The system SHALL provide `encryptValue(value, entityName)` that encrypts a scalar value using the active DEK of the named entity's key vault. The result SHALL be a sub-document in canonical LCL format containing `_e: 1`, `_k: kid`, `_a: algorithm`, `_t: typeMarker`, and `c: Buffer`.

#### Scenario: Encrypt a string value
- **WHEN** `encryptValue('13800138000', 'User')` is called
- **THEN** the result SHALL contain `_e: 1`, `_t: 'STR'`, `_k` matching the active kid, and `c` as a Buffer

#### Scenario: Encrypt a number value
- **WHEN** `encryptValue(42, 'User')` is called
- **THEN** the result SHALL contain `_t: 'INT'` and the serialized number

#### Scenario: Encrypt with custom algorithm
- **WHEN** `encryptValue('secret', 'User', 'SM4_CBC')` is called
- **THEN** the result SHALL contain `_a: 'SM4_CBC'`

#### Scenario: Encrypt null returns null
- **WHEN** `encryptValue(null, 'User')` is called
- **THEN** the system SHALL return `null` without throwing

#### Scenario: Encrypt undefined returns undefined
- **WHEN** `encryptValue(undefined, 'User')` is called
- **THEN** the system SHALL return `undefined` without throwing

#### Scenario: Encrypt with missing entityName throws
- **WHEN** `encryptValue('data')` is called without entityName
- **THEN** the system SHALL throw an error with message containing `entityName`

### Requirement: decryptValue decrypts a sub-document
The system SHALL provide `decryptValue(encryptedSubDocument)` that decrypts a canonical LCL sub-document back to a JavaScript value. It SHALL resolve the DEK by `_k` (kid), validate required markers, and return the deserialized plaintext.

#### Scenario: Decrypt a string sub-document
- **WHEN** `decryptValue({ _e: 1, _k: 'v1-abcd1234', _a: 'AES_256_GCM', _t: 'STR', c: <Buffer> })` is called
- **THEN** the result SHALL be the original plaintext string

#### Scenario: Decrypt with missing _e marker throws
- **WHEN** `decryptValue({ _k: 'v1-abcd1234', _t: 'STR', c: <Buffer> })` is called
- **THEN** the system SHALL throw an error with message containing `_e`

#### Scenario: Decrypt with missing _k marker throws
- **WHEN** `decryptValue({ _e: 1, _t: 'STR', c: <Buffer> })` is called
- **THEN** the system SHALL throw an error with message containing `_k`

#### Scenario: Decrypt null returns null
- **WHEN** `decryptValue(null)` is called
- **THEN** the system SHALL return `null` without throwing

#### Scenario: Decrypt with wrong entity DEK fails
- **WHEN** a sub-document encrypted under entity 'User' is decrypted using 'Order' DEK
- **THEN** the system SHALL throw a KCV mismatch error

### Requirement: decryptDocument decrypts all encrypted fields in a raw document
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
- **WHEN** Node.js `encryptValue('hello', 'User')` produces a sub-document
- **THEN** Java `decryptValue(subDocument)` SHALL return `"hello"`

#### Scenario: Java encrypt, Node.js decrypt
- **WHEN** Java `encryptValue("hello", User.class)` produces a sub-document
- **THEN** Node.js `decryptValue(subDocument)` SHALL return `"hello"`

### Requirement: Exported from main index
The `ProgrammaticCryptoService` class SHALL be exported from the package's main entry point so consumers can import it as `require('lightcrypto-link-node').ProgrammaticCryptoService`.

#### Scenario: Import from package
- **WHEN** `const { ProgrammaticCryptoService } = require('lightcrypto-link-node')` is executed
- **THEN** `ProgrammaticCryptoService` SHALL be a constructor function

## MODIFIED Requirements

### Requirement: encryptValue encrypts a value by namespace
The system SHALL provide `encryptValue(value, namespace)` that encrypts a value using the active DEK of the specified canonical namespace. The `namespace` parameter SHALL be a namespace string (e.g., `"User#phone"`) that is parsed and canonicalized internally. The result SHALL be a sub-document containing `_e: 1`, `_t: typeMarker`, and `c: Base64URL string`. The sub-document SHALL NOT contain an `_entity` field.

#### Scenario: Encrypt a string value
- **WHEN** `encryptValue('13800138000', 'User#phone')` is called
- **THEN** the system SHALL parse the namespace to `"default.default.User#phone"`
- **AND** use the active DEK of that namespace's vault
- **AND** the result SHALL contain `_e: 1`, `_t: 'STR'`, and `c` as a Base64URL string

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

#### Scenario: Decrypt null throws
- **WHEN** `decryptValue(null)` is called
- **THEN** the system SHALL throw an error

#### Scenario: Missing _e marker throws
- **WHEN** `decryptValue({ _t: 'STR', c: '...' })` is called
- **THEN** the system SHALL throw an error about missing `_e`

#### Scenario: Missing _t marker throws
- **WHEN** `decryptValue({ _e: 1, c: '...' })` is called
- **THEN** the system SHALL throw an error about missing `_t`

### Requirement: decryptDocument delegates to per-field decryption
The system SHALL provide `decryptDocument(rawDocument, entityClass)` that decrypts all annotated encrypted fields in a raw document. The method SHALL accept an entity class reference (or equivalent metadata) to discover encrypted fields and their namespaces.

#### Scenario: Decrypt document with multiple fields
- **WHEN** `decryptDocument(doc, entityMetadata)` is called on a document with encrypted `phone` and `email` fields
- **THEN** each field SHALL be decrypted using its own namespace's DEK

### Requirement: Round-trip compatibility with Java
The system SHALL produce encrypted sub-documents that are decryptable by the Java `ProgrammaticCryptoService`, and vice versa.

#### Scenario: Node.js encrypt, Java decrypt
- **WHEN** Node.js `encryptValue('hello', 'User#phone')` produces a sub-document
- **THEN** Java `decryptValue(subDocument)` SHALL return `"hello"`

#### Scenario: Java encrypt, Node.js decrypt
- **WHEN** Java `encryptValue("hello", User.class)` produces a sub-document
- **THEN** Node.js `decryptValue(subDocument)` SHALL return `"hello"`

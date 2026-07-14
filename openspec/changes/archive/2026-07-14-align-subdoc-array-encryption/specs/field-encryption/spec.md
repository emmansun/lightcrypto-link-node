## ADDED Requirements

### Requirement: Plugin SHALL detect sub-document schema fields for whole-object (DOC) encryption
The `lclCryptoPlugin` SHALL recognize `encrypt: true` on fields whose Mongoose schema type resolves to a sub-document (nested object definition, `Schema` instance, or `Mixed` with object value) and route them through DOC whole-object encryption in AUTO mode.

#### Scenario: Sub-document Schema instance with encrypt: true (AUTO mode)
- **WHEN** a schema path is defined as `address: { type: addressSchema, encrypt: true }` where `addressSchema` is a `mongoose.Schema` instance
- **THEN** the plugin SHALL register `address` as a whole-object encrypted field with `structuredType: 'DOC'`
- **AND** the pre-save hook SHALL encrypt the entire address value as BSON binary with `_t: "DOC"`

#### Scenario: Nested object definition with encrypt: true (AUTO mode)
- **WHEN** a schema path is defined as `profile: { type: { name: String, bio: String }, encrypt: true }`
- **THEN** the plugin SHALL register `profile` as a whole-object encrypted field with `structuredType: 'DOC'`

### Requirement: Plugin SHALL detect array schema fields and apply correct mode
The `lclCryptoPlugin` SHALL recognize `encrypt: true` on array-typed fields and apply the correct encryption mode based on element type and `mode` option.

#### Scenario: Scalar array with encrypt: true (AUTO → element-level)
- **WHEN** a schema defines `tags: { type: [String], encrypt: true }`
- **THEN** the plugin SHALL register `tags` as element-level encrypted (each element encrypted independently)

#### Scenario: Sub-document array with encrypt: true (AUTO → whole-array COL)
- **WHEN** a schema defines `items: { type: [itemSchema], encrypt: true }`
- **THEN** the plugin SHALL register `items` as whole-array encrypted with `structuredType: 'COL'`

#### Scenario: Scalar array with mode: 'WHOLE' → whole-array (COL)
- **WHEN** a schema defines `tags: { type: [String], encrypt: true, mode: 'WHOLE' }`
- **THEN** the plugin SHALL register `tags` as whole-array encrypted with `structuredType: 'COL'`

#### Scenario: Sub-document array with mode: 'ELEMENT' → configuration error
- **WHEN** a schema defines `items: { type: [itemSchema], encrypt: true, mode: 'ELEMENT' }`
- **THEN** the plugin SHALL throw a configuration error during plugin initialization

### Requirement: Plugin SHALL support nested encrypted field paths inside sub-documents
The `lclCryptoPlugin` SHALL detect `encrypt: true` on fields nested inside a sub-document definition and encrypt only those nested fields while leaving the container visible.

#### Scenario: Nested encrypted field inside sub-document schema
- **WHEN** a schema defines `address: { street: { type: String, encrypt: true }, city: String }` (where `address` is a nested object)
- **THEN** the plugin SHALL register `address.street` as an encrypted field with path navigation `[FIELD, FIELD]`
- **AND** on save, only `street` inside `address` SHALL be encrypted

#### Scenario: Nested encrypted field inside sub-document Schema instance
- **WHEN** a `mongoose.Schema` defines `street: { type: String, encrypt: true }` and is used as `address: { type: addressSchema }`
- **THEN** the plugin SHALL detect `street` as a nested encrypted field within `address`

### Requirement: Plugin SHALL support nested encrypted fields inside array elements
The `lclCryptoPlugin` SHALL iterate over array elements and encrypt specific fields within each element (matching Java's `LIST_ITER` + `FIELD` navigation).

#### Scenario: Encrypted field inside array of sub-documents
- **WHEN** a schema defines `items: [{ sku: String, price: { type: Number, encrypt: true } }]`
- **THEN** the plugin SHALL register `items.price` as an encrypted field with path navigation `[LIST_ITER, FIELD]`
- **AND** on save, `price` in each array element SHALL be encrypted independently

#### Scenario: Decryption of nested fields inside array elements
- **WHEN** a document with `items: [{ sku: "A", price: { _e:1, ... } }, { sku: "B", price: { _e:1, ... } }]` is retrieved
- **THEN** each `price` SHALL be decrypted independently, restoring `items: [{ sku: "A", price: 100 }, ...]`

### Requirement: Post-find hooks SHALL decrypt structured and nested encrypted fields
The existing post-find and post-findOne hooks SHALL correctly handle DOC/COL/MAP whole-value decryption and nested path decryption.

#### Scenario: Decrypted DOC field is a plain object
- **WHEN** a document with a whole-object encrypted DOC field is retrieved
- **THEN** the field value SHALL be a plain JavaScript object structurally equal to the original

#### Scenario: Decrypted COL field is a plain array
- **WHEN** a document with a whole-array encrypted COL field is retrieved
- **THEN** the field value SHALL be a plain JavaScript array structurally equal to the original

#### Scenario: Decrypted nested field inside sub-document
- **WHEN** a document with a nested encrypted field inside a sub-document is retrieved
- **THEN** only the nested encrypted field SHALL be decrypted; the container sub-document and sibling fields remain intact

#### Scenario: Decrypted element-level array
- **WHEN** a document with element-level encrypted array is retrieved
- **THEN** each element SHALL be decrypted and the array restored to its original values

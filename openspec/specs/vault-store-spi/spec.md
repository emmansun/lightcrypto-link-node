## ADDED Requirements

### Requirement: VaultStore SHALL define an abstract async interface for vault persistence
The system SHALL provide a VaultStore abstract class defining the contract for all storage adapters.

#### Scenario: Interface methods
- **WHEN** implementing a VaultStore adapter
- **THEN** the adapter SHALL implement: `save(doc)`, `load(namespace)`, `exists(namespace)`, `rotate(doc)`, `loadAll()`
- **AND** all methods SHALL return Promises (async)
- **AND** unimplemented methods SHALL throw `Error('Not implemented')`

#### Scenario: save() upsert semantics
- **WHEN** calling `save(doc)` with a VaultDocument
- **THEN** the adapter SHALL persist the document
- **AND** if a document with the same `id` already exists, it SHALL be overwritten (upsert)

#### Scenario: load() by namespace
- **WHEN** calling `load(namespace)` with a canonical namespace string
- **THEN** the adapter SHALL return the VaultDocument or `null` if not found

#### Scenario: exists() check
- **WHEN** calling `exists(namespace)`
- **THEN** the adapter SHALL return `true` if a vault document exists, `false` otherwise

#### Scenario: rotate() with optimistic locking
- **WHEN** calling `rotate(doc)` with an updated VaultDocument
- **THEN** the adapter SHALL verify that the stored document's version equals `doc.v - 1`
- **AND** if version matches, the adapter SHALL persist the update and return the new document
- **AND** if version does NOT match, the adapter SHALL throw `OptimisticLockError`

#### Scenario: loadAll() bulk loading
- **WHEN** calling `loadAll()`
- **THEN** the adapter SHALL return an array of all VaultDocuments in the store

### Requirement: VaultDocument SHALL be a storage-agnostic plain data model
The system SHALL define VaultDocument as a plain JavaScript object with validation.

#### Scenario: Required fields
- **WHEN** creating a VaultDocument
- **THEN** it SHALL contain: `id` (String), `v` (Number ≥ 1), `status` (String), `activeKid` (String), `keys` (Array), `cmk` (Object with provider + id), `createdAt` (Date), `updatedAt` (Date)

#### Scenario: Key entry structure
- **WHEN** a key entry is included in `keys[]`
- **THEN** it SHALL contain: `kid` (String), `status` (ACTIVE|ROTATED|REVOKED), `dek` (WrappedKeyInfo), `hmk` (WrappedKeyInfo), `binding` (String hex), `createdAt` (Date)

#### Scenario: WrappedKeyInfo structure
- **WHEN** a wrapped key is stored
- **THEN** it SHALL contain: `wrapped` (Buffer), `algorithm` (String), `kcv` (String hex), `cmkVersion` (String)

#### Scenario: Validation
- **WHEN** creating a VaultDocument with missing required fields
- **THEN** the system SHALL throw a validation error

### Requirement: OptimisticLockError SHALL be a distinct error type
The system SHALL provide a custom error class for concurrent modification detection.

#### Scenario: Error identity
- **WHEN** a rotate() operation fails due to version mismatch
- **THEN** the thrown error SHALL be an instance of `OptimisticLockError`
- **AND** it SHALL have `name: 'OptimisticLockError'`
- **AND** it SHALL include the namespace and expected/actual versions in the message

### Requirement: MongoVaultStore SHALL implement VaultStore using native mongodb driver
The system SHALL provide a MongoDB adapter using the native `mongodb` driver (not Mongoose), aligned with Java's `MongoVaultStore`.

#### Scenario: Construction
- **WHEN** creating a MongoVaultStore
- **THEN** it SHALL accept a mongodb `Db` instance as parameter
- **AND** it SHALL accept an optional `collectionName` (default: `__lcl_keyvault`)

#### Scenario: Document conversion
- **WHEN** loading a vault document
- **THEN** the BSON Document SHALL be converted to a plain VaultDocument object
- **AND** `_id` SHALL be mapped to `id`
- **AND** wrapped key fields SHALL be stored as Base64 strings in BSON (aligned with Java)

#### Scenario: Optimistic lock via replaceOne
- **WHEN** calling rotate(doc)
- **THEN** the adapter SHALL use `collection.replaceOne({ _id, v: doc.v - 1 }, newBsonDoc)`
- **AND** if `matchedCount === 0`, it SHALL throw OptimisticLockError

#### Scenario: save() upsert via replaceOne
- **WHEN** calling save(doc)
- **THEN** the adapter SHALL use `collection.replaceOne({ _id }, bsonDoc, { upsert: true })`
- **AND** `updatedAt` SHALL be set to current time before persisting

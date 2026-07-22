## ADDED Requirements

### Requirement: InMemoryVaultStore SHALL implement VaultStore using an in-memory Map
The system SHALL provide a lightweight in-memory VaultStore implementation for testing and development.

#### Scenario: Construction
- **WHEN** creating an InMemoryVaultStore
- **THEN** it SHALL initialize an empty Map as the backing store
- **AND** no external dependencies SHALL be required

#### Scenario: save() stores document in Map
- **WHEN** calling `save(doc)`
- **THEN** the document SHALL be stored in the Map keyed by `doc.id`
- **AND** a deep copy SHALL be stored (mutations to the original SHALL NOT affect the store)

#### Scenario: load() retrieves from Map
- **WHEN** calling `load(namespace)`
- **THEN** the adapter SHALL return a deep copy of the stored document
- **AND** if not found, it SHALL return `null`

#### Scenario: exists() checks Map
- **WHEN** calling `exists(namespace)`
- **THEN** the adapter SHALL return `true` if the Map contains the key

#### Scenario: rotate() with version check
- **WHEN** calling `rotate(doc)`
- **THEN** the adapter SHALL check that the stored document's `v` equals `doc.v - 1`
- **AND** if match, it SHALL replace the stored document and return the new document
- **AND** if mismatch, it SHALL throw `OptimisticLockError`

#### Scenario: loadAll() returns all documents
- **WHEN** calling `loadAll()`
- **THEN** the adapter SHALL return deep copies of all stored documents as an array

#### Scenario: clear() utility
- **WHEN** calling `clear()`
- **THEN** all stored documents SHALL be removed
- **AND** this method is specific to InMemoryVaultStore (not part of the VaultStore interface)

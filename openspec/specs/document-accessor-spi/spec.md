## ADDED Requirements

### Requirement: DocumentAccessor SHALL define an interface for field-level document access
The system SHALL provide a DocumentAccessor abstract class for reading and writing fields within documents.

#### Scenario: Interface methods
- **WHEN** implementing a DocumentAccessor
- **THEN** it SHALL implement: `getField(doc, field)`, `setField(doc, field, value)`, `isDocumentLike(value)`, `asList(value)`, `asMap(value)`
- **AND** unimplemented methods SHALL throw `Error('Not implemented')`

#### Scenario: getField
- **WHEN** calling `getField(doc, field)`
- **THEN** it SHALL return the field value, or `undefined` if absent

#### Scenario: setField
- **WHEN** calling `setField(doc, field, value)`
- **THEN** it SHALL set the field in-place on the document

#### Scenario: isDocumentLike
- **WHEN** calling `isDocumentLike(value)`
- **THEN** it SHALL return `true` if the value is a plain object or document-like structure
- **AND** it SHALL return `false` for null, Array, Buffer, Date, and primitive types

#### Scenario: asList
- **WHEN** calling `asList(value)`
- **THEN** it SHALL return the value as an iterable array if it is array-like, or `null` otherwise

#### Scenario: asMap
- **WHEN** calling `asMap(value)`
- **THEN** it SHALL return an iterable of `[key, value]` pairs if the value is map-like, or `null` otherwise

### Requirement: MongooseDocumentAccessor SHALL operate on plain objects and Mongoose Documents
The system SHALL provide a Mongoose-compatible DocumentAccessor.

#### Scenario: Field access on plain objects
- **WHEN** accessing fields on a plain object
- **THEN** `getField` SHALL use bracket notation `doc[field]`
- **AND** `setField` SHALL use bracket notation `doc[field] = value`

#### Scenario: isDocumentLike detection
- **WHEN** checking `isDocumentLike(value)`
- **THEN** it SHALL return `true` for plain objects and Mongoose Documents
- **AND** it SHALL return `false` for `null`, `Array`, `Buffer`, `Date`, `ObjectId`

#### Scenario: asList for arrays
- **WHEN** the value is an Array
- **THEN** `asList` SHALL return it directly

#### Scenario: asMap for objects
- **WHEN** the value is a plain object or Mongoose Document
- **THEN** `asMap` SHALL return `Object.entries(value)`

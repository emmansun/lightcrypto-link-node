## ADDED Requirements

### Requirement: QueryTransformer SHALL define an interface for blind-index query rewriting
The system SHALL provide a QueryTransformer abstract class for transforming plaintext field references and values into blind-index lookups.

#### Scenario: Interface methods
- **WHEN** implementing a QueryTransformer
- **THEN** it SHALL implement: `rewriteFieldName(originalField)`, `rewriteQueryValue(plaintextValue, namespace)`, `supportsField(field, encryptedFields)`
- **AND** unimplemented methods SHALL throw `Error('Not implemented')`

#### Scenario: rewriteFieldName
- **WHEN** calling `rewriteFieldName(originalField)`
- **THEN** it SHALL return the rewritten field name targeting the blind index

#### Scenario: rewriteQueryValue
- **WHEN** calling `rewriteQueryValue(plaintextValue, namespace)`
- **THEN** it SHALL return the blind-index hash value computed from the plaintext value

#### Scenario: supportsField
- **WHEN** calling `supportsField(field, encryptedFields)`
- **THEN** it SHALL return `true` if the field has blind index enabled

### Requirement: MongooseQueryTransformer SHALL rewrite MongoDB query fields and values
The system SHALL provide a Mongoose-compatible QueryTransformer implementation.

#### Scenario: Field name rewriting
- **WHEN** calling `rewriteFieldName("phone")`
- **THEN** it SHALL return `"phone.b"`

#### Scenario: Value rewriting
- **WHEN** calling `rewriteQueryValue(plaintextValue, namespace)`
- **THEN** it SHALL use BlindIndexEngine with the namespace's HMAC key to compute the blind index hash
- **AND** the returned value SHALL be a Base64URL string

#### Scenario: Field support check
- **WHEN** calling `supportsField(field, encryptedFields)`
- **THEN** it SHALL check if the field exists in `encryptedFields` with `blindIndex: true`

#### Scenario: Query rewriting end-to-end
- **WHEN** a Mongoose query uses a blind-indexed field
- **THEN** the transformer SHALL rewrite the field path to include `.b` suffix
- **AND** the query value SHALL be replaced with the blind index hash

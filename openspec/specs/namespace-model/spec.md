## ADDED Requirements

### Requirement: Namespace SHALL support four-segment canonical form
The system SHALL implement the namespace model `<tenant>.<realm>.<entity>#<field>` matching Java Namespace record.

#### Scenario: Full four-segment parse
- **WHEN** parsing `"tenantA.app.User#phone"`
- **THEN** the result SHALL have tenant="tenantA", realm="app", entity="User", field="phone"
- **AND** canonical() SHALL return `"tenantA.app.User#phone"`

#### Scenario: Shorthand expansion
- **WHEN** parsing `"User#phone"` (one dot-segment before #)
- **THEN** the result SHALL have tenant="default", realm="default", entity="User", field="phone"
- **AND** canonical() SHALL return `"default.default.User#phone"`

#### Scenario: Ambiguous two-segment rejection
- **WHEN** parsing `"realm.entity#field"` (two dot-segments before #)
- **THEN** the system SHALL throw an error indicating ambiguous namespace

#### Scenario: Missing hash separator
- **WHEN** parsing a string without `#`
- **THEN** the system SHALL throw an error

### Requirement: Namespace segments SHALL be validated
The system SHALL enforce character and length constraints on namespace segments.

#### Scenario: Valid segment characters
- **WHEN** a segment contains only `[a-zA-Z0-9_-]`
- **THEN** the segment SHALL be accepted

#### Scenario: Invalid segment characters
- **WHEN** a segment contains characters outside `[a-zA-Z0-9_-]` (e.g., spaces, unicode, `@`)
- **THEN** the system SHALL throw an error

#### Scenario: Field allows dots for nested paths
- **WHEN** the field segment is `"address.street"`
- **THEN** the field SHALL be accepted (dots allowed in field only)
- **AND** the pattern SHALL be `[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*`

#### Scenario: Maximum length enforcement
- **WHEN** the canonical form exceeds 256 UTF-8 bytes
- **THEN** the system SHALL throw an error

#### Scenario: Empty segment rejection
- **WHEN** any segment is empty
- **THEN** the system SHALL throw an error

### Requirement: Namespace SHALL provide canonical byte representation
The system SHALL provide the canonical namespace as UTF-8 bytes for use in Wire Format and HKDF.

#### Scenario: Canonical bytes
- **WHEN** calling canonicalBytes() on Namespace("default", "default", "User", "phone")
- **THEN** the result SHALL be the UTF-8 encoding of `"default.default.User#phone"`

#### Scenario: Case sensitivity
- **WHEN** comparing `"User#Phone"` and `"user#phone"`
- **THEN** they SHALL be treated as different namespaces (case-sensitive)

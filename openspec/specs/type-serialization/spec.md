## ADDED Requirements

### Requirement: TypeSerializer SHALL serialize values deterministically
The system SHALL serialize values to bytes for encryption and blind indexing with guaranteed cross-language consistency.

#### Scenario: String serialization
- **WHEN** serializing a String value
- **THEN** the value SHALL be serialized as UTF-8 bytes of the original string
- **AND** serialization of "hello" SHALL always produce identical bytes across languages

#### Scenario: Integer serialization
- **WHEN** serializing an Integer (including negative numbers)
- **THEN** the value SHALL be serialized as `String.valueOf(value).getBytes(UTF_8)`
- **AND** serialization of -123 SHALL produce `"-123"` bytes

#### Scenario: Long serialization
- **WHEN** serializing a Long value
- **THEN** the value SHALL be serialized as `String.valueOf(value).getBytes(UTF_8)`
- **AND** Java Long and Node.js mongoose-long SHALL produce identical bytes

#### Scenario: BigDecimal serialization
- **WHEN** serializing a BigDecimal
- **THEN** the value SHALL be serialized using `toPlainString()` (no scientific notation)
- **AND** Node.js Decimal128.toString() SHALL produce identical output

#### Scenario: Boolean serialization
- **WHEN** serializing a Boolean
- **THEN** `true` SHALL produce `"true"` and `false` SHALL produce `"false"`

#### Scenario: LocalDate serialization
- **WHEN** serializing a LocalDate
- **THEN** it SHALL use ISO format: `"YYYY-MM-DD"` (e.g., "1996-05-15")
- **AND** timezone SHALL be handled as UTC

#### Scenario: LocalDateTime serialization
- **WHEN** serializing a LocalDateTime
- **THEN** it SHALL use ISO format: `"YYYY-MM-DDTHH:mm:ss"` (e.g., "1996-05-15T14:30:00")
- **AND** milliseconds SHALL be truncated to match Java LocalDateTime

#### Scenario: Byte array serialization
- **WHEN** serializing a byte[]
- **THEN** it SHALL use standard Base64 encoding (RFC 4648)
- **AND** Node.js Buffer.toString('base64') SHALL produce identical output

### Requirement: TypeDeserializer SHALL deserialize values based on type markers
The system SHALL deserialize encrypted plaintext back to original JavaScript types using `_t` markers.

#### Scenario: STR type deserialization
- **WHEN** type marker is `"STR"`
- **THEN** the value SHALL be returned as a String

#### Scenario: INT type deserialization
- **WHEN** type marker is `"INT"`
- **THEN** the value SHALL be parsed as Integer
- **AND** the result SHALL be a JavaScript Number (with precision loss risk for values > 2^31-1)

#### Scenario: LONG type deserialization
- **WHEN** type marker is `"LONG"`
- **THEN** the value SHALL be parsed as Long
- **AND** mongoose-long SHALL be used to preserve precision

#### Scenario: DEC type deserialization
- **WHEN** type marker is `"DEC"`
- **THEN** the value SHALL be converted to Decimal128
- **AND** no arithmetic SHALL be performed on the Decimal128 object

#### Scenario: BOOL type deserialization
- **WHEN** type marker is `"BOOL"`
- **THEN** `"true"` SHALL be converted to `true` and `"false"` to `false`

#### Scenario: LDATE type deserialization
- **WHEN** type marker is `"LDATE"`
- **THEN** the value SHALL be parsed as Date object (UTC midnight)
- **AND** timezone SHALL be preserved as UTC

#### Scenario: LDT type deserialization
- **WHEN** type marker is `"LDT"`
- **THEN** the value SHALL be parsed as Date object with millisecond precision
- **AND** the format `"YYYY-MM-DDTHH:mm:ss"` SHALL be supported

#### Scenario: BYTES type deserialization
- **WHEN** type marker is `"BYTES"`
- **THEN** the raw bytes SHALL be returned as Buffer (no string conversion)

### Requirement: Type markers SHALL use Java-compatible identifiers
The system SHALL use `_t` type marker values that exactly match Java LightCrypto-Link.

#### Scenario: Type marker registry
- **WHEN** registering type markers
- **THEN** String SHALL map to `"STR"`
- **AND** Integer SHALL map to `"INT"`
- **AND** Long SHALL map to `"LONG"`
- **AND** Short SHALL map to `"SHORT"`
- **AND** Byte SHALL map to `"BYTE"`
- **AND** Float SHALL map to `"FLOAT"`
- **AND** Double SHALL map to `"DOUBLE"`
- **AND** BigDecimal SHALL map to `"DEC"`
- **AND** Boolean SHALL map to `"BOOL"`
- **AND** LocalDate SHALL map to `"LDATE"`
- **AND** LocalDateTime SHALL map to `"LDT"`
- **AND** byte[] SHALL map to `"BYTES"`

### Requirement: System SHALL support Enum type serialization
The system SHALL serialize Enum values with full class name for cross-language compatibility.

#### Scenario: Enum serialization
- **WHEN** serializing an Enum value
- **THEN** the type marker SHALL be `"ENUM:<fully-qualified-class-name>"` (e.g., `"ENUM:com.example.Status"`)
- **AND** the value SHALL be the enum name (e.g., `"ACTIVE"`)
- **AND** Node.js SHALL store Enum as String with `"ENUM:"` prefix

#### Scenario: Enum deserialization
- **WHEN** type marker starts with `"ENUM:"`
- **THEN** the value SHALL be returned as a String (the enum name)
- **AND** Node.js SHALL NOT attempt to reconstruct Java Enum object

# Type Mapping (Java ↔ Node.js)

lightcrypto-link-node provides 100% type serialization compatibility with the Java LightCrypto-Link ecosystem.

## Type Compatibility Matrix

| Java Type | `_t` Marker | Node.js Type | Serialization |
|-----------|-------------|--------------|---------------|
| String | STR | String | UTF-8 |
| Integer | INT | Number | toString() |
| Long | LONG | mongoose-long | toString() |
| Short | SHORT | Number | toString() |
| Byte | BYTE | Number | toString() |
| Float | FLOAT | Number | toString() |
| Double | DOUBLE | Number | toString() |
| BigDecimal | DEC | Decimal128 | toPlainString() |
| Boolean | BOOL | Boolean | "true"/"false" |
| LocalDate | LDATE | Date | YYYY-MM-DD |
| LocalDateTime | LDT | Date | YYYY-MM-DDTHH:mm:ss |
| byte[] | BYTES | Buffer | Base64 (RFC 4648) |
| Enum | ENUM | String | Enum name |

## Serialization Rules

### Numbers

- All numeric types are serialized via `toString()` to match Java's `String.valueOf()`
- Deserialization parses back to JavaScript `Number`
- Precision warning is logged for values exceeding `Number.MAX_SAFE_INTEGER`

### Long Type

- Requires optional `mongoose-long` package for full precision
- Without `mongoose-long`, values exceeding `2^53 - 1` will lose precision with a warning

### Dates

- **LocalDate**: Serialized as `YYYY-MM-DD` (UTC midnight), deserialized to `Date`
- **LocalDateTime**: Serialized as `YYYY-MM-DDTHH:mm:ss` (milliseconds truncated), deserialized to `Date`

### Binary Data

- `byte[]` is Base64-encoded (RFC 4648, no line breaks)
- Deserialized to Node.js `Buffer` (no string conversion)

### Enum

- Serialized as the enum name (String)
- Deserialized as String (no Java class reconstruction in Node.js)

## Blind Index Serialization

Blind indexes are deterministic — the same input always produces the same HMAC output. This enables exact-match queries on encrypted fields without decryption.

```javascript
// Blind index is HMAC-SHA-256 → Base64URL (no padding)
// Same field name + same value → same blind index across Java and Node.js
```

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
| Document / POJO | DOC | Object | BSON binary (`serialize()`) |
| Collection / List | COL | Array | BSON binary (`serialize({ _v: [...] })`) |
| Map / Dictionary | MAP | Object | BSON binary (`serialize()`) |

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

### Structured Types (DOC, COL, MAP)

Structured types use BSON binary serialization instead of string serialization. The entire value is serialized as a BSON document, encrypted as a single ciphertext, and stored with the corresponding `_t` marker.

- **DOC** (sub-document / POJO): Plain objects are serialized via `BSON.serialize(obj)`. Used for Mongoose sub-document fields (`Schema` instances) and nested object definitions.
- **COL** (collection / array): Arrays are wrapped as `{ _v: [...] }` before BSON serialization. On decryption, the `_v` field is unwrapped to restore the original array.
- **MAP** (key-value map): Plain objects serialized identically to DOC, but semantically represents a dynamic key-value map rather than a fixed-schema sub-document.

> **Note:** Structured types do **not** support blind indexes. The `b` field is never generated for DOC/COL/MAP encrypted sub-documents.

> **Interoperability:** BSON binary output matches Java's `DocumentCodec.encode()` byte-for-byte, ensuring cross-platform compatibility.

## Blind Index Serialization

Blind indexes are deterministic — the same input always produces the same HMAC output. This enables exact-match queries on encrypted fields without decryption.

```javascript
// Blind index is HMAC-SHA-256 → Base64URL (no padding)
// Same field name + same value → same blind index across Java and Node.js
```

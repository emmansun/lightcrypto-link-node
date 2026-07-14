## Context

`lightcrypto-link-node` currently encrypts individual scalar fields (String, Number, Boolean, Date, Buffer, Decimal128, Long). The encrypted value is stored as a BSON sub-document `{ _e: 1, _k, _a, _t, c, b? }` fully compatible with the Java `lightcrypto-link` reference implementation.

The Java implementation supports three **structured type markers** for non-scalar field encryption:

| Type Marker | Java Usage | Serialization |
|---|---|---|
| `DOC` | Whole POJO/sub-document | BSON binary (raw BSON bytes via `BsonBinaryWriter` + `DocumentCodec`) |
| `COL` | Whole `Collection`/`List` | BSON binary of `{ _v: [...] }` wrapper document |
| `MAP` | Whole `Map<String, V>` | BSON binary (raw BSON bytes) |

Java also supports three encryption modes via `EncryptionMode` enum:
- `AUTO` (default): POJO fields → whole-object (`DOC`); collections of scalars → element-level; collections of POJOs → whole-object (`COL`)
- `ELEMENT`: encrypt each element of a collection independently (each element = separate sub-document); rejects POJO collections
- `WHOLE`: encrypt entire container/POJO as a single blob

Java's `EntityMetadataCache` supports nested path navigation via `PathSegmentType`:
- `FIELD` — direct field access
- `LIST_ITER` — iterate over collection elements
- `MAP_ITER` — iterate over map values

This allows encrypting specific fields inside nested structures (e.g., `orders[].totalAmount`, `metadata.tags[].value`, `address.street`).

The Node.js implementation currently has none of these capabilities.

## Goals / Non-Goals

**Goals:**
- Implement `DOC`, `COL`, `MAP` structured type markers using BSON binary serialization, fully interoperable with Java.
- Support `EncryptionMode` (`AUTO`/`ELEMENT`/`WHOLE`) in the Mongoose plugin schema definition.
- Support element-level encryption for arrays of scalars (each element encrypted independently).
- Support nested path encryption (e.g., `address.street`, `items[].price`) where specific nested fields are encrypted while the container structure remains visible.
- Support whole-sub-document encryption for Mongoose sub-document schemas and nested object definitions.
- Support whole-array encryption for array fields (serialized as `{ _v: [...] }` BSON binary).
- Integrate with the existing `FieldCryptoService` and `ProgrammaticCryptoService`.

**Non-Goals:**
- `MAP_ITER` support for Mongoose `Map` type encryption. Mongoose `Map` is uncommon and can be deferred.
- Deep cross-entity encryption (encrypting fields across `@DBRef` references).
- Schema introspection for `Schema.Types.ObjectId` references within sub-documents.

## Decisions

### 1. BSON binary serialization via `bson` package

**Decision**: Use the `bson` package (bundled with the `mongodb` driver as a transitive dependency) to serialize/deserialize structured values. Create a `BsonCodec` helper:
- `encodeDocument(obj)` → `Buffer` (BSON binary bytes of a plain object)
- `encodeCollection(arr)` → `Buffer` (BSON binary bytes of `{ _v: arr }`)
- `decodeDocument(buffer)` → plain object
- `decodeCollection(buffer)` → array (unwraps `_v`)

This matches Java's `BsonBinaryWriter` + `DocumentCodec` output byte-for-byte.

**Alternatives considered:**
- *JSON serialization*: Rejected — Java uses BSON binary, JSON would break interop.
- *`mongodb` BSON directly*: The `bson` package is the same library the MongoDB driver uses internally. Using it directly gives us precise control.

### 2. Structured type markers — `DOC`, `COL`, `MAP`

**Decision**: Match Java exactly. Use `DOC` for whole sub-document, `COL` for whole collection, `MAP` for whole map.

**Node.js mapping:**
| Java Type | Node.js Equivalent | Type Marker |
|---|---|---|
| POJO/sub-document | Plain object / Mongoose sub-document | `DOC` |
| `Collection<T>` / `List<T>` | Array | `COL` |
| `Map<String, V>` | Plain object used as map (deferred) | `MAP` |

`MAP` support is deferred for Mongoose `Map` type but the decryption path must handle `MAP` markers from Java-encrypted documents.

### 3. EncryptionMode in Mongoose plugin

**Decision**: Add a `mode` option to the schema definition:

```javascript
// In prepareEncryptedSchema definition:
tags: { type: [String], encrypt: true, mode: 'ELEMENT' },  // each element encrypted
items: { type: [itemSchema], encrypt: true },               // AUTO: whole-array (COL) for sub-doc arrays
address: { type: addressSchema, encrypt: true },            // AUTO: whole-object (DOC) for POJOs
```

The `mode` option values: `'AUTO'` (default), `'ELEMENT'`, `'WHOLE'`.

**Mode resolution (matching Java's `resolveWholeObjectMode()`):**

| Field Type | AUTO | ELEMENT | WHOLE |
|---|---|---|---|
| Scalar (String, Number, etc.) | field-level | field-level | field-level |
| Sub-document (POJO) | whole-object (DOC) | **error** | whole-object (DOC) |
| Array of scalars | element-level | element-level | whole-array (COL) |
| Array of sub-docs | whole-array (COL) | **error** | whole-array (COL) |

### 4. Nested path encryption

**Decision**: Support nested encrypted field paths via dot notation in `prepareEncryptedSchema`:

```javascript
prepareEncryptedSchema({
  address: {
    street: String,
    city: String
  },
  'address.street': { encrypt: true },  // encrypt only street inside address
})
```

Or via nested definition:
```javascript
prepareEncryptedSchema({
  address: {
    street: { type: String, encrypt: true },  // nested encrypt
    city: String
  }
})
```

The plugin builds a path tree (matching Java's `path` + `pathTypes` model) and navigates it during pre-save/post-find hooks.

For arrays of sub-documents with nested encrypted fields (matching Java's `LIST_ITER` + `FIELD`):
```javascript
prepareEncryptedSchema({
  items: [{ sku: String, price: { type: Number, encrypt: true } }]
})
```

The plugin iterates over each array element and encrypts only `price` in each.

### 5. Blind index for structured types

**Decision**: Blind indexes SHALL NOT be computed for `DOC`/`COL`/`MAP` fields. This matches Java's `validateWholeObjectMode()` which explicitly throws if `blindIndex=true` is combined with whole-object encryption.

### 6. BsonCodec implementation

**Decision**: Create `src/crypto/BsonCodec.js`:

```javascript
const { serialize, deserialize } = require('bson');

class BsonCodec {
  encodeDocument(obj) { return Buffer.from(serialize(obj)); }
  encodeCollection(arr) { return Buffer.from(serialize({ _v: arr })); }
  decodeDocument(buf) { return deserialize(buf); }
  decodeCollection(buf) { return deserialize(buf)._v; }
}
```

The `bson` package is already a transitive dependency of `mongodb`/`mongoose`, so no new dependency is needed.

### 7. Integration with existing FieldCryptoService

**Decision**: Extend `FieldCryptoService.encryptField()` with a `structuredType` parameter:
- When `structuredType` is `'DOC'`, `'COL'`, or `'MAP'`: use `BsonCodec` to serialize, skip `TypeSerializer`, skip blind index.
- When `structuredType` is not set: existing scalar path (unchanged).

Extend `FieldCryptoService.decryptField()`:
- When `_t` is `'DOC'`, `'COL'`, or `'MAP'`: use `BsonCodec` to deserialize, skip `TypeDeserializer`.
- Otherwise: existing scalar path (unchanged).

## Risks / Trade-offs

- **[BSON binary interop]** → The `bson` package version used by Node.js must produce byte-compatible output with Java's `DocumentCodec`. **Mitigation**: Pin to the `bson` version bundled with the installed `mongodb` driver; add interop tests with Java-generated BSON fixtures.
- **[Mongoose sub-document wrapping]** → Mongoose wraps nested objects in `SubDocument` instances. The BSON encoder must handle both plain objects and Mongoose `SubDocument`. **Mitigation**: Call `.toObject()` or `.lean()` before BSON encoding to get a plain object.
- **[Array mutation]** → After element-level decryption, setting individual array elements via Mongoose's `doc.set()` may trigger reactivity. **Mitigation**: Use `doc.markModified()` after array mutation; verify in integration tests.
- **[Nested path detection complexity]** → Mongoose schema definitions support many styles (shorthand, longhand, Schema instances). Detecting nested `encrypt: true` inside sub-document schemas requires recursive traversal. **Mitigation**: Implement a `scanSchemaPaths()` helper that recursively walks schema definitions; cover common patterns in tests.
- **[MAP type deferred]** → Java-encrypted `MAP` fields must be decryptable by Node.js even though Node.js does not yet produce them. **Mitigation**: Implement the decryption path for `MAP` (BSON decode → plain object); defer encryption to a future change.

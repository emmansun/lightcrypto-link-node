## Why

The Node.js `lightcrypto-link-node` implementation currently only supports scalar field encryption (String, Number, Boolean, Date, Buffer, Decimal128, Long). The Java `lightcrypto-link` reference implementation supports **sub-document (POJO)**, **collection**, and **map** field encryption with three modes (`AUTO`, `ELEMENT`, `WHOLE`) and three structured type markers (`DOC`, `COL`, `MAP`), serialized as **BSON binary** (not JSON). The Java implementation also supports **element-level** encryption for collections and **nested path navigation** (e.g., `orders[].amount`). This gap breaks cross-language interoperability and means Node.js cannot encrypt/decrypt the same schema structures that Java handles. Aligning these capabilities is critical for teams sharing a MongoDB database between Java and Node.js services.

## What Changes

- **Add `DOC` type marker** — Encrypt a whole sub-document (nested plain object) as BSON binary. On decryption, decode BSON back to a plain object.
- **Add `COL` type marker** — Encrypt a whole collection/array as BSON binary. The array is wrapped as `{ _v: [...] }` before BSON encoding. On decryption, unwrap `_v` back to an array.
- **Add `MAP` type marker** — Encrypt a whole map/object (used as key-value store) as BSON binary. On decryption, decode BSON back to a plain object.
- **Add `EncryptionMode` support** — Introduce `mode` option (`AUTO`/`ELEMENT`/`WHOLE`) to the Mongoose plugin schema definition, controlling whether collections/maps are encrypted as a whole unit or element-by-element.
- **Add element-level collection encryption** — Support encrypting each element in an array independently (each element becomes its own encrypted sub-document).
- **Add nested path encryption** — Support encrypting specific nested fields inside sub-documents and array elements (e.g., `address.street`, `items[].price`).
- **BSON binary serialization** — Use the `bson` package (bundled with `mongodb` driver) for BSON encode/decode of structured values, matching Java's `BsonBinaryWriter`/`DocumentCodec` output.
- **Extend Mongoose plugin** — Detect sub-document schemas, array schemas, and nested encrypted field paths; route through appropriate encryption mode.
- **Extend `ProgrammaticCryptoService`** — Support `DOC`/`COL`/`MAP` in `encryptValue()`/`decryptValue()`.
- **Add interop tests** — Verify round-trip with Java-style `DOC`/`COL`/`MAP` BSON-encrypted sub-documents.

## Capabilities

### New Capabilities

- `structured-field-encryption`: Whole sub-document (`DOC`), collection (`COL`), and map (`MAP`) encryption/decryption using BSON binary serialization, aligned with Java LightCrypto-Link behavior. Includes `EncryptionMode` (AUTO/ELEMENT/WHOLE), element-level collection encryption, and nested path navigation.

### Modified Capabilities

- `field-encryption`: Extend plugin to handle sub-document schemas, array schemas, nested encrypted paths, and encryption mode option.
- `mongo-interoperability`: Add cross-language round-trip requirements for `DOC`/`COL`/`MAP` BSON-encrypted fields.
- `programmatic-crypto-service`: Extend `encryptValue`/`decryptValue` to handle structured (DOC/COL/MAP) values.

## Impact

- **`src/service/TypeSerializer.js`** — No change for structured types (serialization bypasses TypeSerializer, uses BSON directly like Java).
- **`src/service/TypeDeserializer.js`** — No change for structured types.
- **New `src/crypto/BsonCodec.js`** — BSON binary encode/decode helper using the `bson` package.
- **`src/service/FieldCryptoService.js`** — Add `DOC`/`COL`/`MAP` structured value encrypt/decrypt paths; skip blind index for structured types.
- **`src/plugin/lclCryptoPlugin.js`** — Major extension: detect sub-doc schemas, array schemas, nested `@Encrypted` paths; support `mode` option; element-level iteration; nested path navigation.
- **`src/service/ProgrammaticCryptoService.js`** — Add `DOC`/`COL`/`MAP` support in `encryptValue()`/`decryptValue()`.
- **`test/`** — New unit tests for BsonCodec, structured encryption; new integration tests for sub-doc/array/nested paths; new interop tests for BSON binary format.
- **`docs/type-mapping.md`** — Document `DOC`, `COL`, `MAP` type markers and BSON binary format.

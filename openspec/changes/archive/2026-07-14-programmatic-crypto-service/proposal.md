## Why

lightcrypto-link-node currently only supports encryption through the Mongoose plugin (pre-save/post-find hooks). Users who need manual encryption/decryption have no public API:

- **Non-Mongoose usage**: Raw MongoDB driver, Prisma, or custom ODM cannot use the plugin
- **Queries bypassing the plugin**: Aggregation pipelines, raw `db.collection.find()`, or custom queries return encrypted sub-documents that cannot be decrypted
- **Migration & backfill**: Scripts need to encrypt/decrypt values outside the normal save/find flow
- **DTO/message encryption**: Encrypting arbitrary payloads not tied to a Mongoose model

The Java LightCrypto-Link provides `ProgrammaticCryptoService` for these exact scenarios. Node.js should offer equivalent capability for full feature parity.

## What Changes

- **New `ProgrammaticCryptoService` class** with three methods:
  - `encryptValue(value, entityName, algorithm?)` — encrypts a scalar value using the active DEK of the named entity's key vault. Returns a sub-document in canonical LCL format (`_e/_k/_a/_t/c`).
  - `decryptValue(encryptedSubDocument)` — decrypts a canonical LCL sub-document back to a JavaScript value. Resolves DEK by `kid`, validates `_e/_t/c` markers.
  - `decryptDocument(rawDocument, entityName)` — decrypts all encrypted fields in a raw MongoDB document (e.g., from aggregation or raw queries) in-place.
- **Export from `index.js`** so consumers can import it directly
- **New example** demonstrating programmatic usage
- **Unit and integration tests**

## Capabilities

### New Capabilities
- `programmatic-crypto-service`: Manual encrypt/decrypt API for use outside the Mongoose plugin flow — covers scalar encryption/decryption and raw document field decryption

### Modified Capabilities
_(none — existing specs are not affected)_

## Impact

- **New file**: `src/service/ProgrammaticCryptoService.js`
- **Modified**: `src/index.js` (add export), `src/plugin/lclCryptoPlugin.js` (expose schema field metadata for `decryptDocument`)
- **New tests**: `test/unit/service/ProgrammaticCryptoService.test.js`, integration test
- **New example**: `examples/programmatic-encrypt.js`
- **Dependencies**: No new external dependencies; uses existing `KeyVaultService`, `FieldCryptoService`, `TypeSerializer`, `TypeDeserializer`, `CryptoCodec`

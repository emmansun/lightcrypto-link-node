# lightcrypto-link-node

Lightweight application-level field encryption (ALFE) for Node.js/Mongoose and MongoDB.

Transparent encrypt/decrypt on write/read, HMAC blind index for exact-match queries,
multi-DEK envelope encryption with key rotation, multi-KMS/SM-crypto support,
and **BSON format compatibility** with the Java [LightCrypto-Link](https://github.com/emmansun/LightCrypto-Link) ecosystem.

[![codecov](https://codecov.io/github/emmansun/lightcrypto-link-node/graph/badge.svg?token=nQ733ApHBI)](https://codecov.io/github/emmansun/lightcrypto-link-node)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-brightgreen.svg)](https://nodejs.org/)
[![Mongoose](https://img.shields.io/badge/Mongoose-8%2B-blue.svg)](https://mongoosejs.com/)

---

## TL;DR

1. `npm install lightcrypto-link-node`
2. Configure a CMK provider (local hex key, Azure Key Vault, or Alibaba Cloud KMS).
3. Define schema with `encrypt: true` and optionally `blindIndex: true`.
4. Use Mongoose normally — encryption/decryption is automatic.

Deep docs are in [docs](docs/):

- [Configuration](docs/configuration.md) — env vars, secret managers, CMK provider setup
- [Architecture](docs/architecture.md) — envelope encryption, key vault format, rotation
- [CMK Provider](docs/cmk-provider.md) — custom provider interface and built-in providers
- [Type Mapping](docs/type-mapping.md) — Java ↔ Node.js type compatibility
- [Troubleshooting](docs/troubleshooting.md) — common errors, security, limitations

## Features

- Transparent field encryption via Mongoose plugin (pre-save/post-find hooks)
- Blind indexing for exact-match queries (HMAC-SHA-256)
- Multiple algorithms: AES-256-GCM (default), AES-256-CBC, SM4-CBC (China compliance)
- Structured type encryption: whole-object (`DOC`), whole-array (`COL`), element-level array encryption
- Nested path encryption for sub-documents and array elements (e.g., `address.street`, `items[].price`)
- Encryption mode control: `AUTO` (default), `ELEMENT`, `WHOLE`
- Per-entity DEK versioning and rotation
- Pluggable CMK providers: Local, Azure Key Vault, Alibaba Cloud KMS
- Zero third-party crypto dependencies (native Node.js `crypto`)
- BSON format compatible with Java LightCrypto-Link (DOC, COL, MAP type markers)

## Quick Start

### 1. Install

```bash
npm install lightcrypto-link-node
```

Cloud KMS (optional):

```bash
# Azure Key Vault
npm install @azure/keyvault-keys @azure/identity

# Alibaba Cloud KMS
npm install @alicloud/kms20160120 @alicloud/openapi-client
```

### 2. Configure

Local symmetric CMK:

```javascript
const { LocalCmkProvider } = require('lightcrypto-link-node');
const cmkProvider = new LocalCmkProvider('your-64-char-hex-cmk-key');
```

See [docs/configuration.md](docs/configuration.md) for Azure Key Vault, Alibaba Cloud KMS, and environment variable setup.

### 3. Define schema

```javascript
const mongoose = require('mongoose');
const { lclCryptoPlugin, KeyVaultService, prepareEncryptedSchema } = require('lightcrypto-link-node');

const keyVaultService = new KeyVaultService({
  connection: mongoose.connection,
  cmkProvider,
  cacheTtl: 3600000  // 1 hour
});

const userSchema = new mongoose.Schema(prepareEncryptedSchema({
  name: { type: String },
  phone: { type: String, encrypt: true, blindIndex: true },
  ssn: { type: String, encrypt: true }
}));

userSchema.plugin(lclCryptoPlugin, {
  keyVaultService,
  entityName: 'User',
  algorithm: 'AES_256_GCM'
});

const User = mongoose.model('User', userSchema);
```

### 4. Use normally

```javascript
// Encryption is automatic on save
const user = new User({ name: 'John', phone: '13800138000', ssn: '123-45-6789' });
await user.save();

// Decryption is automatic on find
const found = await User.findById(user._id);
console.log(found.phone); // '13800138000'

// Blind index queries work transparently
const result = await User.findOne({ phone: '13800138000' });

// NOTE: Querying encrypted fields WITHOUT blindIndex throws an error.
// Enable blindIndex: true on queryable fields, or use a backfill migration.
```

## Schema Options

| Option | Type | Description |
|--------|------|-------------|
| `encrypt: true` | Boolean | Enable encryption for this field |
| `blindIndex: true` | Boolean | Enable blind index for exact-match queries |
| `fieldName: string` | String | Custom field name for blind index (cross-entity sharing) |
| `mode: string` | String | Encryption mode: `AUTO` (default), `ELEMENT`, `WHOLE` |

### Encryption Modes

| Field Type | AUTO (default) | ELEMENT | WHOLE |
|---|---|---|---|
| Scalar (String, Number, etc.) | field-level | field-level | field-level |
| Sub-document (POJO) | whole-object (`DOC`) | error | whole-object (`DOC`) |
| Array of scalars | element-level | element-level | whole-array (`COL`) |
| Array of sub-docs | whole-array (`COL`) | error | whole-array (`COL`) |

### Structured Type Encryption

```javascript
// Whole-object encryption (DOC) — sub-document Schema instance
const addressSchema = new mongoose.Schema({ street: String, city: String });
const userSchema = new mongoose.Schema(prepareEncryptedSchema({
  name: String,
  address: { type: addressSchema, encrypt: true }  // AUTO → DOC
}));

// Element-level encryption — scalar array
tags: { type: [String], encrypt: true }  // AUTO → element-level

// Whole-array encryption (COL) — explicit mode
tags: { type: [String], encrypt: true, mode: 'WHOLE' }  // → COL

// Nested path encryption — encrypt specific fields within sub-documents
address: {
  street: { type: String, encrypt: true },  // only street encrypted, city visible
  city: String
}

// Nested path in array elements — items[].price encrypted per-element
items: [{ sku: String, price: { type: Number, encrypt: true } }]
```

## Migration from Plaintext Data

When introducing encryption to an existing system with plaintext MongoDB data:

- **Reads**: Plaintext historical values pass through safely (only encrypted sub-documents are decrypted).
- **Writes**: Re-saving a document automatically encrypts plaintext fields (lazy migration).
- **Queries**: Blind index queries only match encrypted records. Querying an encrypted field without `blindIndex: true` throws an error.

Use the backfill runner to migrate all historical records:

```bash
# Dry-run: estimate how many records need migration
node examples/plaintext-backfill.js --dry-run

# Run migration with batch size control
node examples/plaintext-backfill.js --batch-size=500

# Resume from last cursor if interrupted
node examples/plaintext-backfill.js --batch-size=500 --start-after-id=6691a2b3c4d5e6f7a8b9c0d1
```

See [examples/plaintext-backfill.js](examples/plaintext-backfill.js) for full configuration options.

## Rotation

```javascript
await keyVaultService.rotateDek('User');
keyVaultService.flushCache();
```

For behavior details, see [docs/architecture.md](docs/architecture.md).

## Programmatic API

Use `ProgrammaticCryptoService` for manual encryption/decryption outside Mongoose — raw driver queries, aggregation pipelines, migration scripts, and DTO encryption:

```javascript
const { ProgrammaticCryptoService, KeyVaultService, LocalCmkProvider } = require('lightcrypto-link-node');

const keyVaultService = new KeyVaultService({ connection, cmkProvider });
const programmatic = new ProgrammaticCryptoService({ keyVaultService, algorithm: 'AES_256_GCM' });

// Encrypt a scalar value
const subDoc = await programmatic.encryptValue('13800138000', 'User');
// → { _e: 1, _k: 'v1-abcd1234', _a: 'AES_256_GCM', _t: 'STR', c: <Buffer> }

// Decrypt a sub-document
const plaintext = await programmatic.decryptValue(subDoc);
// → '13800138000'

// Decrypt fields in a raw document (e.g., from aggregation or db.collection.find())
const rawDoc = await db.collection('users').findOne({ name: 'Alice' });
await programmatic.decryptDocument(rawDoc, 'User', ['phone', 'ssn']);
// rawDoc.phone and rawDoc.ssn are now plaintext
```

For low-level field operations (without key vault integration), use `FieldCryptoService`:

```javascript
const { FieldCryptoService } = require('lightcrypto-link-node');
const fieldService = new FieldCryptoService();

const encrypted = fieldService.encryptField(value, fieldName, dek, hmacKey, kid, algorithm);
const decrypted = fieldService.decryptField(encrypted, dek, hmacKey, algorithm);
```

## Examples

See [examples/](examples/) for runnable demos:

```bash
node examples/basic-crud.js          # CRUD with blind index
node examples/plaintext-backfill.js  # Migrate plaintext data to encrypted
node examples/multi-algorithm.js     # AES-GCM, AES-CBC, SM4-CBC
node examples/key-rotation.js        # DEK rotation
node examples/config-from-env.js     # Configuration sources
node examples/programmatic-encrypt.js # Programmatic encrypt/decrypt API
node examples/azure-kms.js           # Azure Key Vault
node examples/alibaba-kms.js         # Alibaba Cloud KMS
```

## Project Structure

```text
lightcrypto-link-node/
├── src/
│   ├── crypto/          # Encryptor implementations (AES-GCM, AES-CBC, SM4-CBC, BsonCodec)
│   ├── service/         # KeyVaultService, FieldCryptoService, TypeSerializer
│   ├── provider/        # CMK providers (Local, Azure, Alibaba)
│   ├── plugin/          # Mongoose plugin and query rewriter
│   ├── model/           # KeyVaultDocument schema
│   ├── config/          # LclConfig (multi-source loader)
│   └── index.js         # Public API exports
├── test/
│   ├── unit/
│   ├── integration/
│   └── interoperability/
├── docs/                # Detailed documentation
├── examples/            # Runnable examples
└── openspec/            # OpenSpec change proposals
```

## Compatibility

- **Node.js**: 22.x (recommended), 24.x
- **Mongoose**: 8.x, 9.x
- **MongoDB**: 5.0+, 6.0+, 7.0+, 8.0+
- **Java LightCrypto-Link**: BSON format compatible (DOC, COL, MAP type markers). Note: MAP encryption from Node.js is not yet supported; MAP decryption from Java-encrypted documents works.

## License

[Apache License 2.0](LICENSE)

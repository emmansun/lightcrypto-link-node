# lightcrypto-link-node

Lightweight application-level field encryption (ALFE) for Node.js/Mongoose and MongoDB.

Transparent encrypt/decrypt on write/read, HMAC blind index for exact-match queries,
multi-DEK envelope encryption with key rotation, multi-KMS/SM-crypto support,
and **100% interoperability** with the Java [LightCrypto-Link](https://github.com/emmansun/LightCrypto-Link) ecosystem.

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
- Per-entity DEK versioning and rotation
- Pluggable CMK providers: Local, Azure Key Vault, Alibaba Cloud KMS
- Zero third-party crypto dependencies (native Node.js `crypto`)
- 100% BSON format compatibility with Java LightCrypto-Link

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
```

## Schema Options

| Option | Type | Description |
|--------|------|-------------|
| `encrypt: true` | Boolean | Enable encryption for this field |
| `blindIndex: true` | Boolean | Enable blind index for exact-match queries |
| `fieldName: string` | String | Custom field name for blind index (cross-entity sharing) |

## Rotation

```javascript
await keyVaultService.rotateDek('User');
keyVaultService.flushCache();
```

For behavior details, see [docs/architecture.md](docs/architecture.md).

## Programmatic API

Use `FieldCryptoService` for manual encryption/decryption outside Mongoose:

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
node examples/multi-algorithm.js     # AES-GCM, AES-CBC, SM4-CBC
node examples/key-rotation.js        # DEK rotation
node examples/config-from-env.js     # Configuration sources
node examples/azure-kms.js           # Azure Key Vault
node examples/alibaba-kms.js         # Alibaba Cloud KMS
```

## Project Structure

```text
lightcrypto-link-node/
├── src/
│   ├── crypto/          # Encryptor implementations (AES-GCM, AES-CBC, SM4-CBC)
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
- **Java LightCrypto-Link**: Full BSON format compatibility

## License

[Apache License 2.0](LICENSE)

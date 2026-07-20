# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- NPM version badge in README

### Changed
- **TypeSerializer**: `serialize()` now uses `TextEncoder.encode()` instead of `Buffer.from(string, 'utf8')` for better performance (returns `Uint8Array`)
- **ESLint**: Added `TextEncoder`/`TextDecoder` to source and test globals
- **CMK providers**: Aligned algorithm identifiers using `LclAlgorithms` constants:
  - `LocalCmkProvider`: returns `AES-256-GCM` (was lowercase `aes-256-gcm`)
  - `AzureKmsProvider`: unified to `RSA-OAEP-256` (SHA-256 only, removed SHA-1 support)
  - `AlibabaKmsProvider`: simplified asymmetric wrap to local-only mode
- **docs/cmk-provider.md**: Full rewrite with provider details, auto-resolution behavior, config examples

### Fixed
- **Tests**: Removed obsolete tests (unsupported algorithm validation, RSA-OAEP SHA-1, remote wrap mode); fixed `AES-256-GCM` case mismatch

---

## [1.1.0-beta.1] - 2026-07-14

### Added
- **Structured type encryption** — BSON binary serialization for complex values (matching Java LightCrypto-Link):
  - `DOC`: whole-object encryption via `BsonCodec.encodeDocument()`
  - `COL`: whole-array encryption via `BsonCodec.encodeCollection()` (wraps as `{ _v: [...] }`)
  - `MAP`: decryption of Java-encrypted map values
  - Element-level array encryption (each element encrypted independently)
- **Nested path encryption** — encrypt specific fields inside sub-documents or array elements:
  - Sub-document: `address.street` encrypted, `address.city` visible
  - Array elements: `items[].price` encrypted per-element (Java `LIST_ITER` + `FIELD`)
- **Encryption mode control** — `AUTO` (default), `ELEMENT`, `WHOLE` with field-type-specific behavior
- **Query validation** — throws when querying an encrypted field without `blindIndex: true` (matches Java's `UnsupportedOperationException`)
- **Plaintext backfill runner** — `examples/plaintext-backfill.js` for migrating legacy plaintext data:
  - Dry-run mode to estimate candidate volume
  - Batch size control and cursor-based resume
  - Progress reporting per batch
- **ProgrammaticCryptoService** extended for structured values:
  - `encryptValue()` detects objects/arrays → DOC/COL sub-documents
  - `decryptValue()` handles DOC/COL/MAP type markers
  - `decryptDocument()` supports structured encrypted fields

### Fixed
- **BYTES serialization** — now encrypts raw bytes directly (matching Java `serialize(byte[])`), instead of base64-encoded UTF-8
- **SM4-CBC key adaptation** — 32-byte DEK now uses `DEK[0:16]` (matching Java), instead of `SHA-256(DEK)[0:16]`
- **AES-GCM KCV** — now returns 32 bytes (16 ciphertext + 16 auth tag = 64 hex chars), matching Java

### Changed
- README: softened "100% interoperability" to "BSON format compatible"
- Type serialization: `byte[]` documented as raw bytes (was "Base64")

---

## [1.0.0] - 2026-07-13

### Added
- **Core Encryption Algorithms**
  - AES-256-GCM with 12-byte IV and authenticated encryption
  - AES-256-CBC with 16-byte IV and PKCS5 padding
  - SM4-CBC for China compliance (16-byte key, 16-byte IV)
  - Zero third-party crypto dependencies (uses native Node.js `crypto`)

- **Type Serialization System**
  - Full compatibility with Java LightCrypto-Link `TypeSerializer`
  - Support for: String, Integer, Long, Double, BigDecimal, Boolean
  - Date types: LocalDate (YYYY-MM-DD), LocalDateTime (YYYY-MM-DDTHH:mm:ss)
  - Special types: byte[] (raw bytes), Enum (with fully qualified class name)
  - Deterministic serialization for blind indexing

- **Type Deserialization System**
  - Automatic type conversion based on `_t` marker
  - Lazy loading of optional dependencies (`mongoose-long`, `bson`)
  - Precision warnings for large numbers

- **Key Vault Management**
  - Per-entity DEK/HMAC key pairs with versioning
  - Automatic vault initialization on first use
  - DEK rotation with optimistic locking (concurrent protection)
  - In-memory caching with configurable TTL
  - Secure key destruction using `crypto.randomFillSync()`
  - KCV (Key Check Value) verification
  - Binding hash verification for DEK/HMAC key integrity

- **Field Encryption Service**
  - Transparent field encryption via Mongoose plugin
  - Sub-document format: `{ _e: 1, _k: kid, _a: algorithm, _t: typeMarker, c: ciphertext, b?: blindIndex }`
  - 100% BSON format compatibility with Java LightCrypto-Link
  - Blind index generation: HMAC-SHA-256 → Base64URL (no padding)

- **Mongoose Plugin**
  - Schema scanning for `encrypt: true` fields
  - Pre-save hook: encrypt before persistence
  - Post-find hook: decrypt after retrieval
  - Query rewriting for blind index support
  - Support for `$in` operator rewriting
  - Range operators ($gt, $lt, etc.) NOT rewritten (by design)

- **CMK Provider Infrastructure**
  - Base `CmkProvider` class with pluggable implementations
  - `LocalCmkProvider`: AES-256-GCM key wrapping with 32-byte CMK
  - Public reference: `local-cmk-sha256:{8 hex chars}`
  - `AzureKmsProvider`: RSA-OAEP wrapping via Azure Key Vault (lazy-loads `@azure/keyvault-keys`)
    - Auto-resolves `cmkVersion` and `publicKeyPem` from KMS when not configured
    - Defaults to `RSA-OAEP-256` (SHA-256); `RSA-OAEP` (SHA-1) available for compatibility
  - `AlibabaKmsProvider`: Alibaba Cloud KMS wrapping (lazy-loads `@alicloud/kms20160120`)
    - Supports symmetric (Encrypt/Decrypt API) and asymmetric (RSA-OAEP) key types
    - Auto-resolves `cmkVersion` and `publicKeyPem` for asymmetric keys when not configured
    - Defaults to `RSAES_OAEP_SHA_256` for asymmetric operations

- **Configuration Management**
  - Multi-source configuration with precedence hierarchy:
    1. Environment variables (highest priority)
    2. Secret managers (Kubernetes, AWS, Azure, HashiCorp Vault)
    3. Configuration files (.env, config/*.json)
    4. Application defaults (lowest priority)
  - Environment-specific files: `.env.local` (development), `.env.production` (production), `.env.test` (test)
  - Kubernetes Secrets integration: `/var/run/secrets/lightcrypto-link/`
  - AWS Secrets Manager integration via `LCL_AWS_SECRET_ID`
  - Azure Key Vault Secrets integration via `LCL_AZURE_SECRET_URL`
  - HashiCorp Vault integration via `LCL_VAULT_ADDR` + `LCL_VAULT_TOKEN`
  - Configuration validation: CMK format, MongoDB URI, required fields
  - Runtime configuration reload with change detection

- **Enterprise Development Support**
  - `.npmrc.example` template for enterprise registry configuration
  - `.gitignore` configured to exclude sensitive files
  - GitHub Actions CI/CD workflow using official npm registry
  - Enterprise development guide in README (Enterprise Development section)
  - Quick start guide with code examples

- **Testing & Validation**
  - Comprehensive unit tests for all crypto implementations
  - Integration tests for KeyVaultService, Mongoose plugin
  - Java interoperability tests (encrypt/decrypt, blind index, type markers)
  - Type serialization/deserialization tests
  - CMK provider tests (Local, Azure, Alibaba)

- **Documentation**
  - Complete README with installation, quick start, API reference
  - Type mapping matrix (Java ↔ Node.js)
  - Algorithm comparison table
  - Security best practices
  - Troubleshooting guide
  - Configuration management guide
  - 6 integration examples covering various use cases

### Security Features
- **Zero third-party crypto dependencies** - Uses native Node.js `crypto` module
- **Authenticated encryption** - AES-256-GCM provides integrity + confidentiality
- **Key versioning** - Per-entity DEK isolation with `kid`-based rotation
- **Blind indexing** - HMAC-SHA-256 for encrypted field queries (no plaintext leakage)
- **Secure key destruction** - `crypto.randomFillSync()` overwrites sensitive buffers
- **Optimistic locking** - Protects against concurrent DEK rotation conflicts
- **KCV verification** - Detects key corruption before decryption
- **Binding verification** - Ensures DEK/HMAC key pair integrity

### Known Limitations
- **SM4-GCM deferred** - Not supported in current OpenSSL versions (< 3.3)
- **No range queries** - Encrypted fields cannot use `$gt`, `$lt`, etc. (by design)
- **No full-text search** - Encrypted fields cannot be searched with `$text`
- **No regex queries** - Encrypted fields cannot use pattern matching
- **Single entity per vault** - Each Mongoose model gets its own DEK vault

### Dependencies
**Peer:**
- `mongoose@>=8.0.0` (supports 8.x and 9.x)

**Optional:**
- `mongoose-long@>=0.8.0` (for Long type support)
- `bson@>=6.0.0` (for Decimal128 support)
- `@azure/keyvault-keys@>=4.0.0` + `@azure/identity@>=4.0.0` (for Azure Key Vault provider)
- `@alicloud/kms20160120@>=3.0.0` + `@alicloud/openapi-client@>=0.4.15` (for Alibaba KMS provider)

**Development:**
- `jest@^29.7.0` (testing framework)
- `mongodb-memory-server@^10.0.0` (in-memory MongoDB for tests)
- `mongoose@^9.0.0` (ODM for dev)

### Compatibility
- **Node.js**: 20.x (recommended), 22.x
- **MongoDB**: 5.0+, 6.0+, 7.0+, 8.0+
- **Mongoose**: 8.x, 9.x
- **Java LightCrypto-Link**: Full BSON format compatibility

---

## Version History

For older versions, see [GitHub Releases](https://github.com/emmansun/lightcrypto-link-node/releases).

---

**Maintained by**: [emmansun](https://github.com/emmansun)
**License**: Apache License 2.0
**Repository**: https://github.com/emmansun/lightcrypto-link-node

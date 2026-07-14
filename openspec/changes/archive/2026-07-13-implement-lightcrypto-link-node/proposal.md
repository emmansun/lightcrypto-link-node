## Why

Node.js microservices need to transparently encrypt/decrypt sensitive fields in MongoDB while maintaining 100% interoperability with the Java LightCrypto-Link ecosystem. Without this library, heterogeneous Java/Node.js architectures cannot share encrypted data, creating data silos and preventing seamless encryption across polyglot microservice environments.

## What Changes

- Introduce `lightcrypto-link-node` library providing transparent field-level encryption for Mongoose/MongoDB
- Implement AES-256-GCM, AES-256-CBC, and SM4-CBC algorithms with native Node.js crypto (zero third-party crypto dependencies)
- Provide Mongoose plugin for automatic encryption/decryption via pre-save/post-find hooks
- Support blind indexing for exact-match queries on encrypted fields
- Implement key vault management (`__lcl_keyvault` collection) with per-entity DEK versioning and rotation
- Support pluggable CMK providers: Local (AES-256-GCM), Azure Key Vault, Alibaba Cloud KMS
- Deliver deterministic type serialization/deserialization ensuring cross-language blind index consistency

## Capabilities

### New Capabilities
- `field-encryption`: Transparent encryption/decryption of Mongoose schema fields with algorithm agility
- `blind-indexing`: HMAC-SHA-256 deterministic blind index generation for exact-match encrypted field queries
- `key-vault`: Per-entity Data Encryption Key (DEK) management with versioning, rotation, and KCV verification
- `cmk-providers`: Pluggable Customer Master Key providers (Local, Azure, Alibaba) for envelope encryption
- `type-serialization`: Cross-language type mapping (Java ↔ Node.js) with deterministic serialization for blind indexes
- `mongo-interoperability`: 100% BSON format compatibility with Java LightCrypto-Link encrypted documents
- `configuration-management`: Multi-source configuration loading (environment variables, secret managers, config files) with validation and precedence rules

### Modified Capabilities
<!-- No existing capabilities to modify - this is a new project -->

## Impact

- **New files**: Complete library implementation under `src/` (crypto, service, provider, plugin, model, config)
- **Dependencies**: Mongoose (existing), optional `mongoose-long` for Java Long support, no mandatory third-party crypto libs
- **MongoDB collections**: New `__lcl_keyvault` collection for key management
- **API surface**: Mongoose plugin API, programmatic encryption API, KeyVaultService for key rotation
- **Interoperability**: Guaranteed format compatibility with Java LightCrypto-Link for shared MongoDB instances

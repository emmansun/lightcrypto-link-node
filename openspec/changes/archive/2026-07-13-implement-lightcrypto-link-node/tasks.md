## 1. Project Setup

- [x] 1.1 Initialize Node.js project with `npm init` and configure `package.json` with name `lightcrypto-link-node`
- [x] 1.2 Add dependencies: `mongoose` (required), `mongoose-long` (optional), `bson` (optional)
- [x] 1.3 Add dev dependencies: `jest` for testing, `mongodb-memory-server` for integration tests
- [x] 1.4 Create project structure: `src/crypto/`, `src/service/`, `src/provider/`, `src/plugin/`, `src/model/`, `src/config/`, `src/index.js`
- [x] 1.5 Create `test/` directory structure matching `src/`
- [x] 1.6 Configure Jest with `testMatch` for `**/*.test.js`
- [x] 1.7 Add scripts to `package.json`: `test`, `test:unit`, `test:integration`, `lint`

## 2. Configuration Management

- [x] 2.1 Create `src/config/LclConfig.js`: configuration loader with multi-source support and precedence hierarchy
- [x] 2.2 Implement environment variable loading: `LCL_CMK_KEY`, `LCL_MONGODB_URI`, `LCL_ALGORITHM`, `LCL_CACHE_TTL`
- [x] 2.3 Implement configuration file loading: `.env.local`, `.env.production`, `config/lcl.json` (use optional `dotenv` dependency)
- [x] 2.4 Implement Kubernetes Secrets integration: read from mounted volume `/var/run/secrets/lightcrypto-link/`
- [x] 2.5 Implement AWS Secrets Manager integration: fetch secrets when `LCL_AWS_SECRET_ID` is set (lazy-load `@aws-sdk/client-secrets-manager`)
- [x] 2.6 Implement Azure Key Vault Secrets integration: fetch secrets when `LCL_AZURE_SECRET_URL` is set (lazy-load `@azure/keyvault-secrets`)
- [x] 2.7 Implement HashiCorp Vault integration: fetch secrets when `LCL_VAULT_ADDR` and `LCL_VAULT_TOKEN` are set (lazy-load `@hashicorp/vault-client`)
- [x] 2.8 Implement configuration validation: validate CMK format (64 hex chars), MongoDB URI format, required fields
- [x] 2.9 Implement environment-specific configuration: load different files based on `NODE_ENV` (development, production, test)
- [x] 2.10 Implement configuration defaults: `AES_256_GCM` algorithm, 1-hour cache TTL, `__lcl_keyvault` collection
- [x] 2.11 Implement configuration logging: log which sources were used, mask secret values in logs
- [x] 2.12 Implement runtime configuration reload: `config.reload()` method with change detection and cache flush
- [x] 2.13 Write unit tests for configuration loader: test precedence hierarchy, validation, file loading, environment detection
- [x] 2.14 Write integration tests for secret manager integration: test Kubernetes Secrets, AWS Secrets Manager, Azure Key Vault, HashiCorp Vault (use mocks or local emulators)

## 3. Cryptography Foundation (Crypto Layer)

- [x] 3.1 Create `src/crypto/SymmetricEncryptor.js` base class with abstract methods: `encrypt()`, `decrypt()`, `computeKcv()`, `getAlgorithm()`
- [x] 3.2 Implement `src/crypto/AesGcmEncryptor.js`: AES-256-GCM with 12-byte IV, output `[IV] || [ciphertext + Auth Tag]`, KCV with zero IV/block
- [x] 3.3 Implement `src/crypto/AesCbcEncryptor.js`: AES-256-CBC with 16-byte IV, PKCS5 padding, output `[IV] || [padded ciphertext]`
- [x] 3.4 Implement `src/crypto/Sm4CbcEncryptor.js`: SM4-CBC with 16-byte key, 16-byte IV, PKCS5 padding, output `[IV] || [padded ciphertext]`
- [x] 3.5 Write unit tests for each encryptor: verify encrypt/decrypt round-trip, validate KCV computation, check output format (IV length, tag position)
- [x] 3.6 Create `src/crypto/CryptoCodec.js`: multi-algorithm dispatch, `encrypt(dek, plaintext, algorithm)`, `decrypt(dek, data, algorithm)`, `computeKcv(key, algorithm)`
- [x] 3.7 Add HMAC methods to `CryptoCodec`: `generateBlindIndex(hmacKey, fieldName, serializedValue)` with Base64URL encoding, `computeBinding(hmacKey, dek)` with hex encoding
- [x] 3.8 Write integration tests for `CryptoCodec`: test blind index determinism, verify HMAC output matches Java implementation

## 4. Type Serialization System

- [x] 4.1 Create `src/service/TypeSerializer.js` with `serialize(value)` returning Buffer, `serializeToString(value)` returning String
- [x] 4.2 Implement String serialization: raw UTF-8 bytes
- [x] 4.3 Implement Integer/Long/Short/Byte serialization: `value.toString()` (matches Java `String.valueOf()`)
- [x] 4.4 Implement Float/Double serialization: `value.toString()`
- [x] 4.5 Implement BigDecimal serialization: `toString()` (no scientific notation, matches Java `toPlainString()`)
- [x] 4.6 Implement Boolean serialization: `"true"` or `"false"`
- [x] 4.7 Implement LocalDate serialization: `"YYYY-MM-DD"` format (UTC, matches Java ISO_LOCAL_DATE)
- [x] 4.8 Implement LocalDateTime serialization: `"YYYY-MM-DDTHH:mm:ss"` format (truncate milliseconds, matches Java ISO_LOCAL_DATE_TIME)
- [x] 4.9 Implement byte[] serialization: Base64 encoding (RFC 4648, matches Java standard Base64)
- [x] 4.10 Implement Enum serialization: store as String with `"ENUM:<fqcn>"` type marker
- [x] 4.11 Write unit tests: verify serialization determinism (same input → same output), validate output matches Java examples

## 5. Type Deserialization System

- [x] 5.1 Create `src/service/TypeDeserializer.js` with `deserialize(typeMarker, bytes)` returning original JavaScript type
- [x] 5.2 Implement STR deserialization: return String
- [x] 5.3 Implement INT deserialization: parse as Number (with precision warning for values > 2^31-1)
- [x] 5.4 Implement LONG deserialization: use `mongoose-long` if available, else return Number with precision warning
- [x] 5.5 Implement DEC deserialization: convert to Decimal128 object
- [x] 5.6 Implement BOOL deserialization: parse `"true"`/`"false"` to Boolean
- [x] 5.7 Implement LDATE deserialization: parse `"YYYY-MM-DD"` as Date (UTC midnight)
- [x] 5.8 Implement LDT deserialization: parse `"YYYY-MM-DDTHH:mm:ss"` as Date (millisecond precision)
- [x] 5.9 Implement BYTES deserialization: return raw Buffer (no string conversion)
- [x] 5.10 Implement ENUM deserialization: return String (enum name, no Java class reconstruction)
- [x] 5.11 Write unit tests: verify round-trip (serialize → deserialize), test edge cases (negative numbers, null values, large numbers)

## 6. CMK Provider Infrastructure

- [x] 6.1 Create `src/provider/CmkProvider.js` base class with methods: `getProviderId()`, `getPublicReference()`, `wrap(plaintextKey)`, `unwrap(wrappedKey)`
- [x] 6.2 Define `WrappedKey` model: `{ ciphertext: Buffer, algorithm: String, metadata: Object }`
- [x] 6.3 Implement `src/provider/LocalCmkProvider.js`: AES-256-GCM key wrapping with 12-byte IV, 32-byte CMK
- [x] 6.4 Write unit tests for `LocalCmkProvider`: test wrap/unwrap round-trip, validate output format `[IV] || [ciphertext + Auth Tag]`, verify public reference format `"local-cmk-sha256:{8 hex chars}"`

## 7. Key Vault Management

- [x] 7.1 Create `src/model/KeyVaultDocument.js`: Mongoose schema with `_id`, `v`, `status`, `activeKid`, `keys[]`, `cmk`, `createdAt`, `updatedAt`
- [x] 7.2 Define `KeyVersionEntry` sub-document: `kid`, `status`, `dek`, `hmk`, `binding`, `createdAt`
- [x] 7.3 Define `WrappedKeyInfo` sub-document: `wrapped` (Buffer), `algorithm` (String), `kcv` (String), `cmkVersion` (String)
- [x] 7.4 Create `src/service/KeyVaultService.js` with: `ensureVaultInitialized(entityName)`, `getActiveKid()`, `getDek(kid)`, `getHmacKey(kid)`, `rotateDek(entityName)`
- [x] 7.5 Implement vault initialization: create `__lcl_keyvault` collection, generate initial DEK/HMAC key pair, wrap with CMK, compute KCV/binding, insert vault document with `_id: "lcl-dek-{entityName}"`
- [x] 7.6 Implement `kid` generation: format `"v{version}-{8 hex chars}"` (e.g., `"v1-a3b2c1d4"`)
- [x] 7.7 Implement DEK caching: in-memory `Map` with 1-hour TTL (3600000 ms), cache key by entity name
- [x] 7.8 Implement vault loading: query `__lcl_keyvault` by `_id`, unwrap all keys, verify KCV, verify binding, populate cache
- [x] 7.9 Implement `rotateDek()`: mark current ACTIVE as ROTATED, generate new key entry with incremented version, update `activeKid`, use optimistic locking with `{ _id, activeKid, v }` filter
- [x] 7.10 Implement `flushCache()`: securely destroy cached keys using `crypto.randomFillSync()`, clear cache Map
- [x] 7.11 Write integration tests for `KeyVaultService`: test vault initialization, DEK rotation, KCV verification, binding verification, cache hit/miss, concurrent rotation protection

## 8. Field Encryption Service

- [x] 8.1 Create `src/service/FieldCryptoService.js` with: `encryptField(value, fieldName, dek, hmacKey, activeKid, algorithm, blindIndex)`, `decryptField(subDocument, dek, hmacKey, algorithm)`
- [x] 8.2 Implement `encryptField()`: serialize value, encrypt with algorithm, compute blind index if enabled, build sub-document with `_e`, `_k`, `_a`, `_t`, `c`, `b`
- [x] 8.3 Implement `decryptField()`: validate `_e === 1`, extract `_k`, `_a`, `_t`, `c`, `b`, decrypt ciphertext, deserialize based on `_t` marker
- [x] 8.4 Implement error handling: throw `FatalCryptoError` for missing `_k`, `DecryptionError` for unsupported algorithm, `DecryptionError` for KCV mismatch
- [x] 8.5 Write unit tests: test encryption with all algorithms, test decryption of Java-generated ciphertext, test blind index generation, test type marker handling

## 9. Mongoose Plugin (Transparent Encryption)

- [x] 9.1 Create `src/plugin/lclCryptoPlugin.js`: Mongoose plugin function `lclCryptoPlugin(schema, options)`
- [x] 9.2 Implement schema scanning: iterate `schema.eachPath()`, collect fields with `encrypt: true` option
- [x] 9.3 Implement schema transformation: for encrypted fields, modify schema to store `{ c: Buffer, b: String }` sub-document
- [x] 9.4 Implement `pre('save')` hook: encrypt marked fields before persistence, replace plaintext with encrypted sub-document
- [x] 9.5 Implement `post('find')` hook: decrypt encrypted sub-documents after retrieval, restore plaintext values
- [x] 9.6 Implement `post('findOne')` hook: decrypt encrypted sub-documents after single document retrieval
- [x] 9.7 Write integration tests: test save → retrieve round-trip, verify encrypted fields are stored as sub-documents, verify decrypted values match original plaintext

## 10. Query Rewriting (Blind Index Support)

- [x] 10.1 Create `src/plugin/queryRewriter.js`: intercept Mongoose `find()` queries, rewrite field name conditions to blind index conditions
- [x] 10.2 Implement query interception: check if query fields have `blindIndex: true` option
- [x] 10.3 Implement exact-match rewriting: `{ phone: "13800138000" }` → `{ "phone.b": "<blind-index>" }`
- [x] 10.4 Implement `$in` operator rewriting: `{ phone: { $in: [...] } }` → `{ "phone.b": { $in: [<indexes>] } }`
- [x] 10.5 Implement query rewriter registration: attach to Mongoose schema via plugin
- [x] 10.6 Write integration tests: test exact-match query rewriting, test `$in` query rewriting, verify blind indexes match Java output

## 11. Cloud KMS Providers (Optional)

- [x] 11.1 Implement `src/provider/AzureKmsProvider.js`: Azure Key Vault RSA-OAEP wrapping (lazy-load `@azure/keyvault-keys`)
- [x] 11.2 Implement `src/provider/AlibabaKmsProvider.js`: Alibaba Cloud KMS wrapping (lazy-load `@alicloud/kms20160120`)
- [x] 11.3 Write unit tests for Azure provider: test wrap/unwrap round-trip, verify algorithm is RSA-OAEP
- [x] 11.4 Write unit tests for Alibaba provider: test wrap/unwrap round-trip, verify Base64 encoding/decoding
- [x] 11.5 Add documentation: CMK provider configuration examples, Azure setup guide, Alibaba setup guide

## 12. Java Interoperability Testing

- [x] 12.1 Create `test/interoperability/java-nodejs.test.js`: test Java-encrypted documents can be decrypted by Node.js
- [x] 12.2 Create test fixtures: Java-generated encrypted documents in MongoDB format (BSON JSON with `$binary`)
- [x] 12.3 Test AES-256-GCM interoperability: Node.js decrypts Java AES-256-GCM ciphertext
- [x] 12.4 Test AES-256-CBC interoperability: Node.js decrypts Java AES-256-CBC ciphertext
- [x] 12.5 Test SM4-CBC interoperability: Node.js decrypts Java SM4-CBC ciphertext (if Java supports it)
- [x] 12.6 Test blind index interoperability: Node.js computes blind index, verifies it matches Java's output for same input
- [x] 12.7 Test key vault interoperability: Node.js reads Java-generated `__lcl_keyvault` documents, unwraps DEKs successfully
- [x] 12.8 Test type marker interoperability: verify all type markers match Java's `TypeSerializer.resolveTypeMarker()` output
- [x] 12.9 Test error handling interoperability: verify error messages match Java exception messages

## 13. Documentation

- [x] 13.1 Create `README.md`: installation guide, quick start example, API reference
- [x] 13.2 Document Mongoose plugin usage: schema definition, plugin registration, query examples
- [x] 13.3 Document key vault management: vault initialization, DEK rotation, KCV verification
- [x] 13.4 Document type mapping: Java ↔ Node.js type compatibility matrix, serialization rules, deserialization behavior
- [x] 13.5 Document CMK providers: Local, Azure, Alibaba configuration examples
- [x] 13.6 Document limitations: SM4-GCM deferred, no range queries on encrypted fields, no full-text search
- [x] 13.7 Document security best practices: DEK caching, key destruction, secure CMK storage
- [x] 13.8 Document troubleshooting: common errors (KCV mismatch, missing `_k`, unsupported algorithm), debugging steps
- [x] 13.9 Document configuration management: environment variables, secret managers, config files, precedence rules

## 14. Integration Examples

- [x] 14.1 Create `examples/basic-crud.js`: complete example with User schema, phone/ssn encryption, blind index query
- [x] 14.2 Create `examples/multi-algorithm.js`: example using AES-256-GCM, AES-256-CBC, SM4-CBC on different fields
- [x] 14.3 Create `examples/key-rotation.js`: example demonstrating DEK rotation and backward compatibility
- [x] 14.4 Create `examples/azure-kms.js`: example using Azure Key Vault CMK provider
- [x] 14.5 Create `examples/alibaba-kms.js`: example using Alibaba Cloud KMS provider
- [x] 14.6 Create `examples/config-from-env.js`: example demonstrating configuration from environment variables and secret managers

## 15. Final Validation

- [x] 15.1 Run all unit tests: ensure 100% pass rate
- [x] 15.2 Run all integration tests: ensure 100% pass rate
- [x] 15.3 Run Java interoperability tests: verify Node.js ↔ Java compatibility
- [x] 15.4 Perform security audit: review crypto implementations for vulnerabilities, verify no third-party crypto dependencies
- [x] 15.5 Review code quality: ensure consistent style, add JSDoc comments, verify error handling
- [x] 15.6 Create release checklist: version bump, changelog, npm publish steps

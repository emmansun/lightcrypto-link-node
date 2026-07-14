## Context

Node.js microservices operating in polyglot environments with Java services must transparently encrypt/decrypt sensitive fields in shared MongoDB instances. The Java LightCrypto-Link library (at `D:\github\LightCrypto-Link`) provides proven field-level encryption with envelope encryption (CMK wrapping DEK) and blind indexing for exact-match queries. The Node.js version must achieve 100% interoperability — encrypted documents written by Java must be seamlessly readable by Node.js and vice versa.

**Constraints:**
- Zero mandatory third-party crypto dependencies (use native Node.js `crypto` module)
- SM4-GCM not available in OpenSSL < 3.3 — defer until widely supported
- Must support AES-256-GCM (primary), AES-256-CBC (legacy), SM4-CBC (China compliance)
- Mongoose plugin pattern for transparent encryption (similar to Java's `@Encrypted` annotation)
- Key vault stored in `__lcl_keyvault` collection with per-entity DEK versioning

## Goals / Non-Goals

**Goals:**
- 100% BSON format compatibility with Java LightCrypto-Link encrypted documents
- Automatic encryption/decryption via Mongoose pre-save/post-find hooks
- Blind indexing for exact-match queries on encrypted fields
- Key vault management with DEK rotation and KCV verification
- Pluggable CMK providers: Local (AES-256-GCM), Azure Key Vault, Alibaba Cloud KMS
- Deterministic type serialization ensuring cross-language blind index consistency
- Memory-efficient DEK caching with secure key destruction

**Non-Goals:**
- Range queries on encrypted fields (not supported — requires different indexing strategy)
- Full-text search on encrypted data (out of scope)
- SM4-GCM support (deferred until OpenSSL 3.3+ widespread adoption)
- Real-time key synchronization across distributed Node.js instances (cache TTL handles staleness)
- Custom encryption algorithms beyond those supported by Java LightCrypto-Link

## Decisions

### 0. Configuration Management Strategy
**Decision:** Multi-source configuration loading with environment variables as primary source, secret managers as secondary, and configuration files as tertiary.

**Rationale:**
- Node.js microservices run in diverse environments (local, Docker, Kubernetes, cloud)
- Environment variables are the 12-factor app standard for configuration
- Secret managers (AWS Secrets Manager, Azure Key Vault, HashiCorp Vault) provide secure credential storage
- Configuration files support local development and testing
- Precedence hierarchy allows override at any level

**Configuration sources (highest to lowest priority):**
1. Environment variables: `LCL_CMK_KEY`, `LCL_MONGODB_URI`, `LCL_ALGORITHM`, etc.
2. Secret management: Kubernetes Secrets, AWS Secrets Manager, Azure Key Vault Secrets, HashiCorp Vault
3. Configuration files: `.env.local`, `.env.production`, `config/lcl.json`
4. Application defaults: `AES_256_GCM` algorithm, 1-hour cache TTL, `__lcl_keyvault` collection

**Configuration validation:**
- CMK must be exactly 64 hex characters (32 bytes) for LocalCmkProvider
- MongoDB URI must be valid connection string
- Missing required values throw `ConfigurationException` with clear error messages

**Alternatives considered:**
- Hardcoded configuration only: Rejected — not flexible for production use
- Configuration file only: Rejected — secrets should not be in files
- Single secret manager only: Rejected — limits portability across environments

### 1. Algorithm Support Strategy
**Decision:** Support AES-256-GCM, AES-256-CBC, and SM4-CBC using native Node.js `crypto` module. Defer SM4-GCM.

**Rationale:**
- Node.js v24.18.0 + OpenSSL natively supports `aes-256-gcm`, `aes-256-cbc`, and `sm4-cbc`
- SM4-GCM requires OpenSSL 3.3+ which is not yet widely adopted
- Zero third-party crypto dependencies align with lightweight, secure-first principle
- Java Bouncy Castle SM4-GCM interoperability can be added later without breaking changes

**Alternatives considered:**
- Add `sm-crypto` library for SM4-GCM: Rejected due to dependency bloat and limited interoperability value
- Force SM4-GCM via BouncyCastle.js: Rejected due to performance overhead and compatibility risks

### 2. Encrypted Sub-Document Format
**Decision:** Use exact Java-compatible BSON structure with fields: `_e` (marker), `_k` (kid), `_a` (algorithm), `_t` (type), `c` (ciphertext), `b` (blind index optional).

**Rationale:**
- Field-level encryption must be wire-compatible with Java for shared MongoDB instances
- Java `FieldCryptoService.decryptSubDocument()` expects this exact structure
- `_k` field enables multi-DEK architecture with per-entity vault isolation
- `_t` field preserves type information for cross-language deserialization

**Ciphertext packing format:**
- GCM modes: `[IV (12B)] || [Ciphertext] || [Auth Tag (16B)]`
- CBC modes: `[IV (16B)] || [PKCS5-padded Ciphertext]`

### 3. Key Vault Architecture
**Decision:** Per-entity DEK stored in `__lcl_keyvault` collection with `kid`-based versioning and in-memory caching.

**Rationale:**
- Java uses `lcl-dek-{EntitySimpleName}` vault ID pattern — Node.js must match exactly
- `keys[]` array supports rotation without re-encrypting historical data
- KCV (Key Check Value) verification prevents key corruption
- Binding hash (HMAC-SHA-256(hmacKey, dek)) ensures DEK/HMAC key pair integrity
- DEK cache with 1-hour TTL balances performance and security

**Cache structure:**
```javascript
Map<entityName, { dek: Buffer, hmacKey: Buffer, activeKid: string, expiresAt: number }>
```

### 4. Blind Index Determinism
**Decision:** HMAC-SHA-256(hmacKey, `fieldName:serializedValue`) with Base64URL encoding (no padding).

**Rationale:**
- Java `CryptoCodec.generateBlindIndex()` uses this exact algorithm
- Deterministic serialization is critical: same value must produce same blind index across languages
- Base64URL without padding matches Java output format
- Field name included in HMAC input enables cross-field index isolation

**Serialization rules:**
- String: raw UTF-8 bytes
- Integer/Long/Short/Byte: `value.toString()` (matches Java `String.valueOf()`)
- BigDecimal: `toString()` (matches Java `toPlainString()`)
- Boolean: `"true"` or `"false"`
- LocalDate: `"YYYY-MM-DD"` (matches Java ISO_LOCAL_DATE)
- LocalDateTime: `"YYYY-MM-DDTHH:mm:ss"` (matches Java ISO_LOCAL_DATE_TIME)

### 5. Mongoose Plugin Pattern
**Decision:** Extend Mongoose schema with `encrypt: true` option and register plugin via `schema.plugin()`.

**Rationale:**
- Mirrors Java's `@Encrypted` annotation pattern for developer familiarity
- `pre('save')` hook encrypts fields before persistence
- `post('find')`, `post('findOne')` hooks decrypt after retrieval
- Query rewriter intercepts `find()` calls and converts field names to blind index queries
- Plugin model enables selective adoption (not all collections need encryption)

**Schema transformation:**
```javascript
// User declares:
phone: { type: String, encrypt: true }

// Plugin internally transforms to:
phone: { c: Buffer, b: String }  // encrypted sub-document
```

### 6. Type Mapping Strategy
**Decision:** Use `_t` type markers and JavaScript type coercion rules for serialization/deserialization.

**Rationale:**
- Java strong typing requires explicit type markers in BSON
- Node.js dynamic typing requires explicit conversion rules
- Mongoose schema types provide runtime type hints

**Type matrix:**
| Java Type | `_t` Marker | Mongoose Schema | Node.js Handling |
|---|---|---|---|
| String | STR | String | Direct |
| Integer | INT | Number | `toString()` |
| Long | LONG | `mongoose-long` | `toString()` |
| BigDecimal | DEC | Decimal128 | `toString()` |
| Boolean | BOOL | Boolean | `"true"/"false"` |
| LocalDate | LDATE | Date | `"YYYY-MM-DD"` |
| LocalDateTime | LDT | Date | ISO truncated |
| byte[] | BYTES | Buffer | Base64 |

## Risks / Trade-offs

**[Risk] Java Long precision loss in JavaScript** → Mitigation: Require `mongoose-long` for Long fields, document that developers must not use arithmetic on decrypted Long values.

**[Risk] SM4-GCM incompatibility with Java Bouncy Castle** → Mitigation: Document SM4-GCM as "deferred", recommend AES-256-GCM for cross-language use cases, provide clear migration path when OpenSSL 3.3+ available.

**[Risk] Blind index collision for similar field names** → Mitigation: Include field name in HMAC input, document that `fieldName` option in schema can override default (matches Java `@Encrypted(fieldName=...)`).

**[Risk] Concurrent key rotation race conditions** → Mitigation: Use optimistic locking with `activeKid + v` version check (matches Java `persistRotatedVault()`).

**[Trade-off] DEK cache TTL vs. security** → Mitigation: 1-hour TTL balances performance (avoid KMS HTTP latency) and security (limit exposure window). Provide `flushCache()` API for immediate key destruction.

**[Trade-off] No range queries on encrypted fields** → Mitigation: Document limitation clearly, recommend application-level filtering or separate indexing strategy for range requirements.

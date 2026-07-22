# Architecture

## SPI Layer (src/spi/)

lightcrypto-link-node defines 4 abstract SPI (Service Provider Interface) base classes for pluggable data storage:

| SPI Interface | Purpose | Default Implementation |
|---------------|---------|----------------------|
| `StorageAdapter` | Encrypted payload construction and parsing | `MongooseStorageAdapter` |
| `DocumentAccessor` | Field-level document access | `MongooseDocumentAccessor` |
| `StructuredValueCodec` | Structured value serialization (DOC/COL/MAP) | `BsonStructuredValueCodec` |
| `QueryTransformer` | Blind-index query rewriting | `MongooseQueryTransformer` |

### StorageAdapter

Defines the on-disk sub-document format. The Mongoose implementation produces `{ c, _e: 1, _t, b? }` payloads compatible with Java `MongoStorageAdapter`.

### DocumentAccessor

Abstracts field access on documents. The Mongoose implementation uses bracket notation for plain objects and Mongoose Documents.

### StructuredValueCodec

Serializes structured values (DOC, MAP, COL) to binary. The BSON implementation matches Java `BsonStructuredValueCodec` byte-for-byte.

### QueryTransformer

Rewrites query fields and values for blind-index lookups. The Mongoose implementation appends `.b` to field paths and computes HMAC-based blind indexes.

Custom SPI implementations can be provided via plugin options:

```javascript
schema.plugin(lclCryptoPlugin, {
  keyVaultService,
  cmkProvider,
  storageAdapter: new CustomStorageAdapter(),
  structuredValueCodec: new CustomStructuredValueCodec()
});
```

## Envelope Encryption

lightcrypto-link-node uses envelope encryption:

1. A **Customer Master Key (CMK)** wraps/unwraps per-entity **Data Encryption Keys (DEKs)**
2. DEKs encrypt/decrypt actual field data
3. HMAC keys provide blind indexing and binding verification

## Key Vault Storage

Keys are stored in the `__lcl_keyvault` collection with per-entity isolation:

```json
{
  "_id": "lcl-dek-User",
  "v": 1,
  "activeKid": "v1-a3b2c1d4",
  "keys": [
    {
      "kid": "v1-a3b2c1d4",
      "status": "ACTIVE",
      "dek": { "wrapped": "<Buffer>", "algorithm": "AES_256_GCM", "kcv": "abcd1234", "cmkVersion": "..." },
      "hmk": { "wrapped": "<Buffer>", "algorithm": "AES_256_GCM", "kcv": "efgh5678", "cmkVersion": "..." },
      "binding": "hmac-hex-string"
    }
  ],
  "cmk": { "provider": "local-symmetric", "id": "local-cmk-sha256:abcd1234" }
}
```

### Key Fields

| Field | Description |
|-------|-------------|
| `_id` | `lcl-dek-{entityName}` — one vault per Mongoose model |
| `v` | Document version for optimistic locking |
| `activeKid` | Currently active key ID for new encryptions |
| `keys[]` | Array of key version entries |
| `keys[].kid` | Key ID in format `v{version}-{8 hex chars}` |
| `keys[].status` | `ACTIVE`, `ROTATED`, or `REVOKED` |
| `keys[].dek` | Wrapped DEK with algorithm, KCV, and optional cmkVersion |
| `keys[].hmk` | Wrapped HMAC key (same structure as DEK) |
| `keys[].binding` | HMAC binding hash proving DEK/HMAC key pair integrity |
| `cmk` | CMK provider info and public reference |

## Encrypted Field Storage Format

Encrypted fields are stored as sub-documents:

```json
{
  "_e": 1,
  "_k": "v1-a3b2c1d4",
  "_a": "AES_256_GCM",
  "_t": "STR",
  "c": "AQEAFGRlZmF1bHQuZGVmYXVsdC5Vc2VyI3Bob25lAAAAAQw...",
  "b": "ylXcNVT8lNaPzZyV_2JQqpEBxx4_KSnGMhW-C01kV_E"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `_e` | Number | Encryption version (always `1`) |
| `_k` | String | Key ID (`kid`) used for encryption |
| `_a` | String | Algorithm identifier |
| `_t` | String | Type marker for deserialization |
| `c` | String | Ciphertext as Base64URL-encoded Wire Format V1 blob |
| `b` | String | Blind index (optional, only if `blindIndex: true`) |

## Wire Format V1

The `c` field contains a Base64URL-encoded binary blob with the following structure:

```
[1B version=0x01][1B algId][2B nsLen BE][NB namespace UTF-8][4B dekVersion BE][1B ivLen][IV bytes][2B aadExtLen=0x0000][ciphertext bytes]
```

| Offset | Size | Description |
|--------|------|-------------|
| 0 | 1 | Wire format version (`0x01`) |
| 1 | 1 | Algorithm ID (`0x01`=AES_256_GCM, `0x02`=AES_256_CBC, `0x03`=SM4_GCM, `0x04`=SM4_CBC) |
| 2 | 2 | Namespace length (big-endian) |
| 4 | N | Namespace UTF-8 bytes (`tenant.realm.entity#field`) |
| 4+N | 4 | DEK version (big-endian) |
| 8+N | 1 | IV length |
| 9+N | IV | Initialization vector bytes |
| 9+N+IV | 2 | AAD extension length (always `0x0000`) |
| 11+N+IV | rest | Ciphertext bytes (CT||Tag for GCM, padded CT for CBC) |

### AAD Construction (GCM modes only)

```
AAD = [0x01][algId byte][namespace UTF-8 bytes][dekVersion 4B big-endian]
```

AAD provides authenticated but unencrypted metadata, binding the ciphertext to its namespace and DEK version.

## Key Rotation

```javascript
// Rotate DEK for an entity
await keyVaultService.rotateDek('User');

// Flush cache to pick up new keys
keyVaultService.flushCache();
```

### Rotation Behavior

1. Current `ACTIVE` key is marked as `ROTATED`
2. New DEK/HMAC key pair is generated and wrapped with CMK
3. `activeKid` is updated to the new key
4. New encryptions use the new key
5. Old encryptions are still readable (backward compatible via `kid` lookup)
6. Optimistic locking prevents concurrent rotation conflicts

## Supported Algorithms

| Algorithm | Key Size | IV Size | Status |
|-----------|----------|---------|--------|
| AES-256-GCM | 32 bytes | 12 bytes | Supported (default) |
| AES-256-CBC | 32 bytes | 16 bytes | Supported (legacy) |
| SM4-CBC | 16 bytes | 16 bytes | Supported (China compliance) |
| SM4-GCM | 16 bytes | 12 bytes | Registry only (sm4-gcm not available in Node.js OpenSSL) |

## Backward Compatibility

- If `_a` is missing in legacy data, decryption falls back to the configured algorithm (typically `AES_256_GCM`).
- If `_e` is undefined (plaintext historical data), the value is returned as-is without decryption.
- This enables gradual migration from plaintext to encrypted data.

## Namespace Model

Each encrypted field is associated with a **four-part namespace**: `tenant.realm.entity#field`.

- **Shorthand**: `Entity#field` expands to `default.default.Entity#field`
- **Canonical form**: Always stored as `tenant.realm.entity#field` (e.g., `default.default.User#phone`)
- **Purpose**: Isolates encryption and blind index contexts across tenants, realms, and entities
- The namespace is embedded in the Wire Format V1 blob and used in AAD construction

## Blind Index

When `blindIndex: true` is set on a schema field, a deterministic blind index is computed:

1. **HKDF-SHA256 key derivation**: A namespace-scoped HMAC key is derived from the master HMAC key:
   ```
   derivedKey = HKDF-SHA256(
     IKM = masterHmacKey,
     Salt = SHA-256(namespace.canonicalBytes()),
     Info = "lcl-blind-index-v1",
     L = 32
   )
   ```
2. **HMAC-SHA256 computation**: The blind index is computed as:
   ```
   blindIndex = HMAC-SHA256(derivedKey, fieldName + ":" + normalize(value))
   ```
   where `normalize()` applies `trim().toLowerCase()` to string values.
3. The result is stored as Base64URL (no padding) in the `b` field.
4. Mongoose query middleware rewrites exact-match queries to target the blind index field.

This two-step process (HKDF derivation + HMAC) ensures that blind indexes are isolated per namespace, preventing cross-tenant or cross-entity correlation.

## DEK Caching

- In-memory cache with configurable TTL (default: 1 hour)
- Cache key is entity name
- `flushCache()` securely destroys cached keys using `crypto.randomFillSync()`

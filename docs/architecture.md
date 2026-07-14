# Architecture

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
  "c": "<Buffer>",
  "b": "base64url-blind-index"
}
```

| Field | Description |
|-------|-------------|
| `_e` | Encryption version (always `1`) |
| `_k` | Key ID (`kid`) used for encryption |
| `_a` | Algorithm identifier |
| `_t` | Type marker for deserialization |
| `c` | Ciphertext as BSON binary |
| `b` | Blind index (optional, only if `blindIndex: true`) |

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
| SM4-GCM | 16 bytes | 12 bytes | Deferred (needs OpenSSL 3.3+) |

## Backward Compatibility

- If `_a` is missing in legacy data, decryption falls back to the configured algorithm (typically `AES_256_GCM`).
- If `_e` is undefined (plaintext historical data), the value is returned as-is without decryption.
- This enables gradual migration from plaintext to encrypted data.

## Blind Index

When `blindIndex: true` is set on a schema field:
- Deterministic HMAC-SHA-256 is computed from the serialized value + field context.
- Stored in the `b` field of the encrypted sub-document.
- Mongoose query middleware rewrites exact-match queries to target the blind index field.

## DEK Caching

- In-memory cache with configurable TTL (default: 1 hour)
- Cache key is entity name
- `flushCache()` securely destroys cached keys using `crypto.randomFillSync()`

## Context

Both cloud KMS providers (Azure Key Vault and Alibaba Cloud KMS) require `cmkVersion` and `publicKeyPem` to be explicitly provided in configuration. In production, CMK key versions change with every key rotation. Hardcoding these values causes the system to use stale keys after rotation, breaking unwrap operations and potentially causing data loss.

The Java reference implementations (AKV.js and AliKMS.js) already have the pattern of querying key metadata from the KMS:
- **AKV.js**: `getLatestKeyVaultKey(keyName)` returns a `KeyVaultKey` with `properties.version` and JWK public key material; `buildPublicKeyPEMFromJWK(keyVaultKey)` converts the JWK to PEM
- **AliKMS.js**: `getKEKList(keyId)` calls `ListKeyVersions` + `GetPublicKey` for each version; `getPublicKey(keyId, keyVersionId)` fetches the public key PEM

Neither reference implementation relies on hardcoded version/public key values.

**Constraints:**
- Both providers lazy-load their SDK dependencies via `_ensureClient()` / `_ensureKeyClient()`
- `wrap()` needs both `cmkVersion` and `publicKeyPem` (for local wrap mode)
- `unwrap()` only needs `cmkVersion` (read from stored metadata, not resolved)
- AKV `getKey()` returns both version and JWK in a single API call
- Alibaba requires two separate API calls: `ListKeyVersions` (to get latest versionId) + `GetPublicKey` (to get PEM)

## Goals / Non-Goals

**Goals:**
- Auto-resolve `cmkVersion` from KMS when not explicitly configured
- Auto-resolve `publicKeyPem` from KMS when not explicitly configured (AKV from JWK, Alibaba via GetPublicKey API)
- Cache resolved metadata for the provider lifetime (no repeated API calls on every `wrap()`)
- Maintain backward compatibility: explicit config always takes precedence
- Keep lazy-loading pattern (SDK not loaded until first KMS operation)

**Non-Goals:**
- Automatic re-resolution on CMK rotation events (no push-based invalidation)
- Multi-version key management (KEK list browsing, rotation orchestration)
- TTL-based cache expiry (cache lives for provider lifetime)
- Modifying `unwrap()` behavior (unwrap correctly reads cmkVersion from stored metadata)

## Decisions

### 1. Single `_ensureResolved()` method combining version + public key resolution

**Decision**: Add a single `_ensureResolved()` method to each cloud provider that is called at the start of `wrap()`. This method resolves both `cmkVersion` and `publicKeyPem` in one logical step.

**Rationale**: For AKV, both values come from the same `getKey()` API call — splitting them into separate methods would cause a redundant second call. For Alibaba, the two calls are sequential anyway (version must be known before fetching public key).

**Alternative**: Separate `_resolveCmkVersion()` and `_resolvePublicKey()` methods — rejected because AKV would make two identical `getKey()` calls, and coupling them is cleaner.

### 2. AKV: Build PEM from JWK using Node.js crypto

**Decision**: When `publicKeyPem` is not configured, extract the JWK (`kty`, `n`, `e`) from the `KeyVaultKey` returned by `getKey()`, then use `crypto.createPublicKey({ key: { kty, n, e }, format: 'jwk' })` and export as PEM. This matches the `AKV.buildPublicKeyPEMFromJWK()` pattern exactly.

**Rationale**: Avoids adding a JWK-to-PEM library dependency. Node.js `crypto` natively supports JWK import.

### 3. Alibaba: ListKeyVersions + GetPublicKey two-step resolution

**Decision**: For asymmetric keys without `cmkVersion`, call `ListKeyVersions(keyId, pageNumber=1, pageSize=1)` to get the latest `keyVersionId`, then `GetPublicKey(keyId, keyVersionId)` to get the PEM. For symmetric keys, only `ListKeyVersions` is needed (no public key).

**Rationale**: Alibaba KMS has no single API that returns both version and public key together. `pageSize=1` minimizes data transfer. Symmetric keys don't need a public key PEM.

**Alternative**: Fetch all versions via paginated `ListKeyVersions` — rejected as unnecessary; we only need the latest for `wrap()`.

### 4. Cache for provider lifetime, no TTL

**Decision**: Once resolved, `_cmkVersion` and `_publicKeyPem` are cached on the provider instance and never re-fetched. To pick up a rotated key, create a new provider instance (or call a future `refresh()` method).

**Rationale**: The KeyVaultService creates provider instances per configuration lifecycle. CMK rotation is an infrequent administrative operation, not a runtime event. A new provider instance is created when configuration is reloaded.

### 5. `_ensureResolved()` only called in `wrap()`, not `unwrap()`

**Decision**: `unwrap()` continues to read `cmkVersion` from `wrappedKey.metadata.cmkVersion`. Auto-resolution is only triggered by `wrap()`.

**Rationale**: Unwrap must use the exact version that was used for wrapping, not the current latest. Calling `_ensureResolved()` during unwrap would be semantically wrong and could fail to decrypt keys wrapped with a previous version.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| First `wrap()` call incurs network latency for metadata resolution | Cache ensures only first call pays the cost; subsequent `wrap()` calls are instant |
| KMS API failure during resolution prevents any `wrap()` | Surface clear error message; user can provide explicit `cmkVersion`/`publicKeyPem` as fallback |
| Stale cached metadata after CMK rotation | Document that provider instance should be recreated on rotation; future `refresh()` method can be added |
| AKV `getKey()` may fail if vaultUrl is not configured | Already throws clear error in `_ensureKeyClient()`; same behavior propagates |
| Alibaba `ListKeyVersions` may return empty for a newly created key | Handle empty response gracefully with descriptive error |

## 1. AzureKmsProvider Auto-Resolution

- [x] 1.1 Replace `_resolveCmkVersion()` with `_ensureResolved()` in `src/provider/AzureKmsProvider.js` that: (a) returns early if both `_cmkVersion` and `_publicKeyPem` are already set; (b) calls `keyClient.getKey(keyName)` once; (c) sets `_cmkVersion = key.properties.version`; (d) if `_publicKeyPem` is null, builds PEM from JWK using `crypto.createPublicKey({ key: { kty: key.key.kty, n: key.key.n.toString('base64'), e: key.key.e.toString('base64') }, format: 'jwk' }).export({ type: 'spki', format: 'pem' })`
- [x] 1.2 Update `wrap()` to call `_ensureResolved()` instead of `_resolveCmkVersion()`. Remove the old `_resolveCmkVersion()` method.
- [x] 1.3 Update `getCmkVersion()` to return `_cmkVersion` (now populated after resolution or from config).

## 2. AlibabaKmsProvider Auto-Resolution

- [x] 2.1 Add `_ensureResolved()` in `src/provider/AlibabaKmsProvider.js` that: (a) returns early if `_cmkVersion` is set (and `_publicKeyPem` is set for asymmetric); (b) for asymmetric keys: calls `ListKeyVersions(keyId, pageNumber=1, pageSize=1)` to get latest `keyVersionId`; (c) for asymmetric keys without `publicKeyPem`: calls `GetPublicKey(keyId, keyVersionId)` to get PEM; (d) caches both values
- [x] 2.2 Update `wrap()` to call `await this._ensureResolved()` at the start (before the local-wrap branch) so that both `_cmkVersion` and `_publicKeyPem` are available for local asymmetric wrap.
- [x] 2.3 Ensure `_ensureResolved()` uses `_ensureClient()` for SDK initialization and includes `@alicloud/tea-util` RuntimeOptions matching the AliKMS.js reference pattern.

## 3. CmkProvider Base Class

- [x] 3.1 Add an `_ensureResolved()` stub to `src/provider/CmkProvider.js` that returns `Promise.resolve()` (no-op default). Document in JSDoc that subclasses may override to auto-resolve key metadata before `wrap()`.

## 4. Unit Tests

- [x] 4.1 Update `test/unit/provider/AzureKmsProvider.test.js`: add tests for auto-resolve of cmkVersion via getKey(), auto-resolve of publicKeyPem from JWK, single API call for both values, caching (getKey called once across multiple wraps), explicit config precedence.
- [x] 4.2 Update `test/unit/provider/AlibabaKmsProvider.test.js`: add tests for auto-resolve of keyVersionId via ListKeyVersions, auto-resolve of publicKeyPem via GetPublicKey, caching (APIs called once), explicit config precedence, no public key resolution for symmetric keys.
- [x] 4.3 Run full test suite and verify all tests pass.

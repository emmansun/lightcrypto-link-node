## Why

Both AKV and Alibaba KMS providers currently require `cmkVersion` (key version) and `publicKeyPem` to be explicitly provided in configuration. In production, CMK key versions change with every rotation. Hardcoding these values means the system silently uses stale keys after rotation, breaking unwrap operations and potentially causing data loss. The providers must auto-resolve this metadata from the KMS after `_ensureClient()` when it is not explicitly configured, matching the Java reference implementations (AKV.js `getLatestKeyVaultKey()`, AliKMS.js `getKEKList()` / `getPublicKey()`).

## What Changes

- **AzureKmsProvider**: After `_ensureKeyClient()`, if `cmkVersion` is not configured, resolve the latest key version via `keyClient.getKey(keyName)`. If `publicKeyPem` is not configured, build it from the JWK material returned by the same `getKey()` call using `AKV.buildPublicKeyPEMFromJWK()` equivalent logic. Cache both values.
- **AlibabaKmsProvider**: After `_ensureClient()`, if `cmkVersion` is not configured (asymmetric key type), resolve the latest `keyVersionId` via `ListKeyVersions` API. If `publicKeyPem` is not configured, fetch it via `GetPublicKey(keyId, keyVersionId)` API. Cache both values.
- **CmkProvider base class**: Add `_ensureResolved()` lifecycle contract (optional, providers opt-in) that is called before `wrap()` to guarantee metadata is available.
- **Unit tests**: Add tests verifying auto-resolution behavior, caching, and fallback to explicit config.

## Capabilities

### New Capabilities

_None_

### Modified Capabilities

- `cmk-providers`: Providers must auto-resolve key version and public key PEM from KMS APIs when not explicitly configured, ensuring wrap/unwrap work correctly after CMK rotation without manual config updates.

## Impact

- **Code**: `src/provider/AzureKmsProvider.js`, `src/provider/AlibabaKmsProvider.js`, `src/provider/CmkProvider.js`
- **Tests**: `test/unit/provider/AzureKmsProvider.test.js`, `test/unit/provider/AlibabaKmsProvider.test.js`
- **API**: No breaking changes. Explicit `cmkVersion` / `publicKeyPem` config still takes precedence; auto-resolution is a fallback.
- **Dependencies**: No new dependencies. Uses already-required `@azure/keyvault-keys` and `@alicloud/kms20160120` SDKs.

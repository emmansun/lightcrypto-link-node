# CMK Provider

lightcrypto-link-node provides a CMK provider interface so you can integrate custom key-management systems.

## Base Class

```javascript
const { CmkProvider } = require('lightcrypto-link-node');

class MyCustomProvider extends CmkProvider {
  getProviderId() {
    // Stable provider identifier persisted in vault metadata
    return 'my-custom-kms';
  }

  getPublicReference() {
    // Non-secret key reference (e.g., key ARN, version id)
    return 'my-custom-kms:key-12345';
  }

  supportsAlgorithm(lclAlgorithm) {
    // Return true for algorithms this provider can handle
    return lclAlgorithm === 'RSA-OAEP-256';
  }

  async wrap(plaintextKey) {
    // Wrap raw DEK/HMAC bytes with your CMK
    // Returns: { ciphertext: Buffer, algorithm: string, metadata: Object }
    const ciphertext = await myKmsEncrypt(plaintextKey);
    return {
      ciphertext,
      algorithm: 'RSA-OAEP-256',
      metadata: { cmkVersion: 'v1' }
    };
  }

  async unwrap(wrappedKey) {
    // Reverse wrapping and return raw key bytes
    // wrappedKey: { ciphertext: Buffer, algorithm: string, metadata: Object }
    return await myKmsDecrypt(wrappedKey.ciphertext, wrappedKey.metadata);
  }
}
```

## Interface Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getProviderId()` | `string` | Stable provider identifier persisted in vault metadata |
| `getPublicReference()` | `string` | Non-secret key reference (e.g., key ARN/version id) |
| `supportsAlgorithm(alg)` | `boolean` | Whether the provider supports the given LCL algorithm |
| `mapAlgorithm(alg)` | `string` | Maps LCL algorithm to provider-specific algorithm identifier |
| `getCmkVersion()` | `string\|null` | CMK version identifier; `null` for unversioned providers |
| `_ensureResolved()` | `Promise<void>` | Hook for lazy metadata resolution (e.g., auto-resolve from KMS API) |
| `wrap(plaintextKey)` | `Promise<WrappedKey>` | Wraps raw DEK/HMAC bytes with your CMK |
| `unwrap(wrappedKey)` | `Promise<Buffer>` | Reverses wrapping and returns raw key bytes |

## LCL Algorithm Constants

```javascript
const { LclAlgorithms } = require('lightcrypto-link-node');
// { AES_256_GCM: 'AES-256-GCM', SM4_GCM: 'SM4-GCM', SM4_CBC: 'SM4-CBC',
//   RSA_OAEP_256: 'RSA-OAEP-256', KMS_DATA_KEY: 'KMS-DATA-KEY' }
```

## Built-in Providers

### LocalCmkProvider

Local symmetric CMK using **AES-256-GCM** for key wrapping.

| Property | Value |
|----------|-------|
| Provider ID | `local-symmetric` |
| Algorithm | `AES-256-GCM` |
| Public reference | `local-cmk-sha256:{8 hex chars}` |
| CMK version | `null` (unversioned) |

```javascript
const { LocalCmkProvider } = require('lightcrypto-link-node');
const provider = new LocalCmkProvider('a'.repeat(64)); // 64-char hex string (32 bytes)
```

- Accepts 64-char hex string or 32-byte `Buffer`
- Wrap output format: `IV (12B) || ciphertext || auth tag (16B)`
- No KMS calls — all operations are local

### AzureKmsProvider

Azure Key Vault CMK provider using **RSA-OAEP-256** (SHA-256) for asymmetric key wrapping.

| Property | Value |
|----------|-------|
| Provider ID | `azure-keyvault` |
| Algorithm | `RSA-OAEP-256` |
| Public reference | `keyName` |
| Dependencies | `@azure/keyvault-keys`, `@azure/identity` (lazy-loaded) |

```javascript
const { AzureKmsProvider } = require('lightcrypto-link-node');
const provider = new AzureKmsProvider({
  keyName: 'my-key',
  vaultUrl: 'https://myvault.vault.azure.net',
  cmkVersion: 'v1',           // optional, auto-resolved if omitted
  publicKeyPem: '-----BEGIN...', // optional, auto-resolved if omitted
  credential: new DefaultAzureCredential() // optional
});

// Or inject a pre-configured KeyClient (vaultUrl/credential are ignored)
const { KeyClient } = require('@azure/keyvault-keys');
const customKeyClient = new KeyClient(vaultUrl, credential, {
  retryOptions: { maxRetries: 5 },
  // proxySettings, ...
});
const provider2 = new AzureKmsProvider({
  keyName: 'my-key',
  keyClient: customKeyClient
});
```

**Local wrap mode** (recommended):
- `wrap()` encrypts locally using `publicKeyPem` (no KMS call, faster, cheaper)
- `unwrap()` always calls Azure KMS (private key never leaves Key Vault)

**Auto-resolution** (`_ensureResolved()`):
- If `cmkVersion` or `publicKeyPem` is not configured, fetches both from a single `getKey()` call
- `cmkVersion`: from `key.properties.version`
- `publicKeyPem`: built from JWK material (`kty`, `n`, `e`) via `crypto.createPublicKey()`
- Results are cached for the provider lifetime
- Throws if `publicKeyPem` cannot be resolved (remote wrap mode not implemented)

### AlibabaKmsProvider

Alibaba Cloud KMS provider for China compliance. Supports symmetric and asymmetric CMKs.

| Property | Value |
|----------|-------|
| Provider ID | `alibaba-kms` |
| Algorithms | `RSA-OAEP-256` (asymmetric), `KMS-DATA-KEY` (symmetric) |
| Public reference | `keyId` |
| Dependencies | `@alicloud/kms20160120`, `@alicloud/openapi-client` (lazy-loaded) |

```javascript
const { AlibabaKmsProvider } = require('lightcrypto-link-node');

// Symmetric CMK
const symProvider = new AlibabaKmsProvider({
  keyId: 'key-abc123',
  keyType: 'symmetric',    // default
  region: 'cn-hangzhou',
  accessKeyId: '...',
  accessKeySecret: '...'
});

// Asymmetric CMK (RSA)
const asymProvider = new AlibabaKmsProvider({
  keyId: 'key-xyz789',
  keyType: 'asymmetric',
  cmkVersion: 'v1',         // optional, auto-resolved via ListKeyVersions
  publicKeyPem: '-----BEGIN...', // optional, auto-resolved via GetPublicKey
  region: 'cn-hangzhou',
  accessKeyId: '...',
  accessKeySecret: '...'
});

// Or inject a pre-configured client (region/endpoint/accessKeyId/accessKeySecret are ignored)
const Kms20160120 = require('@alicloud/kms20160120');
const OpenApi = require('@alicloud/openapi-client');
const customClient = new Kms20160120.default(new OpenApi.Config({
  accessKeyId: '...',
  accessKeySecret: '...',
  endpoint: 'kms.cn-hangzhou.aliyuncs.com',
  // custom proxy, timeout, etc.
}));
const provider = new AlibabaKmsProvider({
  keyId: 'key-abc123',
  keyType: 'asymmetric',
  client: customClient
});
```

**Symmetric key**:
- `wrap()` calls Alibaba KMS Encrypt API; captures `keyVersionId` from response
- `unwrap()` calls Decrypt API (keyVersionId not needed per API design)
- Algorithm: `KMS-DATA-KEY`

**Asymmetric key**:
- `wrap()` encrypts **locally** using `publicKeyPem` (RSA-OAEP SHA-256, no KMS call)
- `unwrap()` calls AsymmetricDecrypt API with `keyVersionId`
- Algorithm: `RSA-OAEP-256` → mapped to `RSAES_OAEP_SHA_256`

**Auto-resolution** (`_ensureResolved()`):
- Symmetric keys: resolution is skipped
- Asymmetric keys: resolves `cmkVersion` via `ListKeyVersions(pageSize=1)` and `publicKeyPem` via `GetPublicKey()`
- Gracefully skipped if KMS is not accessible (allows explicit config fallback)

## Implementation Tips

- Use `LclAlgorithms` constants for algorithm identifiers to ensure consistency.
- Return actionable exceptions for unavailable KMS or invalid ciphertext.
- Never log plaintext DEK/HMAC bytes.
- Use `_ensureResolved()` for lazy initialization (e.g., fetching key metadata from KMS).
- Store version info in `wrappedKey.metadata.cmkVersion` for cloud KMS providers to enable CMK rotation.
- For asymmetric keys, prefer local wrap mode (encrypt with public key locally) to avoid KMS API costs.

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
| `getCmkVersion()` | `string\|null` | CMK version identifier; `null` for unversioned providers |
| `_ensureResolved()` | `Promise<void>` | Hook for lazy metadata resolution (e.g., auto-resolve from KMS API) |
| `wrap(plaintextKey)` | `Promise<WrappedKey>` | Wraps raw DEK/HMAC bytes with your CMK |
| `unwrap(wrappedKey)` | `Promise<Buffer>` | Reverses wrapping and returns raw key bytes |

## Built-in Providers

- `LocalCmkProvider` — local symmetric CMK (64-char hex key)
- `AzureKmsProvider` — Azure Key Vault (RSA-OAEP wrapping)
- `AlibabaKmsProvider` — Alibaba Cloud KMS (symmetric or asymmetric)

## Implementation Tips

- Keep `wrap`/`unwrap` compatible with algorithm metadata in `wrappedKey.algorithm`.
- Return actionable exceptions for unavailable KMS or invalid ciphertext.
- Never log plaintext DEK/HMAC bytes.
- Use `_ensureResolved()` for lazy initialization (e.g., fetching key metadata from KMS).
- Store version info in `wrappedKey.metadata.cmkVersion` for cloud KMS providers.

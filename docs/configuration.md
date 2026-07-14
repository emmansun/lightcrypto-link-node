# Configuration

lightcrypto-link-node supports multi-source configuration with a strict precedence hierarchy.

## Precedence (highest to lowest)

1. Environment variables
2. Secret managers (Kubernetes, AWS, Azure, HashiCorp Vault)
3. Configuration files (`.env`, `config/*.json`)
4. Application defaults

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LCL_CMK_KEY` | 64-char hex CMK key (for local provider) | — |
| `LCL_MONGODB_URI` | MongoDB connection string | — |
| `LCL_ALGORITHM` | Encryption algorithm | `AES_256_GCM` |
| `LCL_CACHE_TTL` | DEK cache TTL (ms) | `3600000` (1 hour) |
| `LCL_CMK_PROVIDER` | CMK provider type | `local-symmetric` |

## Secret Managers

### Kubernetes Secrets

Mount secrets at `/var/run/secrets/lightcrypto-link/` (or set `LCL_K8S_SECRET_DIR`).

### AWS Secrets Manager

Set `LCL_AWS_SECRET_ID` to your secret ID. The SDK (`@aws-sdk/client-secrets-manager`) is lazy-loaded.

### Azure Key Vault Secrets

Set `LCL_AZURE_SECRET_URL` to your Key Vault URL. The SDK (`@azure/keyvault-secrets`) is lazy-loaded.

### HashiCorp Vault

Set `LCL_VAULT_ADDR` + `LCL_VAULT_TOKEN`. Optionally set `LCL_VAULT_PATH` (default: `secret/data/lightcrypto-link`).

## Configuration Files

- `config/lcl.json` — JSON configuration file
- `.env.local` — development environment
- `.env.production` — production environment
- `.env.test` — test environment

### JSON Format

```json
{
  "lcl": {
    "crypto": { "cmk": "64 hex chars", "algorithm": "AES_256_GCM" },
    "mongodb": { "uri": "mongodb://localhost:27017/mydb" },
    "cmk": { "provider": "local-symmetric" }
  }
}
```

## Runtime Reload

```javascript
const result = await config.reload();
if (result.cmkChanged) {
  keyVaultService.flushCache();
}
```

## CMK Provider Configuration

### Local (recommended for most use cases)

```javascript
const { LocalCmkProvider } = require('lightcrypto-link-node');
const provider = new LocalCmkProvider('64-char-hex-key');
```

### Azure Key Vault

Authentication uses `DefaultAzureCredential` from `@azure/identity` by default. Set these environment variables:

```
AZURE_TENANT_ID=<your-tenant-id>
AZURE_CLIENT_ID=<your-client-id>
AZURE_CLIENT_SECRET=<your-client-secret>
```

```javascript
const { AzureKmsProvider } = require('lightcrypto-link-node');
const provider = new AzureKmsProvider({
  keyName: 'my-key',                              // Key name in Azure Key Vault
  vaultUrl: 'https://vault.vault.azure.net',      // Vault URL
  cmkVersion: 'key-version-id',                   // Optional: auto-resolved if omitted
  publicKeyPem: '-----BEGIN PUBLIC KEY-----...',   // Optional: auto-resolved for local wrap
  algorithm: 'RSA-OAEP-256',                      // Optional: RSA-OAEP-256 (default) or RSA-OAEP
  // credential: customCredential                  // Optional: custom Azure credential
});
```

Install Azure SDK:

```bash
npm install @azure/keyvault-keys @azure/identity
```

### Alibaba Cloud KMS

Set these environment variables for authentication:

```
ALIBABA_CLOUD_ACCESS_KEY_ID=<your-access-key-id>
ALIBABA_CLOUD_ACCESS_KEY_SECRET=<your-access-key-secret>
```

```javascript
const { AlibabaKmsProvider } = require('lightcrypto-link-node');
const provider = new AlibabaKmsProvider({
  keyId: 'key-xxxxx',                             // KMS key ID
  keyType: 'symmetric',                           // 'symmetric' or 'asymmetric'
  region: 'cn-hangzhou',                          // Region ID
  endpoint: 'kms.cn-hangzhou.aliyuncs.com',       // KMS endpoint
  accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
  cmkVersion: 'key-version-id',                   // Optional: auto-resolved for asymmetric
  publicKeyPem: '...',                            // Optional: auto-resolved for local asymmetric wrap
  asymmetricAlgorithm: 'RSAES_OAEP_SHA_256'       // Optional: default RSAES_OAEP_SHA_256
});
```

Install Alibaba SDK:

```bash
npm install @alicloud/kms20160120 @alicloud/openapi-client
```

> **Note:** Both cloud providers auto-resolve `cmkVersion` and `publicKeyPem` from the KMS API when not explicitly configured. Explicit configuration always takes precedence.

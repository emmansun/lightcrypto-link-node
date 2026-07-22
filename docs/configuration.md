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
| `LCL_TENANT` | Tenant identifier for namespace construction | `default` |
| `LCL_REALM` | Realm identifier for namespace construction | `default` |

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
    "cmk": { "provider": "local-symmetric" },
    "tenant": "my-tenant",
    "realm": "my-realm"
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
  publicKeyPem: '...'                             // Optional: auto-resolved for local asymmetric wrap
});
```

Install Alibaba SDK:

```bash
npm install @alicloud/kms20160120 @alicloud/openapi-client
```

> **Note:** Both cloud providers auto-resolve `cmkVersion` and `publicKeyPem` from the KMS API when not explicitly configured. Explicit configuration always takes precedence.

## Encryption Mode

The `mode` option controls how structured fields (sub-documents and arrays) are encrypted.

| Mode | Sub-document (DOC) | Scalar Array `[String]` | Sub-doc Array `[Schema]` |
|------|-------------------|------------------------|---------------------------|
| `AUTO` (default) | Whole-object | Element-level | Whole-array (COL) |
| `ELEMENT` | Error | Element-level | Error |
| `WHOLE` | Whole-object | Whole-array (COL) | Whole-array (COL) |

## Namespace Construction

Each encrypted field gets a unique namespace in the format `<tenant>.<realm>.<entity>#<field>`. The `tenant` and `realm` segments can be configured globally or per-plugin:

### Global Configuration (LclConfig)

```javascript
// Environment variables
LCL_TENANT=my-tenant
LCL_REALM=my-realm

// Or in config/lcl.json
{ "lcl": { "tenant": "my-tenant", "realm": "my-realm" } }
```

### Per-Plugin Configuration

```javascript
schema.plugin(lclCryptoPlugin, {
  keyVaultService,
  entityName: 'User',
  tenant: 'acme-corp',    // Override global tenant
  realm: 'production'     // Override global realm
});
```

### Namespace Resolution

| Input | Resolved Namespace |
|-------|-------------------|
| `User#phone` (shorthand) | `{tenant}.{realm}.User#phone` |
| `acme.prod.User#phone` (full) | `acme.prod.User#phone` (explicit wins) |

> **Note:** Explicit full-form namespaces always take precedence over configured defaults. This allows multi-tenant applications to use different namespaces per request.

## SPI Adapter Options

The plugin accepts SPI override options for customizing data storage behavior:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `storageAdapter` | `StorageAdapter` | `MongooseStorageAdapter` | Encrypted payload format (build/extract) |
| `structuredValueCodec` | `StructuredValueCodec` | `BsonStructuredValueCodec` | Structured value serialization (DOC/COL/MAP) |

```javascript
// Use custom SPI implementations
schema.plugin(lclCryptoPlugin, {
  keyVaultService,
  cmkProvider,
  storageAdapter: new MyCustomStorageAdapter(),
  structuredValueCodec: new MyCustomCodec()
});
```

The default `MongooseStorageAdapter` produces `{ c, _e: 1, _t, b? }` sub-documents compatible with Java LightCrypto-Link. Override only when you need a different payload format or non-Mongoose storage backend.

### Usage

```javascript
// Whole-array encryption (all elements as one ciphertext)
{ type: [String], encrypt: true, mode: 'WHOLE' }

// Element-level encryption (each element encrypted independently)
{ type: [String], encrypt: true, mode: 'ELEMENT' }

// Whole-object sub-document encryption
{ type: addressSchema, encrypt: true }  // AUTO = whole-object for sub-docs

// Nested path encryption (encrypt specific fields within sub-documents)
{
  address: {
    street: { type: String, encrypt: true },  // only street encrypted
    city: String
  }
}
```

### Key Points

- **Element-level**: Each array element is encrypted/decrypted independently. Supports querying individual elements but increases storage overhead.
- **Whole-array (COL)**: The entire array is serialized as BSON and encrypted as one ciphertext. More compact but individual elements cannot be queried.
- **Whole-object (DOC)**: The entire sub-document is serialized as BSON and encrypted. Internal fields cannot be queried individually.
- **Nested path**: Only specific fields within a sub-document or array element are encrypted, leaving other fields visible for querying.

## Bootstrap Self-Check

The plugin supports an optional bootstrap self-check that runs at startup to verify encryption primitives, KMS connectivity, and Vault accessibility before processing any data.

### Enabling Bootstrap

```javascript
// Enable with default phases (recommended for production)
schema.plugin(lclCryptoPlugin, {
  cmkProvider,
  vaultStore,
  bootstrap: true
});

// Custom configuration
schema.plugin(lclCryptoPlugin, {
  cmkProvider,
  vaultStore,
  bootstrap: {
    strictMode: false,      // tolerant mode: RECOVERABLE failures → DEGRADED instead of FAILED
    timeoutMs: 10000,       // total bootstrap timeout (default: 15000ms)
    phases: customPhases,   // override default phases
    onEvent: (name, detail) => console.log(name, detail),  // @deprecated event callback
    eventBus: myEventBus    // structured EventBus instance (preferred over onEvent)
  }
});
```

### Default Phases

| Phase | Name | Failure Class | Description |
|-------|------|---------------|-------------|
| BOOT-1 | Config Validation | FATAL | Validates cmkProvider is present and getProviderId() works |
| BOOT-2 | KMS Reachability | RECOVERABLE | Probes KMS via getPublicReference() |
| BOOT-3 | Vault Reachability | RECOVERABLE | Probes VaultStore via exists() |
| BOOT-4 | KAT | FATAL | Verifies encryption, blind index, and KCV using golden vectors |

### Failure Classes

- **FATAL** — Immediately aborts bootstrap (e.g., KAT failure = corrupted crypto library)
- **RECOVERABLE** — Retries up to 3 times with exponential backoff (100/200/400ms); escalates to FATAL in strict mode
- **ADVISORY** — Logs warning and continues

### Result Status

- `READY` — All checks passed
- `FAILED` — A FATAL check failed (plugin throws Error, blocking initialization)
- `DEGRADED` — A RECOVERABLE check failed in tolerant mode (functionality may be limited)

> **Note:** Bootstrap is disabled by default (`bootstrap: false`). Enable it in production for fail-fast behavior.

### EventBus Configuration

The `eventBus` option provides structured event notification for bootstrap phases. It takes precedence over the deprecated `onEvent` callback.

```javascript
const { EventBus, CompositeEventBus, EventTier } = require('lightcrypto-link-node');

// Custom EventBus
class AuditEventBus extends EventBus {
  emit(event) {
    if (event.tier === EventTier.L3) {
      auditLog.write(event);
    }
  }
}

schema.plugin(lclCryptoPlugin, {
  cmkProvider,
  vaultStore,
  bootstrap: {
    eventBus: new CompositeEventBus([
      new AuditEventBus(),
      new MetricsEventBus()
    ])
  }
});
```

When neither `eventBus` nor `onEvent` is provided, the system uses `NoOpEventBus` (zero overhead).

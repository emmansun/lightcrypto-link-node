# Cross-CMK Provider Migration Guide

## Architecture: Envelope Encryption Re-Wrap Flow

LightCrypto-Link uses **envelope encryption**: business data is encrypted with a DEK (Data Encryption Key), and the DEK itself is wrapped (encrypted) by a CMK (Customer Master Key) via a `CmkProvider`.

```
┌─────────────────────────────────────────────────────────┐
│                    Business Data                         │
│              (encrypted with DEK — untouched)           │
└────────────────────────────┬────────────────────────────┘
                             │ encrypt/decrypt
                             ▼
┌─────────────────────────────────────────────────────────┐
│              VaultDocument (per namespace)               │
│  ┌───────────────────────────────────────────────────┐  │
│  │  KeyEntry                                         │  │
│  │    dek.wrapped  ◄── wrap(DEK) by CMK Provider    │  │
│  │    hmk.wrapped  ◄── wrap(HMAC) by CMK Provider   │  │
│  │    dek.kcv / hmk.kcv / binding (integrity)       │  │
│  └───────────────────────────────────────────────────┘  │
│  cmk.provider = "local-symmetric"                       │
│  cmk.id = "local-cmk-sha256:abcd1234"                  │
└────────────────────────────┬────────────────────────────┘
                             │ wrap / unwrap
                             ▼
┌─────────────────────────────────────────────────────────┐
│              CmkProvider (CMK — wrapping layer)         │
│   local-symmetric │ azure-kv │ alibaba-kms              │
└─────────────────────────────────────────────────────────┘
```

**Re-wrap** changes ONLY the wrapping layer (CMK provider) without touching business data or DEK material:

1. Unwrap DEK/HMAC keys with the **current** provider
2. Verify KCV and binding integrity
3. Re-wrap with the **target** provider
4. Post-rewrap roundtrip verification
5. Persist atomically via `VaultStore.rotate()` (optimistic locking)

## Prerequisites Checklist

- [ ] Current CMK provider is configured, reachable, and can unwrap existing vault keys
- [ ] Target CMK provider is configured, reachable, and supports wrap + unwrap
- [ ] Target provider's key material is correctly provisioned (correct key ID, permissions)
- [ ] Application write-pause is acceptable (re-wrap is fast but briefly blocks writes per namespace)
- [ ] Backup of vault collection taken (MongoDB: `mongodump` the vault collection)
- [ ] `lightcrypto-link-node` SDK version ≥ 1.2.0

## Provider ID Reference Table

| Provider | `getProviderId()` | `getPublicReference()` example |
|----------|-------------------|-------------------------------|
| Local Symmetric | `local-symmetric` | `local-cmk-sha256:abcd1234` |
| Azure Key Vault | `azure-keyvault` | `https://myvault.vault.azure.net/keys/my-key-name` |
| Alibaba Cloud KMS | `alibaba-kms` | `key-shanghai-xxxx` |

## Migration Scenarios

### Scenario 1: LOCAL → Alibaba Cloud KMS

```javascript
const { KeyVaultService, LocalCmkProvider, AlibabaKmsProvider, MongoVaultStore } = require('lightcrypto-link-node');

const currentProvider = new LocalCmkProvider(process.env.LCL_CMK_KEY);
const targetProvider = new AlibabaKmsProvider({
  accessKeyId: process.env.ALIBABA_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIBABA_ACCESS_KEY_SECRET,
  regionId: process.env.ALIBABA_KMS_REGION,
  keyId: process.env.ALIBABA_KMS_KEY_ID
});

const keyVaultService = new KeyVaultService({ vaultStore, cmkProvider: currentProvider });
const results = await keyVaultService.rewrapAllVaults(targetProvider);
```

### Scenario 2: LOCAL → Azure Key Vault

```javascript
const { AzureKmsProvider } = require('lightcrypto-link-node');

const targetProvider = new AzureKmsProvider({
  vaultUrl: process.env.AZURE_KV_URL,
  keyName: process.env.AZURE_KV_KEY_NAME,
  credential: new DefaultAzureCredential()
});

const results = await keyVaultService.rewrapAllVaults(targetProvider);
```

### Scenario 3: LOCAL → LOCAL (key change)

Same provider type but different key material (e.g., compromised key replacement):

```javascript
const newLocalProvider = new LocalCmkProvider(process.env.NEW_CMK_KEY);
// publicReference differs → re-wrap proceeds
const results = await keyVaultService.rewrapAllVaults(newLocalProvider);
```

### Scenario 4: Cloud same-provider key change

Azure Key Vault key rotation (same provider, different key version/URI):

```javascript
const newAzureProvider = new AzureKmsProvider({
  vaultUrl: process.env.AZURE_KV_URL,
  keyName: 'new-key-name',  // different key → different publicReference
  credential: new DefaultAzureCredential()
});

const results = await keyVaultService.rewrapAllVaults(newAzureProvider);
```

## Step-by-Step Procedure

### Step 1: Dry-Run Validation

Always start with a dry-run to validate connectivity and configuration without mutation:

```javascript
const results = await keyVaultService.rewrapAllVaults(targetProvider, { dryRun: true });

for (const r of results) {
  if (!r.success) {
    console.error(`FAILED: ${r.namespace} — ${r.error}`);
    process.exit(1);
  }
  console.log(`OK: ${r.namespace} (${r.keyCount} keys validated)`);
}
console.log('Dry-run passed. Safe to proceed with live migration.');
```

### Step 2: Live Migration

```javascript
const results = await keyVaultService.rewrapAllVaults(targetProvider);

const failed = results.filter(r => !r.success);
if (failed.length > 0) {
  console.error(`${failed.length} namespace(s) failed:`);
  failed.forEach(r => console.error(`  ${r.namespace}: ${r.error}`));
} else {
  console.log(`All ${results.length} namespace(s) migrated successfully.`);
}
```

### Step 3: Configuration Switch

After successful migration, update the application configuration to use the target provider as the current provider:

```diff
- cmkProvider: new LocalCmkProvider(process.env.LCL_CMK_KEY)
+ cmkProvider: new AlibabaKmsProvider({ ... })
```

Restart the application with the new configuration.

## Transition Window Guidance

- **During migration**: The application's `cmkProvider` must still be the **old** provider (used for unwrap during re-wrap).
- **After migration**: Switch configuration to the **new** provider.
- **Write-pause**: Each namespace re-wrap takes milliseconds (local crypto + one DB write). For large namespace counts, consider batching during low-traffic windows.
- **Read availability**: Unaffected — cached DEKs remain valid until cache eviction. After config switch, new reads use the target provider.

## Rollback Strategy

1. **Before config switch**: Simply revert to old provider configuration. Already-migrated vaults need reverse re-wrap:
   ```javascript
   // Reverse: target → original
   const results = await keyVaultService.rewrapAllVaults(originalProvider);
   ```
2. **After config switch**: The old provider is no longer configured. To rollback:
   - Re-configure the old provider temporarily
   - Run reverse re-wrap
   - Revert application configuration
3. **Partial migration**: Vaults are independent. Un-migrated namespaces still use the old provider. No global lock.

## Programmatic API Reference

### `rewrapVault(namespace, targetProvider, [options])`

Re-wraps all key entries in a single namespace's vault.

| Parameter | Type | Description |
|-----------|------|-------------|
| `namespace` | `string` | Canonical namespace (e.g., `"default.default.User#phone"`) |
| `targetProvider` | `CmkProvider` | Target CMK provider instance |
| `options.dryRun` | `boolean` | Validate only, no mutation (default: `false`) |

**Returns**: `RewrapResult`

### `rewrapAllVaults(targetProvider, [options])`

Iterates all namespaces via `VaultStore.loadAll()` with per-namespace error isolation.

**Returns**: `RewrapResult[]`

### RewrapResult Structure

| Field | Type | Description |
|-------|------|-------------|
| `namespace` | `string` | Namespace identifier |
| `success` | `boolean` | Whether the operation succeeded |
| `skipped` | `boolean` | True if same provider (no-op) |
| `dryRun` | `boolean` | True if dry-run mode |
| `keyCount` | `number` | Number of key entries processed |
| `error` | `string\|null` | Error message on failure |
| `durationMicros` | `number` | Operation duration in microseconds |

## Observability Events

| Event Name | Tier | Emitted When | Key Attributes |
|------------|------|--------------|----------------|
| `lcl.rewrap.namespace.completed` | L2 | Single namespace re-wrap succeeds | `namespace`, `durationMicros` |
| `lcl.rewrap.namespace.failed` | L2 | Single namespace re-wrap fails | `namespace`, `errorType`, `durationMicros` |
| `lcl.rewrap.batch.completed` | L2 | `rewrapAllVaults` finishes | `totalCount`, `successCount`, `failedCount`, `totalDurationMicros` |

Inject an `EventBus` via the `KeyVaultService` constructor to receive events:

```javascript
const keyVaultService = new KeyVaultService({
  vaultStore,
  cmkProvider,
  eventBus: myEventBus  // implements emit(LclEvent)
});
```

## Post-Migration Checklist

- [ ] All namespaces report `success: true` (no failures)
- [ ] Vault documents show target `cmk.provider` and `cmk.id`
- [ ] Application configuration switched to target provider
- [ ] Application restarted with new provider
- [ ] Encrypt/decrypt smoke test passes on each critical namespace
- [ ] Blind index queries return expected results (HMAC key unchanged)
- [ ] Monitoring dashboards show `lcl.rewrap.batch.completed` event
- [ ] Old provider credentials archived/secured (not deleted until rollback window closes)
- [ ] Vault collection backup retained for rollback window (recommended: 7 days)

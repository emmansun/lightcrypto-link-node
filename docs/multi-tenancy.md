# Multi-Tenancy Guide

LightCrypto-Link uses a **four-part namespace model** (`tenant.realm.entity#field`) to provide cryptographic isolation across organizational and environmental boundaries. This guide explains the design intent and recommended patterns for each multi-tenancy scenario.

## Namespace Model

Every encrypted field is bound to a unique namespace that determines which DEK/HMAC key pair encrypts it:

```
<tenant>.<realm>.<entity>#<field>
```

| Segment | Purpose | Granularity | Examples |
|---------|---------|-------------|----------|
| `tenant` | Organization/customer isolation boundary | Deployment-level | `acme-corp`, `default` |
| `realm` | Environment/domain isolation | Deployment-level | `production`, `staging` |
| `entity` | Data entity (collection) | Schema-level | `User`, `Order` |
| `field` | Encrypted field | Field-level | `phone`, `ssn` |

### Key Properties

- **Cryptographic isolation**: Different namespaces → different DEKs → complete isolation (including blind index non-correlation)
- **Self-describing ciphertext**: Wire Format V1 embeds the full namespace in every encrypted blob, so **decryption never requires external tenant context**
- **Blind index isolation**: HKDF-SHA256 derives a namespace-scoped HMAC key, preventing cross-tenant or cross-entity blind index correlation

## Configuration

### Global Configuration (LclConfig)

```javascript
// Environment variables
LCL_TENANT=acme-corp
LCL_REALM=production

// Or in config/lcl.json
{ "lcl": { "tenant": "acme-corp", "realm": "production" } }
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

| Input Form | Example | Resolved Namespace |
|------------|---------|-------------------|
| Shorthand | `User#phone` | `{tenant}.{realm}.User#phone` |
| Full form | `acme.prod.User#phone` | `acme.prod.User#phone` (explicit wins) |

> **Note:** Explicit full-form namespaces always take precedence over configured defaults. This allows multi-tenant applications to use different namespaces per request.

## Multi-Tenancy Patterns

### Pattern 1: Database-per-Tenant (Recommended)

Each tenant has an isolated MongoDB database. The `tenant`/`realm` is deployment-level configuration.

```javascript
// Per-tenant service instance
const db = client.db(`tenant-${tenantId}`);
const vaultStore = new MongoVaultStore(db);
const keyVaultService = new KeyVaultService({ vaultStore, cmkProvider });

schema.plugin(lclCryptoPlugin, {
  keyVaultService,
  entityName: 'User',
  tenant: tenantId,
  realm: 'production'
});
```

**Isolation level**: Complete (separate databases, separate DEK vaults, separate namespaces).

### Pattern 2: Collection-per-Tenant

Same database, separate Mongoose models per tenant with different `tenant` plugin options.

```javascript
function createTenantUserModel(tenantId) {
  const schema = new mongoose.Schema(prepareEncryptedSchema({
    name: String,
    phone: { type: String, encrypt: true, blindIndex: true }
  }));

  schema.plugin(lclCryptoPlugin, {
    keyVaultService,  // Shared KeyVaultService (namespace isolates DEKs)
    entityName: 'User',
    tenant: tenantId,
    realm: 'production'
  });

  return mongoose.model(`User_${tenantId}`, schema);
}

const AcmeUser = createTenantUserModel('acme-corp');
const BetaUser = createTenantUserModel('beta-inc');

// Each model uses a different namespace → different DEK → full isolation
await AcmeUser.create({ name: 'Alice', phone: '13800138000' });
// → namespace: acme-corp.production.User#phone

await BetaUser.create({ name: 'Bob', phone: '13800138000' });
// → namespace: beta-inc.production.User#phone
```

**Isolation level**: Complete (same collection, but different DEKs per namespace).

### Pattern 3: Row-Level Tenant (Field Value)

When the tenant identifier is stored as a document field (e.g., `doc.tenantId = "acme"`), the Mongoose plugin cannot dynamically resolve namespaces per-record. Use `ProgrammaticCryptoService` instead:

```javascript
const { ProgrammaticCryptoService, KeyVaultService, MongoVaultStore,
        MongooseStorageAdapter, BsonStructuredValueCodec } = require('lightcrypto-link-node');

const programmatic = new ProgrammaticCryptoService({
  keyVaultService,
  storageAdapter: new MongooseStorageAdapter(),
  structuredValueCodec: new BsonStructuredValueCodec()
});

// ─── Write: encrypt with tenant-specific namespace ───
async function saveDocument(doc) {
  const tenant = doc.tenantId;  // Read tenant from document field
  const namespace = `${tenant}.production.User#phone`;

  doc.phone = await programmatic.encryptValue(doc.phone, namespace);
  // → { _e: 1, _t: 'STR', c: '<wire format blob with embedded namespace>' }

  await db.collection('users').insertOne(doc);
}

// ─── Read: decrypt (no external tenant needed) ───
async function readDocument(rawDoc) {
  rawDoc.phone = await programmatic.decryptValue(rawDoc.phone);
  // Wire Format V1 blob embeds the full namespace — decryption is self-describing
  return rawDoc;
}
```

**Isolation level**: Complete (different DEKs per tenant namespace).

**Limitation**: ProgrammaticCryptoService currently does not generate blind indexes (`b` field) during encryption, so blind-index exact-match queries are not available in this pattern. If blind index support is required for row-level multi-tenancy, consider using Pattern 2 (Collection-per-Tenant) where the Mongoose plugin handles blind index generation automatically.

## Cross-Language Compatibility

The namespace is embedded in Wire Format V1 blobs, ensuring that Node.js and Java can decrypt each other's ciphertext regardless of which SDK encrypted it:

```
[0x01][algId][nsLen][namespace UTF-8 bytes][dekVersion][ivLen][IV][ciphertext]
```

A document encrypted by Node.js with namespace `acme.prod.User#phone` is decryptable by Java's LightCrypto-Link using the same vault and CMK — no SDK-specific metadata is required.

## Best Practices

1. **Use deployment-level tenant/realm** when possible — simpler configuration, automatic Mongoose plugin support
2. **Use full-form namespaces** (`tenant.realm.Entity#field`) in ProgrammaticCryptoService for row-level isolation
3. **Never store tenant in the namespace as plaintext metadata** — the namespace IS the key routing identity; it determines which DEK encrypts the data
4. **Match tenant/realm between Node.js and Java** — both SDKs must resolve to the same canonical namespace for the same data to be interoperable
5. **Test blind index isolation** — verify that the same plaintext value produces different blind indexes for different tenant namespaces

## Migration

When introducing `tenant`/`realm` to an existing deployment that used `default.default.*`:

1. Existing data encrypted with `default.default.Entity#field` remains decryptable (Wire Format blob embeds the original namespace)
2. New writes will use the configured tenant/realm
3. To re-encrypt existing data under a new tenant namespace, use the backfill runner:
   ```bash
   node examples/plaintext-backfill.js --batch-size=500
   ```
   This re-saves documents, which triggers re-encryption with the new namespace's DEK.

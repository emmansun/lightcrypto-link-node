'use strict';

/**
 * DEK Re-Encryption Example
 *
 * Demonstrates the full key lifecycle:
 *   1. Initialize vault with v1 DEK
 *   2. Encrypt documents with v1
 *   3. Rotate DEK (v1 → ROTATED, v2 → ACTIVE)
 *   4. Re-encrypt all documents from v1 → v2
 *   5. Prune retired keys
 *
 * Uses InMemoryVaultStore (no external dependencies).
 *
 * Run: node examples/dek-re-encryption.js
 */

const crypto = require('crypto');
const {
  KeyVaultService,
  DekReEncryptionService,
  InMemoryVaultStore,
  MongooseStorageAdapter,
  CryptoCodec,
  Namespace,
  DocumentRewriteStore
} = require('../src/index');

// ===== Mock CMK Provider (local AES-256-GCM wrapping) =====
const cmkKey = crypto.randomBytes(32);
const localCmkProvider = {
  getProviderId: () => 'local-symmetric',
  getPublicReference: () => 'local-cmk-sha256:example',
  wrap: async (plaintextKey) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', cmkKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintextKey), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { ciphertext: Buffer.concat([iv, encrypted, tag]), algorithm: 'AES-256-GCM', metadata: {} };
  },
  unwrap: async (wrappedKey) => {
    const data = wrappedKey.ciphertext;
    const iv = data.subarray(0, 12);
    const tag = data.subarray(data.length - 16);
    const ct = data.subarray(12, data.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', cmkKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }
};

// ===== In-Memory DocumentRewriteStore for demo =====
class InMemoryDocumentRewriteStore extends DocumentRewriteStore {
  constructor() {
    super();
    this._docs = new Map();
    this._checkpoints = new Map();
  }

  seed(id, fields) {
    this._docs.set(id, { _id: id, ...fields });
  }

  async *scan(scanOptions) {
    const sorted = [...this._docs.values()].sort((a, b) => String(a._id).localeCompare(String(b._id)));
    for (const doc of sorted) {
      if (scanOptions.resumeAfter && String(doc._id) <= String(scanOptions.resumeAfter)) continue;
      const fields = {};
      const casConditions = {};
      for (const [key, value] of Object.entries(doc)) {
        if (key === '_id') continue;
        if (value && typeof value === 'object' && value._e === 1) {
          fields[key] = value;
          if (value._k) casConditions[key] = value._k;
        }
      }
      yield { id: doc._id, fields, casConditions };
    }
  }

  async replace(rawDocument) {
    const doc = this._docs.get(rawDocument.id);
    if (!doc) return false;
    for (const [path, oldKid] of Object.entries(rawDocument.casConditions)) {
      if (!doc[path] || doc[path]._k !== oldKid) return false;
    }
    for (const [path, value] of Object.entries(rawDocument.fields)) {
      doc[path] = value;
    }
    return true;
  }

  async replaceBatch(rawDocuments) {
    let count = 0;
    for (const doc of rawDocuments) {
      if (await this.replace(doc)) count++;
    }
    return count;
  }

  async saveCheckpoint(taskId, cursorState) {
    this._checkpoints.set(taskId, cursorState);
  }

  async loadCheckpoint(taskId) {
    const state = this._checkpoints.get(taskId);
    if (state === '__COMPLETED__') return null;
    return state || null;
  }
}

// ===== Main =====
async function main() {
  console.log('=== DEK Re-Encryption Example ===\n');

  // 1. Setup
  const vaultStore = new InMemoryVaultStore();
  const keyVaultService = new KeyVaultService({ vaultStore, cmkProvider: localCmkProvider });
  const storageAdapter = new MongooseStorageAdapter();
  const codec = new CryptoCodec();
  const rewriteStore = new InMemoryDocumentRewriteStore();

  const namespace = 'default.default.User#phone';
  const ns = Namespace.parse(namespace);

  // 2. Initialize vault (v1)
  await keyVaultService.ensureVaultInitialized(namespace);
  const v1Keys = await keyVaultService.getActiveKeyPair(namespace);
  console.log(`[1] Vault initialized: activeKid=${v1Keys.activeKid}, dekVersion=${v1Keys.activeDekVersion}`);

  // 3. Encrypt sample documents with v1
  for (let i = 1; i <= 5; i++) {
    const phone = `1380013800${i}`;
    const plaintext = Buffer.from(phone, 'utf8');
    const blob = codec.encrypt(v1Keys.dek, plaintext, 'AES_256_GCM', ns, 1);
    const payload = storageAdapter.buildEncryptedPayload(blob, 'STR', null);
    payload._k = v1Keys.activeKid;
    payload._a = 'AES_256_GCM';
    rewriteStore.seed(`user-${i}`, { phone: payload });
  }
  console.log('[2] Seeded 5 documents encrypted with v1\n');

  // 4. Rotate DEK (v1 → ROTATED, v2 → ACTIVE)
  await keyVaultService.rotateDek(namespace);
  const v2Keys = await keyVaultService.getActiveKeyPair(namespace);
  console.log(`[3] DEK rotated: new activeKid=${v2Keys.activeKid}, dekVersion=${v2Keys.activeDekVersion}`);

  // 5. Re-encrypt all documents
  const service = new DekReEncryptionService({
    keyVaultService,
    storageAdapter,
    rewriteStore
  });

  const fieldConfigs = [
    { path: 'phone', namespace, blindIndex: false }
  ];

  console.log('\n[4] Starting re-encryption...');
  const result = await service.reEncrypt('users', fieldConfigs, {
    taskId: 'example-task',
    batchSize: 10
  });

  console.log(`    docsProcessed: ${result.docsProcessed}`);
  console.log(`    docsSkipped:   ${result.docsSkipped}`);
  console.log(`    docsFailed:    ${result.docsFailed}`);
  console.log(`    fieldsReEncrypted: ${result.fieldsReEncrypted}`);
  console.log(`    durationMicros: ${result.durationMicros}`);

  // 6. Verify a document can be decrypted with v2
  const doc = rewriteStore._docs.get('user-1');
  const decrypted = codec.decrypt(v2Keys.dek, doc.phone.c, 'AES_256_GCM');
  console.log(`\n[5] Verification: user-1 phone decrypted with v2 = "${decrypted.toString('utf8')}"`);

  // 7. Check vault status (v1 should be RETIRED)
  const vaultDoc = await vaultStore.load(namespace);
  console.log('\n[6] Vault key statuses:');
  for (const key of vaultDoc.keys) {
    console.log(`    ${key.kid}: ${key.status}`);
  }

  // 8. Prune retired keys
  const pruned = await keyVaultService.pruneRetiredKeys(namespace);
  console.log(`\n[7] Pruned ${pruned} retired key(s)`);

  const finalVault = await vaultStore.load(namespace);
  console.log(`    Remaining keys: ${finalVault.keys.length}`);
  console.log('\n=== Done ===');
}

main().catch(err => {
  console.error('Example failed:', err);
  process.exit(1);
});

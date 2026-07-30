'use strict';

const crypto = require('crypto');
const DekReEncryptionService = require('../../../src/service/DekReEncryptionService');
const KeyVaultService = require('../../../src/service/KeyVaultService');
const InMemoryVaultStore = require('../../../src/adapter/InMemoryVaultStore');
const MongooseStorageAdapter = require('../../../src/adapter/MongooseStorageAdapter');
const CryptoCodec = require('../../../src/crypto/CryptoCodec');
const Namespace = require('../../../src/namespace/Namespace');

const NS_USER_PHONE = 'default.default.User#phone';
const ALGORITHM = 'AES_256_GCM';

/**
 * Create a mock CMK provider for testing.
 */
function createMockCmkProvider() {
  const localKey = crypto.randomBytes(32);
  return {
    getProviderId: jest.fn().mockReturnValue('local-symmetric'),
    getPublicReference: jest.fn().mockReturnValue('local-cmk-sha256:abcd1234'),
    wrap: jest.fn().mockImplementation(async (plaintextKey) => {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', localKey, iv);
      const encrypted = Buffer.concat([cipher.update(plaintextKey), cipher.final()]);
      const tag = cipher.getAuthTag();
      return {
        ciphertext: Buffer.concat([iv, encrypted, tag]),
        algorithm: 'AES-256-GCM',
        metadata: {}
      };
    }),
    unwrap: jest.fn().mockImplementation(async (wrappedKey) => {
      const data = wrappedKey.ciphertext;
      const iv = data.subarray(0, 12);
      const tag = data.subarray(data.length - 16);
      const ciphertext = data.subarray(12, data.length - 16);
      const decipher = crypto.createDecipheriv('aes-256-gcm', localKey, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    })
  };
}

/**
 * Create a mock DocumentRewriteStore that yields predefined documents.
 */
function createMockRewriteStore(documents) {
  const store = {
    scan: jest.fn().mockImplementation(async function* () {
      for (const doc of documents) {
        yield doc;
      }
    }),
    replace: jest.fn().mockResolvedValue(true),
    replaceBatch: jest.fn().mockImplementation(async (docs) => docs.length),
    saveCheckpoint: jest.fn().mockResolvedValue(undefined),
    loadCheckpoint: jest.fn().mockResolvedValue(null)
  };
  return store;
}

/**
 * Encrypt a value with a specific DEK version to simulate old encrypted data.
 */
function encryptWithVersion(codec, dek, hmacKey, kid, dekVersion, value, namespace, blindIndex) {
  const ns = Namespace.parse(namespace);
  const plaintext = Buffer.from(String(value), 'utf8');
  const blob = codec.encrypt(dek, plaintext, ALGORITHM, ns, dekVersion);

  const payload = { c: blob, _e: 1, _t: 'STR', _k: kid, _a: ALGORITHM };
  if (blindIndex) {
    const BlindIndexEngine = require('../../../src/blindindex/BlindIndexEngine');
    const biEngine = new BlindIndexEngine();
    payload.b = biEngine.compute(hmacKey, ns, 'phone', String(value));
  }
  return payload;
}

describe('DekReEncryptionService (unit)', () => {
  let cmkProvider;
  let vaultStore;
  let keyVaultService;
  let codec;
  let storageAdapter;

  beforeEach(() => {
    cmkProvider = createMockCmkProvider();
    vaultStore = new InMemoryVaultStore();
    keyVaultService = new KeyVaultService({ vaultStore, cmkProvider });
    codec = new CryptoCodec();
    storageAdapter = new MongooseStorageAdapter();
  });

  function createService(rewriteStore, eventBus) {
    return new DekReEncryptionService({
      keyVaultService,
      storageAdapter,
      rewriteStore,
      eventBus
    });
  }

  async function setupRotatedVault(namespace) {
    // Initialize vault (v1 ACTIVE)
    await keyVaultService.ensureVaultInitialized(namespace);
    const keyPairV1 = await keyVaultService.getActiveKeyPair(namespace);

    // Rotate to v2 (v1 becomes ROTATED, v2 is ACTIVE)
    await keyVaultService.rotateDek(namespace);
    const keyPairV2 = await keyVaultService.getActiveKeyPair(namespace);

    return { keyPairV1, keyPairV2 };
  }

  describe('reEncrypt — full flow', () => {
    test('decrypts with old DEK, re-encrypts with active DEK, recomputes blind index, replaces', async () => {
      const { keyPairV1, keyPairV2 } = await setupRotatedVault(NS_USER_PHONE);

      // Create a document encrypted with v1
      const encryptedField = encryptWithVersion(
        codec, keyPairV1.dek, keyPairV1.hmacKey,
        keyPairV1.activeKid, 1, '13800138000', NS_USER_PHONE, true
      );

      const rawDoc = {
        id: 'doc-001',
        fields: { phone: encryptedField },
        casConditions: { phone: keyPairV1.activeKid }
      };

      const rewriteStore = createMockRewriteStore([rawDoc]);
      const service = createService(rewriteStore);

      const fieldConfigs = [{
        path: 'phone',
        namespace: NS_USER_PHONE,
        blindIndex: true,
        blindIndexFieldName: 'phone'
      }];

      const result = await service.reEncrypt('users', fieldConfigs);

      // Verify result
      expect(result.docsProcessed).toBe(1);
      expect(result.docsFailed).toBe(0);
      expect(result.fieldsReEncrypted).toBe(1);
      expect(result.dryRun).toBe(false);

      // Verify replaceBatch was called
      expect(rewriteStore.replaceBatch).toHaveBeenCalledTimes(1);
      const batchArg = rewriteStore.replaceBatch.mock.calls[0][0];
      expect(batchArg).toHaveLength(1);

      // Verify the new payload has active kid
      const newPayload = batchArg[0].fields.phone;
      expect(newPayload._k).toBe(keyPairV2.activeKid);
      expect(newPayload._e).toBe(1);
      expect(newPayload._a).toBe(ALGORITHM);

      // Verify new blob decrypts correctly with active DEK
      const decrypted = codec.decrypt(keyPairV2.dek, newPayload.c, ALGORITHM);
      expect(decrypted.toString('utf8')).toBe('13800138000');

      // Verify blind index was recomputed (present and non-null)
      expect(newPayload.b).toBeDefined();
      expect(typeof newPayload.b).toBe('string');
    });
  });

  describe('reEncrypt — skip already-current', () => {
    test('dekVersion == active → skip (no replace call)', async () => {
      const { keyPairV2 } = await setupRotatedVault(NS_USER_PHONE);

      // Create a document already encrypted with v2 (active)
      const encryptedField = encryptWithVersion(
        codec, keyPairV2.dek, keyPairV2.hmacKey,
        keyPairV2.activeKid, 2, '13800138000', NS_USER_PHONE, false
      );

      const rawDoc = {
        id: 'doc-002',
        fields: { phone: encryptedField },
        casConditions: { phone: keyPairV2.activeKid }
      };

      const rewriteStore = createMockRewriteStore([rawDoc]);
      const service = createService(rewriteStore);

      const fieldConfigs = [{
        path: 'phone',
        namespace: NS_USER_PHONE,
        blindIndex: false
      }];

      const result = await service.reEncrypt('users', fieldConfigs);

      expect(result.docsProcessed).toBe(1);
      expect(result.docsSkipped).toBe(1);
      expect(result.fieldsReEncrypted).toBe(0);
      expect(rewriteStore.replaceBatch).not.toHaveBeenCalled();
    });
  });

  describe('reEncrypt — CAS conflict', () => {
    test('replace returns false → docsSkipped incremented', async () => {
      const { keyPairV1 } = await setupRotatedVault(NS_USER_PHONE);

      const encryptedField = encryptWithVersion(
        codec, keyPairV1.dek, keyPairV1.hmacKey,
        keyPairV1.activeKid, 1, '13800138000', NS_USER_PHONE, false
      );

      const rawDoc = {
        id: 'doc-003',
        fields: { phone: encryptedField },
        casConditions: { phone: keyPairV1.activeKid }
      };

      const rewriteStore = createMockRewriteStore([rawDoc]);
      // Simulate CAS conflict: replaceBatch returns 0 (no docs modified)
      rewriteStore.replaceBatch.mockResolvedValue(0);
      const service = createService(rewriteStore);

      const fieldConfigs = [{
        path: 'phone',
        namespace: NS_USER_PHONE,
        blindIndex: false
      }];

      const result = await service.reEncrypt('users', fieldConfigs);

      expect(result.docsProcessed).toBe(1);
      expect(result.docsSkipped).toBe(1);
      expect(result.docsFailed).toBe(0);
    });
  });

  describe('reEncrypt — checkpoint resume', () => {
    test('checkpoint save/load → resume skips processed docs', async () => {
      const { keyPairV1 } = await setupRotatedVault(NS_USER_PHONE);

      const encryptedField = encryptWithVersion(
        codec, keyPairV1.dek, keyPairV1.hmacKey,
        keyPairV1.activeKid, 1, '13800138000', NS_USER_PHONE, false
      );

      const rawDoc = {
        id: 'doc-004',
        fields: { phone: encryptedField },
        casConditions: { phone: keyPairV1.activeKid }
      };

      const rewriteStore = createMockRewriteStore([rawDoc]);
      rewriteStore.loadCheckpoint.mockResolvedValue('doc-003'); // resume after doc-003
      const service = createService(rewriteStore);

      const fieldConfigs = [{
        path: 'phone',
        namespace: NS_USER_PHONE,
        blindIndex: false
      }];

      await service.reEncrypt('users', fieldConfigs, { taskId: 'task-1', checkpointInterval: 1 });

      // Verify loadCheckpoint was called with taskId
      expect(rewriteStore.loadCheckpoint).toHaveBeenCalledWith('task-1');

      // Verify scan was called with resumeAfter
      expect(rewriteStore.scan).toHaveBeenCalledWith(
        expect.objectContaining({ resumeAfter: 'doc-003' })
      );

      // Verify saveCheckpoint was called (final checkpoint)
      expect(rewriteStore.saveCheckpoint).toHaveBeenCalledWith('task-1', '__COMPLETED__');
    });
  });

  describe('reEncrypt — markKeysRetired on completion', () => {
    test('completion → markKeysRetired called with old kids', async () => {
      const { keyPairV1 } = await setupRotatedVault(NS_USER_PHONE);

      const encryptedField = encryptWithVersion(
        codec, keyPairV1.dek, keyPairV1.hmacKey,
        keyPairV1.activeKid, 1, '13800138000', NS_USER_PHONE, false
      );

      const rawDoc = {
        id: 'doc-005',
        fields: { phone: encryptedField },
        casConditions: { phone: keyPairV1.activeKid }
      };

      const rewriteStore = createMockRewriteStore([rawDoc]);
      const service = createService(rewriteStore);

      // Spy on markKeysRetired
      const markSpy = jest.spyOn(keyVaultService, 'markKeysRetired');

      const fieldConfigs = [{
        path: 'phone',
        namespace: NS_USER_PHONE,
        blindIndex: false
      }];

      const result = await service.reEncrypt('users', fieldConfigs);

      expect(result.docsFailed).toBe(0);
      expect(markSpy).toHaveBeenCalledWith(NS_USER_PHONE, expect.arrayContaining([keyPairV1.activeKid]));
    });
  });

  describe('reEncrypt — dryRun', () => {
    test('dryRun → no replace calls, result.dryRun === true', async () => {
      const { keyPairV1 } = await setupRotatedVault(NS_USER_PHONE);

      const encryptedField = encryptWithVersion(
        codec, keyPairV1.dek, keyPairV1.hmacKey,
        keyPairV1.activeKid, 1, '13800138000', NS_USER_PHONE, false
      );

      const rawDoc = {
        id: 'doc-006',
        fields: { phone: encryptedField },
        casConditions: { phone: keyPairV1.activeKid }
      };

      const rewriteStore = createMockRewriteStore([rawDoc]);
      const service = createService(rewriteStore);

      const fieldConfigs = [{
        path: 'phone',
        namespace: NS_USER_PHONE,
        blindIndex: false
      }];

      const result = await service.reEncrypt('users', fieldConfigs, { dryRun: true });

      expect(result.dryRun).toBe(true);
      expect(result.docsProcessed).toBe(1);
      expect(result.fieldsReEncrypted).toBe(1);
      expect(rewriteStore.replaceBatch).not.toHaveBeenCalled();
      expect(rewriteStore.replace).not.toHaveBeenCalled();
    });
  });

  describe('reEncrypt — blind index recomputed', () => {
    test('blind index recomputed with active HMAC key (new b value differs from old)', async () => {
      const { keyPairV1 } = await setupRotatedVault(NS_USER_PHONE);

      // Create encrypted field with blind index using v1 HMAC key
      const encryptedField = encryptWithVersion(
        codec, keyPairV1.dek, keyPairV1.hmacKey,
        keyPairV1.activeKid, 1, '13800138000', NS_USER_PHONE, true
      );
      const oldBlindIndex = encryptedField.b;

      const rawDoc = {
        id: 'doc-007',
        fields: { phone: encryptedField },
        casConditions: { phone: keyPairV1.activeKid }
      };

      const rewriteStore = createMockRewriteStore([rawDoc]);
      const service = createService(rewriteStore);

      const fieldConfigs = [{
        path: 'phone',
        namespace: NS_USER_PHONE,
        blindIndex: true,
        blindIndexFieldName: 'phone'
      }];

      await service.reEncrypt('users', fieldConfigs);

      const batchArg = rewriteStore.replaceBatch.mock.calls[0][0];
      const newPayload = batchArg[0].fields.phone;

      // New blind index should differ from old (different HMAC key)
      expect(newPayload.b).toBeDefined();
      expect(newPayload.b).not.toBe(oldBlindIndex);
    });
  });

  describe('reEncryptAll', () => {
    test('per-collection error isolation', async () => {
      await setupRotatedVault(NS_USER_PHONE);

      const rewriteStore = createMockRewriteStore([]);
      const service = createService(rewriteStore);

      const fieldConfigSets = [
        {
          collection: 'users',
          fieldConfigs: [{ path: 'phone', namespace: NS_USER_PHONE, blindIndex: false }]
        },
        {
          collection: 'orders',
          fieldConfigs: [{ path: 'ssn', namespace: 'default.default.Order#ssn', blindIndex: false }]
        }
      ];

      const results = await service.reEncryptAll(fieldConfigSets);

      expect(results).toHaveLength(2);
      expect(results[0].namespace).toBe('users');
      expect(results[1].namespace).toBe('orders');
    });
  });
});

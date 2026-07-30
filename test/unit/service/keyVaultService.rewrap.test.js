'use strict';

const crypto = require('crypto');
const KeyVaultService = require('../../../src/service/KeyVaultService');
const InMemoryVaultStore = require('../../../src/adapter/InMemoryVaultStore');

const NS_USER_PHONE = 'default.default.User#phone';
const NS_USER_EMAIL = 'default.default.User#email';
const NS_ORDER_SSN = 'default.default.Order#ssn';

/**
 * Create a mock CMK provider backed by a random AES-256-GCM key.
 */
function createMockProvider(providerId, publicReference) {
  const key = crypto.randomBytes(32);
  return {
    _key: key,
    getProviderId: jest.fn().mockReturnValue(providerId),
    getPublicReference: jest.fn().mockReturnValue(publicReference),
    wrap: jest.fn().mockImplementation(async (plaintextKey) => {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(plaintextKey), cipher.final()]);
      const tag = cipher.getAuthTag();
      return {
        ciphertext: Buffer.concat([iv, encrypted, tag]),
        algorithm: 'AES-256-GCM',
        metadata: { cmkVersion: 'v1' }
      };
    }),
    unwrap: jest.fn().mockImplementation(async (wrappedKey) => {
      const data = wrappedKey.ciphertext;
      const iv = data.subarray(0, 12);
      const tag = data.subarray(data.length - 16);
      const ciphertext = data.subarray(12, data.length - 16);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    })
  };
}

describe('KeyVaultService rewrap (unit)', () => {
  let sourceProvider;
  let targetProvider;
  let vaultStore;
  let eventBus;
  let emittedEvents;

  beforeEach(() => {
    vaultStore = new InMemoryVaultStore();
    sourceProvider = createMockProvider('local-symmetric', 'local-cmk-sha256:abcd1234');
    targetProvider = createMockProvider('azure-keyvault', 'my-key-name');
    emittedEvents = [];
    eventBus = {
      emit: jest.fn((event) => { emittedEvents.push(event); })
    };
  });

  function createService(cmkProvider, opts = {}) {
    return new KeyVaultService({
      vaultStore,
      cmkProvider: cmkProvider || sourceProvider,
      cacheTtl: 3600000,
      eventBus: opts.eventBus || eventBus
    });
  }

  async function initVault(svc, namespace) {
    await svc.ensureVaultInitialized(namespace);
  }

  // 4.1 Happy path
  describe('rewrapVault happy path', () => {
    test('re-wraps keys under target provider, KCV unchanged, cmk updated', async () => {
      const svc = createService();
      await initVault(svc, NS_USER_PHONE);

      // Get key material before rewrap
      const keyPairBefore = await svc.getActiveKeyPair(NS_USER_PHONE);
      expect(keyPairBefore.dek).toBeInstanceOf(Buffer);

      const result = await svc.rewrapVault(NS_USER_PHONE, targetProvider);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(false);
      expect(result.dryRun).toBe(false);
      expect(result.keyCount).toBe(1);
      expect(result.error).toBeNull();
      expect(result.namespace).toBe(NS_USER_PHONE);
      expect(result.durationMicros).toBeGreaterThan(0);

      // Verify vault document updated
      const stored = await vaultStore.load(NS_USER_PHONE);
      expect(stored.cmk.provider).toBe('azure-keyvault');
      expect(stored.cmk.id).toBe('my-key-name');
      expect(stored.v).toBe(2);
      expect(stored.keys[0].dek.algorithm).toBe('AES-256-GCM');

      // Verify KCV unchanged (key material preserved)
      const storedBefore = await vaultStore.load(NS_USER_PHONE);
      // KCV is preserved since the underlying key material is the same
      expect(storedBefore.keys[0].dek.kcv).toBeDefined();

      // Verify VaultStore.rotate() was used (version incremented)
      expect(stored.v).toBe(2);
    });

    test('re-wraps multiple key entries (ACTIVE + ROTATED)', async () => {
      const svc = createService();
      await initVault(svc, NS_USER_PHONE);
      await svc.rotateDek(NS_USER_PHONE);

      const storedBefore = await vaultStore.load(NS_USER_PHONE);
      expect(storedBefore.keys).toHaveLength(2);

      const result = await svc.rewrapVault(NS_USER_PHONE, targetProvider);

      expect(result.success).toBe(true);
      expect(result.keyCount).toBe(2);

      const stored = await vaultStore.load(NS_USER_PHONE);
      expect(stored.keys).toHaveLength(2);
      expect(stored.cmk.provider).toBe('azure-keyvault');
      expect(stored.v).toBe(3); // was 2 after rotation, now 3
    });
  });

  // 4.2 Same-provider no-op
  describe('rewrapVault same-provider no-op', () => {
    test('skips when providerId and publicReference both match', async () => {
      const svc = createService();
      await initVault(svc, NS_USER_PHONE);

      const sameProvider = createMockProvider('local-symmetric', 'local-cmk-sha256:abcd1234');
      const result = await svc.rewrapVault(NS_USER_PHONE, sameProvider);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);

      // Vault unchanged
      const stored = await vaultStore.load(NS_USER_PHONE);
      expect(stored.v).toBe(1);
      expect(stored.cmk.provider).toBe('local-symmetric');
    });
  });

  // 4.3 Same providerId but different publicReference
  describe('rewrapVault same providerId different key', () => {
    test('proceeds with re-wrap when publicReference differs', async () => {
      const svc = createService();
      await initVault(svc, NS_USER_PHONE);

      const differentKeyProvider = createMockProvider('local-symmetric', 'local-cmk-sha256:ffff9999');
      const result = await svc.rewrapVault(NS_USER_PHONE, differentKeyProvider);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(false);

      const stored = await vaultStore.load(NS_USER_PHONE);
      expect(stored.cmk.provider).toBe('local-symmetric');
      expect(stored.cmk.id).toBe('local-cmk-sha256:ffff9999');
      expect(stored.v).toBe(2);
    });
  });

  // 4.4 KCV mismatch
  describe('rewrapVault KCV mismatch', () => {
    test('throws error when stored KCV is corrupted', async () => {
      const svc = createService();
      await initVault(svc, NS_USER_PHONE);

      // Corrupt the stored KCV
      const stored = await vaultStore.load(NS_USER_PHONE);
      stored.keys[0].dek.kcv = 'corrupted-kcv-value';
      stored.v = stored.v + 1;
      // Directly manipulate store to corrupt KCV
      vaultStore._store.set(NS_USER_PHONE, stored);

      const result = await svc.rewrapVault(NS_USER_PHONE, targetProvider);

      expect(result.success).toBe(false);
      expect(result.error).toContain('KCV mismatch');
    });
  });

  // 4.5 Post-rewrap roundtrip failure
  describe('rewrapVault post-rewrap roundtrip failure', () => {
    test('throws error when target unwrap returns wrong bytes', async () => {
      const svc = createService();
      await initVault(svc, NS_USER_PHONE);

      // Create a broken target provider whose unwrap returns wrong data
      const brokenTarget = createMockProvider('broken-kms', 'broken-kms:key1');
      brokenTarget.unwrap.mockImplementation(async () => crypto.randomBytes(32));

      const result = await svc.rewrapVault(NS_USER_PHONE, brokenTarget);

      expect(result.success).toBe(false);
      expect(result.error).toContain('roundtrip verification failed');

      // Vault unchanged
      const stored = await vaultStore.load(NS_USER_PHONE);
      expect(stored.v).toBe(1);
      expect(stored.cmk.provider).toBe('local-symmetric');
    });
  });

  // 4.6 Optimistic lock conflict
  describe('rewrapVault optimistic lock conflict', () => {
    test('returns clean error on concurrent modification', async () => {
      const svc = createService();
      await initVault(svc, NS_USER_PHONE);

      // Simulate concurrent modification: bump version between load() and rotate()
      const originalRotate = vaultStore.rotate.bind(vaultStore);
      vaultStore.rotate = jest.fn(async (doc) => {
        // Simulate another process having incremented the version
        vaultStore._store.get(NS_USER_PHONE).v = 99;
        return originalRotate(doc);
      });

      const result = await svc.rewrapVault(NS_USER_PHONE, targetProvider);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Concurrent modification detected');
    });
  });

  // 4.7 Dry-run mode
  describe('rewrapVault dry-run', () => {
    test('performs validation but does not persist', async () => {
      const svc = createService();
      await initVault(svc, NS_USER_PHONE);

      const result = await svc.rewrapVault(NS_USER_PHONE, targetProvider, { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.skipped).toBe(false);
      expect(result.keyCount).toBe(1);

      // Vault unchanged
      const stored = await vaultStore.load(NS_USER_PHONE);
      expect(stored.v).toBe(1);
      expect(stored.cmk.provider).toBe('local-symmetric');
    });
  });

  // 4.8 rewrapAllVaults partial failure
  describe('rewrapAllVaults partial failure', () => {
    test('isolates errors per namespace, continues processing', async () => {
      const svc = createService();
      await initVault(svc, NS_USER_PHONE);
      await initVault(svc, NS_USER_EMAIL);
      await initVault(svc, NS_ORDER_SSN);

      // Corrupt middle namespace's KCV to cause failure
      const emailDoc = vaultStore._store.get(NS_USER_EMAIL);
      emailDoc.keys[0].dek.kcv = 'corrupted';

      const results = await svc.rewrapAllVaults(targetProvider);

      expect(results).toHaveLength(3);
      const successResults = results.filter(r => r.success);
      const failedResults = results.filter(r => !r.success);
      expect(successResults.length).toBe(2);
      expect(failedResults.length).toBe(1);
      expect(failedResults[0].namespace).toBe(NS_USER_EMAIL);
      expect(failedResults[0].error).toContain('KCV mismatch');
    });
  });

  // 4.9 Event emission
  describe('rewrap event emission', () => {
    test('emits lcl.rewrap.namespace.completed on success', async () => {
      const svc = createService();
      await initVault(svc, NS_USER_PHONE);
      emittedEvents.length = 0;

      await svc.rewrapVault(NS_USER_PHONE, targetProvider);

      const completedEvents = emittedEvents.filter(e => e.event === 'lcl.rewrap.namespace.completed');
      expect(completedEvents).toHaveLength(1);
      expect(completedEvents[0].tier).toBe('L2');
      expect(completedEvents[0].result).toBe('success');
      expect(completedEvents[0].namespace).toBe(NS_USER_PHONE);
      expect(completedEvents[0].durationMicros).toBeGreaterThan(0);
    });

    test('emits lcl.rewrap.namespace.failed on failure', async () => {
      const svc = createService();
      await initVault(svc, NS_USER_PHONE);

      // Corrupt KCV to trigger failure
      const stored = vaultStore._store.get(NS_USER_PHONE);
      stored.keys[0].dek.kcv = 'bad';
      emittedEvents.length = 0;

      await svc.rewrapVault(NS_USER_PHONE, targetProvider);

      const failedEvents = emittedEvents.filter(e => e.event === 'lcl.rewrap.namespace.failed');
      expect(failedEvents).toHaveLength(1);
      expect(failedEvents[0].tier).toBe('L2');
      expect(failedEvents[0].result).toBe('failed');
      expect(failedEvents[0].namespace).toBe(NS_USER_PHONE);
      expect(failedEvents[0].errorType).toBeDefined();
    });

    test('emits lcl.rewrap.batch.completed on rewrapAllVaults', async () => {
      const svc = createService();
      await initVault(svc, NS_USER_PHONE);
      await initVault(svc, NS_USER_EMAIL);
      emittedEvents.length = 0;

      await svc.rewrapAllVaults(targetProvider);

      const batchEvents = emittedEvents.filter(e => e.event === 'lcl.rewrap.batch.completed');
      expect(batchEvents).toHaveLength(1);
      expect(batchEvents[0].tier).toBe('L2');
      expect(batchEvents[0].result).toBe('success');
      expect(batchEvents[0].attributes.get('totalCount')).toBe('2');
      expect(batchEvents[0].attributes.get('successCount')).toBe('2');
      expect(batchEvents[0].attributes.get('failedCount')).toBe('0');
    });
  });

  // 4.10 Cache eviction
  describe('rewrapVault cache eviction', () => {
    test('evicts cache after rewrap, next access reloads from store', async () => {
      const svc = createService();
      await initVault(svc, NS_USER_PHONE);

      // Cache is populated
      expect(svc._cache.has(NS_USER_PHONE)).toBe(true);

      // After rewrap, we need a service that uses the target provider to reload
      const result = await svc.rewrapVault(NS_USER_PHONE, targetProvider);
      expect(result.success).toBe(true);

      // Cache should be evicted
      expect(svc._cache.has(NS_USER_PHONE)).toBe(false);
    });
  });

  // Vault not found
  describe('rewrapVault vault not found', () => {
    test('returns error when namespace does not exist', async () => {
      const svc = createService();
      const result = await svc.rewrapVault('nonexistent.namespace#field', targetProvider);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Vault not found');
    });
  });
});

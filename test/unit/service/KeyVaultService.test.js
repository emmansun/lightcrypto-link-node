'use strict';

const crypto = require('crypto');
const KeyVaultService = require('../../../src/service/KeyVaultService');
const InMemoryVaultStore = require('../../../src/adapter/InMemoryVaultStore');

const NS_USER_PHONE = 'default.default.User#phone';
const NS_USER_EMAIL = 'default.default.User#email';
const NS_ORDER_SSN = 'default.default.Order#ssn';

describe('KeyVaultService (unit)', () => {
  let cmkProvider;
  let vaultStore;

  beforeEach(() => {
    vaultStore = new InMemoryVaultStore();

    const localKey = crypto.randomBytes(32);
    cmkProvider = {
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
  });

  function createService(options = {}) {
    return new KeyVaultService({
      vaultStore,
      cmkProvider,
      cacheTtl: options.cacheTtl || 3600000
    });
  }

  describe('constructor', () => {
    test('initializes with default cache TTL', () => {
      const svc = createService();
      expect(svc._cacheTtl).toBe(3600000);
    });

    test('initializes with custom cache TTL', () => {
      const svc = createService({ cacheTtl: 60000 });
      expect(svc._cacheTtl).toBe(60000);
    });
  });

  describe('_generateKid', () => {
    test('generates kid in format v{version}-{8 hex chars}', () => {
      const svc = createService();
      const kid = svc._generateKid(1);
      expect(kid).toMatch(/^v1-[0-9a-f]{8}$/);
    });

    test('generates unique kids', () => {
      const svc = createService();
      const kid1 = svc._generateKid(1);
      const kid2 = svc._generateKid(1);
      expect(kid1).not.toBe(kid2);
    });

    test('uses version number in kid', () => {
      const svc = createService();
      const kid = svc._generateKid(5);
      expect(kid).toMatch(/^v5-[0-9a-f]{8}$/);
    });
  });

  describe('_parseVersion', () => {
    test('parses version from valid kid', () => {
      const svc = createService();
      expect(svc._parseVersion('v1-a3b2c1d4')).toBe(1);
      expect(svc._parseVersion('v42-deadbeef')).toBe(42);
    });

    test('throws on invalid kid format', () => {
      const svc = createService();
      expect(() => svc._parseVersion('invalid')).toThrow(/Invalid kid format/);
      expect(() => svc._parseVersion('x1-aabbccdd')).toThrow(/Invalid kid format/);
    });
  });

  describe('_getFromCache', () => {
    test('returns null for non-existent entry', () => {
      const svc = createService();
      expect(svc._getFromCache(NS_USER_PHONE)).toBeNull();
    });

    test('returns cached entry when not expired', () => {
      const svc = createService();
      const entry = {
        activeKid: 'v1-abcd1234',
        activeDekVersion: 1,
        resolvedKeys: new Map(),
        resolvedKeysByVersion: new Map(),
        expiresAt: Date.now() + 60000
      };
      svc._cache.set(NS_USER_PHONE, entry);

      const result = svc._getFromCache(NS_USER_PHONE);
      expect(result).toBe(entry);
    });

    test('returns null and destroys expired entry', () => {
      const svc = createService();
      const pair = { dek: crypto.randomBytes(32), hmacKey: crypto.randomBytes(32) };
      const entry = {
        activeKid: 'v1-abcd1234',
        activeDekVersion: 1,
        resolvedKeys: new Map([['v1-abcd1234', pair]]),
        resolvedKeysByVersion: new Map([[1, pair]]),
        expiresAt: Date.now() - 1000 // expired
      };
      svc._cache.set(NS_USER_PHONE, entry);

      const result = svc._getFromCache(NS_USER_PHONE);
      expect(result).toBeNull();
      expect(svc._cache.has(NS_USER_PHONE)).toBe(false);
    });
  });

  describe('flushCache', () => {
    test('clears all cached entries', () => {
      const svc = createService();
      svc._cache.set(NS_USER_PHONE, {
        resolvedKeys: new Map(),
        resolvedKeysByVersion: new Map(),
        expiresAt: Date.now() + 60000
      });
      svc._cache.set(NS_USER_EMAIL, {
        resolvedKeys: new Map(),
        resolvedKeysByVersion: new Map(),
        expiresAt: Date.now() + 60000
      });

      svc.flushCache();
      expect(svc._cache.size).toBe(0);
    });

    test('destroys key material on flush', () => {
      const svc = createService();
      const dek = crypto.randomBytes(32);
      const originalDek = Buffer.from(dek);
      const pair = { dek, hmacKey: crypto.randomBytes(32) };
      svc._cache.set(NS_USER_PHONE, {
        activeKid: 'v1-abcd1234',
        activeDekVersion: 1,
        resolvedKeys: new Map([['v1-abcd1234', pair]]),
        resolvedKeysByVersion: new Map([[1, pair]]),
        expiresAt: Date.now() + 60000
      });

      svc.flushCache();
      expect(dek.equals(originalDek)).toBe(false);
    });
  });

  describe('ensureVaultInitialized', () => {
    test('creates vault on first call', async () => {
      const svc = createService();
      await svc.ensureVaultInitialized(NS_USER_PHONE);

      const kid = await svc.getActiveKid(NS_USER_PHONE);
      expect(kid).toMatch(/^v1-[0-9a-f]{8}$/);
      const version = await svc.getActiveDekVersion(NS_USER_PHONE);
      expect(version).toBe(1);
    });

    test('uses cached entry on second call', async () => {
      const svc = createService();
      await svc.ensureVaultInitialized(NS_USER_PHONE);
      const kid1 = await svc.getActiveKid(NS_USER_PHONE);
      const kid2 = await svc.getActiveKid(NS_USER_PHONE);
      expect(kid1).toBe(kid2);
    });

    test('persists vault document in vaultStore', async () => {
      const svc = createService();
      await svc.ensureVaultInitialized(NS_USER_PHONE);

      const stored = await vaultStore.load(NS_USER_PHONE);
      expect(stored).not.toBeNull();
      expect(stored.status).toBe('ACTIVE');
      expect(stored.v).toBe(1);
      expect(stored.keys).toHaveLength(1);
      expect(stored.id).toBe(NS_USER_PHONE);
    });

    test('does not duplicate vault on subsequent calls', async () => {
      const svc = createService();
      await svc.ensureVaultInitialized(NS_USER_PHONE);
      svc.flushCache();
      await svc.ensureVaultInitialized(NS_USER_PHONE);

      const stored = await vaultStore.load(NS_USER_PHONE);
      expect(stored.v).toBe(1);
      expect(stored.keys).toHaveLength(1);
    });

    test('per-field vault: different namespaces get independent vaults', async () => {
      const svc = createService();
      await svc.ensureVaultInitialized(NS_USER_PHONE);
      await svc.ensureVaultInitialized(NS_USER_EMAIL);

      const kidPhone = await svc.getActiveKid(NS_USER_PHONE);
      const kidEmail = await svc.getActiveKid(NS_USER_EMAIL);
      expect(kidPhone).not.toBe(kidEmail);

      const storedPhone = await vaultStore.load(NS_USER_PHONE);
      const storedEmail = await vaultStore.load(NS_USER_EMAIL);
      expect(storedPhone).not.toBeNull();
      expect(storedEmail).not.toBeNull();
    });
  });

  describe('getActiveKid / getActiveDekVersion / getActiveHmacKey', () => {
    test('returns correct values after initialization', async () => {
      const svc = createService();
      await svc.ensureVaultInitialized(NS_USER_PHONE);

      const kid = await svc.getActiveKid(NS_USER_PHONE);
      expect(kid).toMatch(/^v1-[0-9a-f]{8}$/);

      const version = await svc.getActiveDekVersion(NS_USER_PHONE);
      expect(version).toBe(1);

      const hmacKey = await svc.getActiveHmacKey(NS_USER_PHONE);
      expect(hmacKey).toBeInstanceOf(Buffer);
      expect(hmacKey.length).toBe(32);
    });

    test('auto-initializes vault for unknown namespace', async () => {
      const svc = createService();
      // getActiveKid auto-creates vault via _ensureCached → ensureVaultInitialized
      const kid = await svc.getActiveKid('unknown.namespace#field');
      expect(kid).toMatch(/^v1-/);
    });
  });

  describe('rotateDek', () => {
    test('rotates DEK and increments version', async () => {
      const svc = createService();
      await svc.ensureVaultInitialized(NS_USER_PHONE);

      await svc.rotateDek(NS_USER_PHONE);
      const kid = await svc.getActiveKid(NS_USER_PHONE);
      expect(kid).toMatch(/^v2-[0-9a-f]{8}$/);
      const version = await svc.getActiveDekVersion(NS_USER_PHONE);
      expect(version).toBe(2);
    });

    test('marks old key as ROTATED and adds new ACTIVE key', async () => {
      const svc = createService();
      await svc.ensureVaultInitialized(NS_USER_PHONE);
      await svc.rotateDek(NS_USER_PHONE);

      const stored = await vaultStore.load(NS_USER_PHONE);
      expect(stored.keys).toHaveLength(2);
      expect(stored.keys[0].status).toBe('ROTATED');
      expect(stored.keys[1].status).toBe('ACTIVE');
    });

    test('throws when vault does not exist', async () => {
      const svc = createService();
      await expect(svc.rotateDek('unknown.namespace#field')).rejects.toThrow(/Vault not found/);
    });
  });

  describe('getDek', () => {
    test('returns DEK for known kid', async () => {
      const svc = createService();
      await svc.ensureVaultInitialized(NS_USER_PHONE);
      const kid = await svc.getActiveKid(NS_USER_PHONE);

      const dek = await svc.getDek(kid);
      expect(dek).toBeInstanceOf(Buffer);
      expect(dek.length).toBe(32);
    });

    test('returns historical DEK for rotated kid', async () => {
      const svc = createService();
      await svc.ensureVaultInitialized(NS_USER_PHONE);
      const oldKid = await svc.getActiveKid(NS_USER_PHONE);
      const oldDek = Buffer.from(await svc.getDek(oldKid));

      await svc.rotateDek(NS_USER_PHONE);

      const retrieved = await svc.getDek(oldKid);
      expect(retrieved.equals(oldDek)).toBe(true);
    });

    test('searches across all namespaces', async () => {
      const svc = createService();
      await svc.ensureVaultInitialized(NS_USER_PHONE);
      await svc.ensureVaultInitialized(NS_USER_EMAIL);

      const kidPhone = await svc.getActiveKid(NS_USER_PHONE);
      const kidEmail = await svc.getActiveKid(NS_USER_EMAIL);

      // getDek should find kids from any namespace
      const dekPhone = await svc.getDek(kidPhone);
      const dekEmail = await svc.getDek(kidEmail);
      expect(dekPhone).toBeInstanceOf(Buffer);
      expect(dekEmail).toBeInstanceOf(Buffer);
    });

    test('throws for unknown kid', async () => {
      const svc = createService();
      await svc.ensureVaultInitialized(NS_USER_PHONE);

      await expect(svc.getDek('v99-unknown')).rejects.toThrow(/Unknown kid/);
    });
  });

  describe('getHmacKey', () => {
    test('returns HMAC key for known kid', async () => {
      const svc = createService();
      await svc.ensureVaultInitialized(NS_USER_PHONE);
      const kid = await svc.getActiveKid(NS_USER_PHONE);

      const hmacKey = await svc.getHmacKey(kid);
      expect(hmacKey).toBeInstanceOf(Buffer);
      expect(hmacKey.length).toBe(32);
    });

    test('throws for unknown kid', async () => {
      const svc = createService();
      await svc.ensureVaultInitialized(NS_USER_PHONE);

      await expect(svc.getHmacKey('v99-unknown')).rejects.toThrow(/Unknown kid/);
    });
  });

  describe('getDekByVersion', () => {
    test('returns DEK for specific version', async () => {
      const svc = createService();
      await svc.ensureVaultInitialized(NS_USER_PHONE);

      const dekV1 = await svc.getDekByVersion(NS_USER_PHONE, 1);
      expect(dekV1).toBeInstanceOf(Buffer);

      await svc.rotateDek(NS_USER_PHONE);
      const dekV2 = await svc.getDekByVersion(NS_USER_PHONE, 2);
      expect(dekV2).toBeInstanceOf(Buffer);

      // v1 should still be accessible
      const dekV1Again = await svc.getDekByVersion(NS_USER_PHONE, 1);
      expect(dekV1Again.equals(dekV1)).toBe(true);
    });

    test('throws for unknown version', async () => {
      const svc = createService();
      await svc.ensureVaultInitialized(NS_USER_PHONE);

      await expect(svc.getDekByVersion(NS_USER_PHONE, 99)).rejects.toThrow(/No key found/);
    });
  });
});

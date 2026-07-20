'use strict';

const crypto = require('crypto');
const KeyVaultService = require('../../../src/service/KeyVaultService');
const CryptoCodec = require('../../../src/crypto/CryptoCodec');

describe('KeyVaultService (unit)', () => {
  let cmkProvider;
  let mockConnection;
  let mockVaultModel;
  let codec;

  beforeEach(() => {
    codec = new CryptoCodec();

    // Mock CMK provider using local AES-GCM wrap/unwrap
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

    mockVaultModel = {
      findById: jest.fn(),
      updateOne: jest.fn()
    };

    mockConnection = {
      models: {},
      model: jest.fn().mockReturnValue(mockVaultModel)
    };
  });

  function createService(options = {}) {
    return new KeyVaultService({
      connection: mockConnection,
      cmkProvider,
      cacheTtl: options.cacheTtl || 3600000
    });
  }

  function createMockVaultDoc(entityName, dek, hmacKey, kid) {
    const dekKcv = codec.computeKcv(dek, 'AES_256_GCM');
    const hmkKcv = codec.computeKcv(hmacKey, 'AES_256_GCM');
    const binding = codec.computeBinding(hmacKey, dek);

    return {
      _id: `lcl-dek-${entityName}`,
      v: 1,
      status: 'ACTIVE',
      activeKid: kid,
      keys: [{
        kid,
        status: 'ACTIVE',
        dek: { wrapped: null, algorithm: 'AES-256-GCM', kcv: dekKcv, cmkVersion: '' },
        hmk: { wrapped: null, algorithm: 'AES-256-GCM', kcv: hmkKcv, cmkVersion: '' },
        binding,
        createdAt: new Date()
      }],
      cmk: { provider: 'local-symmetric', id: 'local-cmk-sha256:abcd1234' },
      save: jest.fn().mockResolvedValue(true)
    };
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

  describe('_getFromCache', () => {
    test('returns null for non-existent entry', () => {
      const svc = createService();
      expect(svc._getFromCache('User')).toBeNull();
    });

    test('returns cached entry when not expired', () => {
      const svc = createService();
      const entry = {
        dek: crypto.randomBytes(32),
        hmacKey: crypto.randomBytes(32),
        activeKid: 'v1-abcd1234',
        expiresAt: Date.now() + 60000
      };
      svc._cache.set('User', entry);

      const result = svc._getFromCache('User');
      expect(result).toBe(entry);
    });

    test('returns null and destroys expired entry', () => {
      const svc = createService();
      const dek = crypto.randomBytes(32);
      const entry = {
        dek,
        hmacKey: crypto.randomBytes(32),
        activeKid: 'v1-abcd1234',
        expiresAt: Date.now() - 1000 // expired
      };
      svc._cache.set('User', entry);

      const result = svc._getFromCache('User');
      expect(result).toBeNull();
      expect(svc._cache.has('User')).toBe(false);
    });
  });

  describe('flushCache', () => {
    test('clears all cached entries', () => {
      const svc = createService();
      svc._cache.set('User', {
        dek: crypto.randomBytes(32),
        hmacKey: crypto.randomBytes(32),
        expiresAt: Date.now() + 60000
      });
      svc._cache.set('Order', {
        dek: crypto.randomBytes(32),
        hmacKey: crypto.randomBytes(32),
        expiresAt: Date.now() + 60000
      });

      svc.flushCache();
      expect(svc._cache.size).toBe(0);
    });

    test('destroys key material on flush', () => {
      const svc = createService();
      const dek = crypto.randomBytes(32);
      const originalDek = Buffer.from(dek);
      svc._cache.set('User', {
        dek,
        hmacKey: crypto.randomBytes(32),
        expiresAt: Date.now() + 60000
      });

      svc.flushCache();
      // After flush, the buffer should be overwritten with random data
      expect(dek.equals(originalDek)).toBe(false);
    });
  });

  describe('ensureVaultInitialized', () => {
    test('returns cached entry on second call', async () => {
      const svc = createService();
      const dek = crypto.randomBytes(32);
      const hmacKey = crypto.randomBytes(32);
      const kid = 'v1-abcd1234';

      // Pre-populate cache
      svc._cache.set('User', {
        dek,
        hmacKey,
        activeKid: kid,
        expiresAt: Date.now() + 60000,
        allKeys: new Map([[kid, { dek, hmacKey }]])
      });

      const result = await svc.ensureVaultInitialized('User');
      expect(result.activeKid).toBe(kid);
      expect(result.dek).toBe(dek);
      // Should not call findById since cache hit
      expect(mockVaultModel.findById).not.toHaveBeenCalled();
    });
  });

  describe('getDek', () => {
    test('returns active DEK for matching kid', async () => {
      const svc = createService();
      const dek = crypto.randomBytes(32);
      const hmacKey = crypto.randomBytes(32);
      const kid = 'v1-abcd1234';

      svc._cache.set('User', {
        dek,
        hmacKey,
        activeKid: kid,
        expiresAt: Date.now() + 60000,
        allKeys: new Map([[kid, { dek, hmacKey }]])
      });

      const result = await svc.getDek('User', kid);
      expect(result).toBe(dek);
    });

    test('returns historical DEK for rotated kid', async () => {
      const svc = createService();
      const activeDek = crypto.randomBytes(32);
      const oldDek = crypto.randomBytes(32);
      const hmacKey = crypto.randomBytes(32);

      svc._cache.set('User', {
        dek: activeDek,
        hmacKey,
        activeKid: 'v2-new',
        expiresAt: Date.now() + 60000,
        allKeys: new Map([
          ['v2-new', { dek: activeDek, hmacKey }],
          ['v1-old', { dek: oldDek, hmacKey }]
        ])
      });

      const result = await svc.getDek('User', 'v1-old');
      expect(result).toBe(oldDek);
    });

    test('throws for unknown kid', async () => {
      const svc = createService();
      const dek = crypto.randomBytes(32);

      svc._cache.set('User', {
        dek,
        hmacKey: crypto.randomBytes(32),
        activeKid: 'v1-abcd1234',
        expiresAt: Date.now() + 60000,
        allKeys: new Map()
      });

      await expect(svc.getDek('User', 'v99-unknown')).rejects.toThrow(/Key not found for kid/);
    });
  });

  describe('getHmacKey', () => {
    test('returns active HMAC key for matching kid', async () => {
      const svc = createService();
      const dek = crypto.randomBytes(32);
      const hmacKey = crypto.randomBytes(32);
      const kid = 'v1-abcd1234';

      svc._cache.set('User', {
        dek,
        hmacKey,
        activeKid: kid,
        expiresAt: Date.now() + 60000,
        allKeys: new Map([[kid, { dek, hmacKey }]])
      });

      const result = await svc.getHmacKey('User', kid);
      expect(result).toBe(hmacKey);
    });

    test('throws for unknown kid', async () => {
      const svc = createService();

      svc._cache.set('User', {
        dek: crypto.randomBytes(32),
        hmacKey: crypto.randomBytes(32),
        activeKid: 'v1-abcd1234',
        expiresAt: Date.now() + 60000,
        allKeys: new Map()
      });

      await expect(svc.getHmacKey('User', 'v99-unknown')).rejects.toThrow(/Key not found for kid/);
    });
  });
});

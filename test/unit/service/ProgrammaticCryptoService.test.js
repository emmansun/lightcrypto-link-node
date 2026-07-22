'use strict';

const crypto = require('crypto');
const ProgrammaticCryptoService = require('../../../src/service/ProgrammaticCryptoService');
const { DecryptionError } = require('../../../src/service/FieldCryptoService');

const NS_USER_PHONE = 'User#phone';
const CANONICAL_NS = 'default.default.User#phone';

describe('ProgrammaticCryptoService', () => {
  let dek;
  let activeKid;
  let mockKeyVaultService;

  beforeEach(() => {
    dek = crypto.randomBytes(32);
    activeKid = 'v1-abcd1234';

    mockKeyVaultService = {
      ensureVaultInitialized: jest.fn().mockResolvedValue(undefined),
      getActiveDekVersion: jest.fn().mockResolvedValue(1),
      getActiveKid: jest.fn().mockResolvedValue(activeKid),
      getDek: jest.fn().mockResolvedValue(dek),
      getDekByVersion: jest.fn().mockResolvedValue(dek),
      getActiveHmacKey: jest.fn().mockResolvedValue(crypto.randomBytes(32))
    };
  });

  // ─── Constructor ─────────────────────────────────────────────────────────
  describe('constructor', () => {
    test('throws if keyVaultService is not provided', () => {
      expect(() => new ProgrammaticCryptoService({})).toThrow(/keyVaultService/);
    });

    test('throws if no options argument is provided', () => {
      expect(() => new ProgrammaticCryptoService()).toThrow(/keyVaultService/);
    });

    test('creates instance with default algorithm AES_256_GCM', () => {
      const svc = new ProgrammaticCryptoService({ keyVaultService: mockKeyVaultService });
      expect(svc._algorithm).toBe('AES_256_GCM');
    });

    test('creates instance with custom algorithm', () => {
      const svc = new ProgrammaticCryptoService({
        keyVaultService: mockKeyVaultService,
        algorithm: 'AES_256_CBC'
      });
      expect(svc._algorithm).toBe('AES_256_CBC');
    });

    test('creates instance with injected fieldCryptoService', () => {
      const mockFieldCrypto = { encryptField: jest.fn(), decryptField: jest.fn() };
      const svc = new ProgrammaticCryptoService({
        keyVaultService: mockKeyVaultService,
        fieldCryptoService: mockFieldCrypto
      });
      expect(svc._fieldCryptoService).toBe(mockFieldCrypto);
    });
  });

  // ─── encryptValue ─────────────────────────────────────────────────────────
  describe('encryptValue', () => {
    let svc;
    beforeEach(() => {
      svc = new ProgrammaticCryptoService({ keyVaultService: mockKeyVaultService });
    });

    test('encrypts a string value with correct markers', async () => {
      const result = await svc.encryptValue('13800138000', NS_USER_PHONE);
      expect(result._e).toBe(1);
      expect(result._t).toBe('STR');
      expect(typeof result.c).toBe('string');
      // No _k, _a, _entity fields (aligned with Java)
      expect(result._k).toBeUndefined();
      expect(result._a).toBeUndefined();
      expect(result._entity).toBeUndefined();
    });

    test('encrypts a number value with INT type marker', async () => {
      const result = await svc.encryptValue(42, NS_USER_PHONE);
      expect(result._t).toBe('INT');
    });

    test('encrypts a boolean value with BOOL type marker', async () => {
      const result = await svc.encryptValue(true, NS_USER_PHONE);
      expect(result._t).toBe('BOOL');
    });

    test('encrypts a double value with DOUBLE type marker', async () => {
      const result = await svc.encryptValue(3.14, NS_USER_PHONE);
      expect(result._t).toBe('DOUBLE');
    });

    test('uses custom algorithm when provided', async () => {
      const result = await svc.encryptValue('secret', NS_USER_PHONE, 'SM4_CBC');
      // Algorithm is encoded in Wire Format blob, not stored as _a
      expect(typeof result.c).toBe('string');
    });

    test('returns null for null value', async () => {
      const result = await svc.encryptValue(null, NS_USER_PHONE);
      expect(result).toBeNull();
    });

    test('returns undefined for undefined value', async () => {
      const result = await svc.encryptValue(undefined, NS_USER_PHONE);
      expect(result).toBeUndefined();
    });

    test('throws for missing namespace', async () => {
      await expect(svc.encryptValue('data')).rejects.toThrow(/namespace/i);
    });

    test('throws for empty string namespace', async () => {
      await expect(svc.encryptValue('data', '')).rejects.toThrow(/namespace/i);
    });

    test('throws for unsupported algorithm', async () => {
      await expect(svc.encryptValue('data', NS_USER_PHONE, 'UNKNOWN_ALGO')).rejects.toThrow(/Unsupported algorithm/);
    });

    test('calls ensureVaultInitialized with canonical namespace', async () => {
      await svc.encryptValue('data', NS_USER_PHONE);
      expect(mockKeyVaultService.ensureVaultInitialized).toHaveBeenCalledWith(CANONICAL_NS);
    });

    test('calls getActiveDekVersion and getDek', async () => {
      await svc.encryptValue('data', NS_USER_PHONE);
      expect(mockKeyVaultService.getActiveDekVersion).toHaveBeenCalledWith(CANONICAL_NS);
      expect(mockKeyVaultService.getDek).toHaveBeenCalledWith(activeKid);
    });
  });

  // ─── decryptValue ─────────────────────────────────────────────────────────
  describe('decryptValue', () => {
    let svc;
    beforeEach(() => {
      svc = new ProgrammaticCryptoService({ keyVaultService: mockKeyVaultService });
    });

    test('round-trip: encrypt then decrypt returns original string', async () => {
      const original = '13800138000';
      const subDoc = await svc.encryptValue(original, NS_USER_PHONE);
      const decrypted = await svc.decryptValue(subDoc);
      expect(decrypted).toBe(original);
    });

    test('round-trip: encrypt then decrypt returns original number', async () => {
      const original = 42;
      const subDoc = await svc.encryptValue(original, NS_USER_PHONE);
      const decrypted = await svc.decryptValue(subDoc);
      expect(decrypted).toBe(original);
    });

    test('round-trip: encrypt then decrypt returns original boolean', async () => {
      const original = true;
      const subDoc = await svc.encryptValue(original, NS_USER_PHONE);
      const decrypted = await svc.decryptValue(subDoc);
      expect(decrypted).toBe(true);
    });

    test('round-trip with custom algorithm SM4_CBC', async () => {
      const subDoc = await svc.encryptValue('sm4-test', NS_USER_PHONE, 'SM4_CBC');
      const decrypted = await svc.decryptValue(subDoc);
      expect(decrypted).toBe('sm4-test');
    });

    test('returns null for null sub-document', async () => {
      const result = await svc.decryptValue(null);
      expect(result).toBeNull();
    });

    test('returns undefined for undefined sub-document', async () => {
      const result = await svc.decryptValue(undefined);
      expect(result).toBeUndefined();
    });

    test('throws for missing _e marker', async () => {
      const subDoc = { _t: 'STR', c: 'test' };
      await expect(svc.decryptValue(subDoc)).rejects.toThrow(/_e/);
    });

    test('throws for missing _t marker', async () => {
      const subDoc = { _e: 1, c: 'test' };
      await expect(svc.decryptValue(subDoc)).rejects.toThrow(/_t/);
    });

    test('throws when ciphertext is missing', async () => {
      const subDoc = { _e: 1, _t: 'STR' };
      await expect(svc.decryptValue(subDoc)).rejects.toThrow(/[Cc]iphertext|Missing/);
    });

    test('decryptValue extracts namespace from Wire Format blob', async () => {
      const subDoc = await svc.encryptValue('test', NS_USER_PHONE);
      await svc.decryptValue(subDoc);
      // getDekByVersion should be called with the canonical namespace from the blob
      expect(mockKeyVaultService.getDekByVersion).toHaveBeenCalledWith(CANONICAL_NS, 1);
    });
  });

  // ─── decryptDocument ──────────────────────────────────────────────────────
  describe('decryptDocument', () => {
    let svc;
    beforeEach(() => {
      svc = new ProgrammaticCryptoService({ keyVaultService: mockKeyVaultService });
    });

    test('decrypts multiple encrypted fields in a document', async () => {
      const phoneSubDoc = await svc.encryptValue('13800138000', NS_USER_PHONE);
      const ssnSubDoc = await svc.encryptValue('123-45-6789', 'User#ssn');

      const doc = { _id: 'abc', phone: phoneSubDoc, ssn: ssnSubDoc };
      const result = await svc.decryptDocument(doc, 'User', ['phone', 'ssn']);

      expect(result.phone).toBe('13800138000');
      expect(result.ssn).toBe('123-45-6789');
    });

    test('skips non-encrypted fields (plain values remain unchanged)', async () => {
      const phoneSubDoc = await svc.encryptValue('13800138000', NS_USER_PHONE);

      const doc = { _id: 'abc', name: 'John', phone: phoneSubDoc };
      const result = await svc.decryptDocument(doc, 'User', ['phone']);

      expect(result.name).toBe('John');
      expect(result.phone).toBe('13800138000');
    });

    test('skips fields not present in document without error', async () => {
      const doc = { _id: 'abc' };
      const result = await svc.decryptDocument(doc, 'User', ['phone']);
      expect(result).toEqual({ _id: 'abc' });
    });

    test('returns the same object reference (mutates in-place)', async () => {
      const phoneSubDoc = await svc.encryptValue('13800138000', NS_USER_PHONE);
      const doc = { _id: 'abc', phone: phoneSubDoc };

      const result = await svc.decryptDocument(doc, 'User', ['phone']);
      expect(result).toBe(doc);
    });

    test('handles null document gracefully', async () => {
      const result = await svc.decryptDocument(null, 'User', ['phone']);
      expect(result).toBeNull();
    });

    test('throws when entityName is missing', async () => {
      await expect(svc.decryptDocument({}, null, ['phone'])).rejects.toThrow(/entityName/i);
    });

    test('throws when encryptedFields is not an array', async () => {
      await expect(svc.decryptDocument({}, 'User', 'phone')).rejects.toThrow(/encryptedFields/);
    });
  });

  // ─── Error handling ──────────────────────────────────────────────────────
  describe('error handling', () => {
    test('wrong DEK causes decryption failure', async () => {
      const svc = new ProgrammaticCryptoService({ keyVaultService: mockKeyVaultService });
      const subDoc = await svc.encryptValue('secret-data', NS_USER_PHONE);

      // Create a second service with a different DEK
      const differentDek = crypto.randomBytes(32);
      const mockKvs2 = {
        ...mockKeyVaultService,
        getDekByVersion: jest.fn().mockResolvedValue(differentDek)
      };
      const svc2 = new ProgrammaticCryptoService({ keyVaultService: mockKvs2 });

      await expect(svc2.decryptValue(subDoc)).rejects.toThrow();
    });
  });
});

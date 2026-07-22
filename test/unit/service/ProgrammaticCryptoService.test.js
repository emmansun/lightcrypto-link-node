'use strict';

const crypto = require('crypto');
const ProgrammaticCryptoService = require('../../../src/service/ProgrammaticCryptoService');
const { DecryptionError } = require('../../../src/service/FieldCryptoService');

describe('ProgrammaticCryptoService', () => {
  let dek;
  let hmacKey;
  let activeKid;
  let mockKeyVaultService;

  beforeEach(() => {
    dek = crypto.randomBytes(32);
    hmacKey = crypto.randomBytes(32);
    activeKid = 'v1-abcd1234';

    mockKeyVaultService = {
      ensureVaultInitialized: jest.fn().mockResolvedValue({
        dek,
        hmacKey,
        activeKid
      }),
      getDek: jest.fn().mockResolvedValue(dek),
      getHmacKey: jest.fn().mockResolvedValue(hmacKey),
      getActiveKid: jest.fn().mockResolvedValue(activeKid)
    };
  });

  // ─── 2.1 Constructor validation ────────────────────────────────────────────
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

  // ─── 2.2 encryptValue ──────────────────────────────────────────────────────
  describe('encryptValue', () => {
    let svc;
    beforeEach(() => {
      svc = new ProgrammaticCryptoService({ keyVaultService: mockKeyVaultService });
    });

    test('encrypts a string value with correct markers', async () => {
      const result = await svc.encryptValue('13800138000', 'User');
      expect(result._e).toBe(1);
      expect(result._k).toBe(activeKid);
      expect(result._a).toBe('AES_256_GCM');
      expect(result._t).toBe('STR');
      expect(typeof result.c).toBe('string');
      expect(result._entity).toBe('User');
    });

    test('encrypts a number value with INT type marker', async () => {
      const result = await svc.encryptValue(42, 'User');
      expect(result._t).toBe('INT');
    });

    test('encrypts a boolean value with BOOL type marker', async () => {
      const result = await svc.encryptValue(true, 'User');
      expect(result._t).toBe('BOOL');
    });

    test('encrypts a double value with DOUBLE type marker', async () => {
      const result = await svc.encryptValue(3.14, 'User');
      expect(result._t).toBe('DOUBLE');
    });

    test('uses custom algorithm when provided', async () => {
      const result = await svc.encryptValue('secret', 'User', 'SM4_CBC');
      expect(result._a).toBe('SM4_CBC');
    });

    test('returns null for null value', async () => {
      const result = await svc.encryptValue(null, 'User');
      expect(result).toBeNull();
    });

    test('returns undefined for undefined value', async () => {
      const result = await svc.encryptValue(undefined, 'User');
      expect(result).toBeUndefined();
    });

    test('throws for missing entityName', async () => {
      await expect(svc.encryptValue('data')).rejects.toThrow(/entityName/i);
    });

    test('throws for empty string entityName', async () => {
      await expect(svc.encryptValue('data', '')).rejects.toThrow(/entityName/i);
    });

    test('throws for unsupported algorithm', async () => {
      await expect(svc.encryptValue('data', 'User', 'UNKNOWN_ALGO')).rejects.toThrow(/Unsupported algorithm/);
    });

    test('calls ensureVaultInitialized with correct entityName', async () => {
      await svc.encryptValue('data', 'Order');
      expect(mockKeyVaultService.ensureVaultInitialized).toHaveBeenCalledWith('Order');
    });
  });

  // ─── 2.3 decryptValue ──────────────────────────────────────────────────────
  describe('decryptValue', () => {
    let svc;
    beforeEach(() => {
      svc = new ProgrammaticCryptoService({ keyVaultService: mockKeyVaultService });
    });

    test('round-trip: encrypt then decrypt returns original string', async () => {
      const original = '13800138000';
      const subDoc = await svc.encryptValue(original, 'User');
      const decrypted = await svc.decryptValue(subDoc);
      expect(decrypted).toBe(original);
    });

    test('round-trip: encrypt then decrypt returns original number', async () => {
      const original = 42;
      const subDoc = await svc.encryptValue(original, 'User');
      const decrypted = await svc.decryptValue(subDoc);
      expect(decrypted).toBe(original);
    });

    test('round-trip: encrypt then decrypt returns original boolean', async () => {
      const original = true;
      const subDoc = await svc.encryptValue(original, 'User');
      const decrypted = await svc.decryptValue(subDoc);
      expect(decrypted).toBe(true);
    });

    test('round-trip with explicit entityName parameter', async () => {
      const subDoc = await svc.encryptValue('hello', 'User');
      const decrypted = await svc.decryptValue(subDoc, 'User');
      expect(decrypted).toBe('hello');
    });

    test('round-trip with custom algorithm SM4_CBC', async () => {
      const subDoc = await svc.encryptValue('sm4-test', 'User', 'SM4_CBC');
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
      const subDoc = { _k: 'v1-abcd1234', _t: 'STR', c: Buffer.from('test') };
      await expect(svc.decryptValue(subDoc)).rejects.toThrow(/_e/);
    });

    test('throws for missing _k marker', async () => {
      const subDoc = { _e: 1, _t: 'STR', c: Buffer.from('test') };
      await expect(svc.decryptValue(subDoc)).rejects.toThrow(/_k/);
    });

    test('throws for missing _t marker', async () => {
      const subDoc = { _e: 1, _k: 'v1-abcd1234', c: Buffer.from('test') };
      await expect(svc.decryptValue(subDoc)).rejects.toThrow(/_t/);
    });

    test('throws when entityName is not available (no param, no _entity)', async () => {
      const subDoc = { _e: 1, _k: 'v1-abcd1234', _a: 'AES_256_GCM', _t: 'STR', c: Buffer.from('test') };
      await expect(svc.decryptValue(subDoc)).rejects.toThrow(/entityName/i);
    });
  });

  // ─── 2.4 decryptDocument ───────────────────────────────────────────────────
  describe('decryptDocument', () => {
    let svc;
    beforeEach(() => {
      svc = new ProgrammaticCryptoService({ keyVaultService: mockKeyVaultService });
    });

    test('decrypts multiple encrypted fields in a document', async () => {
      const phoneSubDoc = await svc.encryptValue('13800138000', 'User');
      const ssnSubDoc = await svc.encryptValue('123-45-6789', 'User');

      const doc = { _id: 'abc', phone: phoneSubDoc, ssn: ssnSubDoc };
      const result = await svc.decryptDocument(doc, 'User', ['phone', 'ssn']);

      expect(result.phone).toBe('13800138000');
      expect(result.ssn).toBe('123-45-6789');
    });

    test('skips non-encrypted fields (plain values remain unchanged)', async () => {
      const phoneSubDoc = await svc.encryptValue('13800138000', 'User');

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
      const phoneSubDoc = await svc.encryptValue('13800138000', 'User');
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

  // ─── 2.5 Error handling ────────────────────────────────────────────────────
  describe('error handling', () => {
    let svc;
    beforeEach(() => {
      svc = new ProgrammaticCryptoService({ keyVaultService: mockKeyVaultService });
    });

    test('wrong entity DEK causes decryption failure (KCV/key mismatch)', async () => {
      // Encrypt with the default DEK
      const subDoc = await svc.encryptValue('secret-data', 'User');

      // Create a second service with a different DEK for a different entity
      const differentDek = crypto.randomBytes(32);
      const mockKvs2 = {
        ...mockKeyVaultService,
        getDek: jest.fn().mockResolvedValue(differentDek)
      };
      const svc2 = new ProgrammaticCryptoService({ keyVaultService: mockKvs2 });

      // Attempt to decrypt with wrong DEK — should fail
      await expect(svc2.decryptValue(subDoc, 'Order')).rejects.toThrow();
    });

    test('unsupported algorithm in sub-document throws DecryptionError', async () => {
      // Use legacy Buffer format so that _a is actually consulted for algorithm selection
      const subDoc = { _e: 1, _k: activeKid, _a: 'UNKNOWN_ALGO_XYZ', _t: 'STR', c: Buffer.from('test') };

      await expect(svc.decryptValue(subDoc, 'User')).rejects.toThrow(/Unsupported algorithm/);
    });
  });
});

'use strict';

const crypto = require('crypto');
const { FieldCryptoService, FatalCryptoError, DecryptionError } = require('../../../src/service/FieldCryptoService');

describe('FieldCryptoService', () => {
  let service;
  let dek;
  let hmacKey;
  let activeKid;

  beforeEach(() => {
    service = new FieldCryptoService();
    dek = crypto.randomBytes(32);
    hmacKey = crypto.randomBytes(32);
    activeKid = 'v1-a3b2c1d4';
  });

  describe('encryptField', () => {
    test('returns null for null input', () => {
      expect(service.encryptField(null, 'phone', dek, hmacKey, activeKid, 'AES_256_GCM')).toBeNull();
    });

    test('returns undefined for undefined input', () => {
      expect(service.encryptField(undefined, 'phone', dek, hmacKey, activeKid, 'AES_256_GCM')).toBeUndefined();
    });

    test('produces valid sub-document with all required fields', () => {
      const subDoc = service.encryptField('13800138000', 'phone', dek, hmacKey, activeKid, 'AES_256_GCM');
      expect(subDoc._e).toBe(1);
      expect(subDoc._k).toBe(activeKid);
      expect(subDoc._a).toBe('AES_256_GCM');
      expect(subDoc._t).toBe('STR');
      expect(typeof subDoc.c).toBe('string');
    });

    test('sub-document does not include blind index by default', () => {
      const subDoc = service.encryptField('test', 'phone', dek, hmacKey, activeKid, 'AES_256_GCM');
      expect(subDoc.b).toBeUndefined();
    });

    test('sub-document includes blind index when enabled', () => {
      const subDoc = service.encryptField('test', 'phone', dek, hmacKey, activeKid, 'AES_256_GCM', { blindIndex: true });
      expect(typeof subDoc.b).toBe('string');
      expect(subDoc.b.length).toBe(43);
    });

    test('works with AES_256_CBC', () => {
      const subDoc = service.encryptField('test', 'field', dek, hmacKey, activeKid, 'AES_256_CBC');
      expect(subDoc._a).toBe('AES_256_CBC');
    });

    test('works with SM4_CBC', () => {
      const dek16 = crypto.randomBytes(16);
      const subDoc = service.encryptField('test', 'field', dek16, hmacKey, activeKid, 'SM4_CBC');
      expect(subDoc._a).toBe('SM4_CBC');
    });

    test('Number type marker', () => {
      // Value-based detection: integer 42 → 'INT' (mongooseType 'Number' is ignored for precise detection)
      const subDoc = service.encryptField(42, 'age', dek, hmacKey, activeKid, 'AES_256_GCM', { mongooseType: 'Number' });
      expect(subDoc._t).toBe('INT');
    });

    test('Double type marker', () => {
      const subDoc = service.encryptField(3.14, 'score', dek, hmacKey, activeKid, 'AES_256_GCM', { mongooseType: 'Number' });
      expect(subDoc._t).toBe('DOUBLE');
    });

    test('Boolean type marker', () => {
      const subDoc = service.encryptField(true, 'active', dek, hmacKey, activeKid, 'AES_256_GCM', { mongooseType: 'Boolean' });
      expect(subDoc._t).toBe('BOOL');
    });
  });

  describe('decryptField', () => {
    test('round-trip: encrypt then decrypt returns original value', () => {
      const original = '13800138000';
      const subDoc = service.encryptField(original, 'phone', dek, hmacKey, activeKid, 'AES_256_GCM');
      const decrypted = service.decryptField(subDoc, dek, hmacKey, 'AES_256_GCM');
      expect(decrypted).toBe(original);
    });

    test('round-trip with blind index', () => {
      const original = 'hello@example.com';
      const subDoc = service.encryptField(original, 'email', dek, hmacKey, activeKid, 'AES_256_GCM', { blindIndex: true });
      const decrypted = service.decryptField(subDoc, dek, hmacKey, 'AES_256_GCM');
      expect(decrypted).toBe(original);
    });

    test('returns non-encrypted objects as-is', () => {
      const obj = { name: 'John', age: 30 };
      expect(service.decryptField(obj, dek, hmacKey, 'AES_256_GCM')).toEqual(obj);
    });

    test('throws DecryptionError for invalid ciphertext', () => {
      const subDoc = { _e: 1, _a: 'AES_256_GCM', _t: 'STR', c: Buffer.from('test') };
      expect(() => service.decryptField(subDoc, dek, hmacKey, 'AES_256_GCM')).toThrow(DecryptionError);
    });

    test('throws DecryptionError for unsupported algorithm', () => {
      const subDoc = { _e: 1, _k: activeKid, _a: 'UNKNOWN_ALGO', _t: 'STR', c: Buffer.from('test') };
      expect(() => service.decryptField(subDoc, dek, hmacKey, 'AES_256_GCM')).toThrow(DecryptionError);
    });

    test('round-trip with all algorithms', () => {
      const dek16 = crypto.randomBytes(16);
      const algorithms = [
        { algo: 'AES_256_GCM', key: dek },
        { algo: 'AES_256_CBC', key: dek },
        { algo: 'SM4_CBC', key: dek16 }
      ];

      for (const { algo, key } of algorithms) {
        const original = `test-${algo}`;
        const subDoc = service.encryptField(original, 'field', key, hmacKey, activeKid, algo);
        const decrypted = service.decryptField(subDoc, key, hmacKey, algo);
        expect(decrypted).toBe(original);
      }
    });

    test('blind index is deterministic', () => {
      const subDoc1 = service.encryptField('13800138000', 'phone', dek, hmacKey, activeKid, 'AES_256_GCM', { blindIndex: true });
      const subDoc2 = service.encryptField('13800138000', 'phone', dek, hmacKey, activeKid, 'AES_256_GCM', { blindIndex: true });
      expect(subDoc1.b).toBe(subDoc2.b);
    });

    test('BYTES: encrypt Buffer returns raw bytes on decrypt (matches Java serialize(byte[]))', () => {
      const rawBytes = Buffer.from([0x00, 0xff, 0x01, 0xfe, 0x80, 0x7f]);
      const subDoc = service.encryptField(rawBytes, 'data', dek, hmacKey, activeKid, 'AES_256_GCM');
      expect(subDoc._t).toBe('BYTES');
      const decrypted = service.decryptField(subDoc, dek, hmacKey, 'AES_256_GCM');
      expect(Buffer.isBuffer(decrypted)).toBe(true);
      expect(decrypted.equals(rawBytes)).toBe(true);
    });

    test('BYTES: plaintext is raw bytes, not base64-encoded UTF-8', () => {
      // Verify the ciphertext, when decrypted, yields the original bytes
      // (not the UTF-8 bytes of the base64 string representation)
      const rawBytes = crypto.randomBytes(20);
      const subDoc = service.encryptField(rawBytes, 'blob', dek, hmacKey, activeKid, 'AES_256_GCM');
      // Decrypt to raw plaintext bytes
      const cipherBuf = subDoc.c;
      const plaintextBytes = service._codec.decrypt(dek, cipherBuf, 'AES_256_GCM');
      // Must equal original bytes, NOT Buffer.from(base64string, 'utf8')
      expect(plaintextBytes.equals(rawBytes)).toBe(true);
      expect(plaintextBytes.equals(Buffer.from(rawBytes.toString('base64'), 'utf8'))).toBe(false);
    });
  });

  describe('structured type: DOC', () => {
    test('encrypt plain object produces _t: DOC with no b field', () => {
      const obj = { city: 'Shanghai', street: '123 Main' };
      const subDoc = service.encryptField(obj, 'address', dek, hmacKey, activeKid, 'AES_256_GCM', { structuredType: 'DOC' });
      expect(subDoc._e).toBe(1);
      expect(subDoc._k).toBe(activeKid);
      expect(subDoc._a).toBe('AES_256_GCM');
      expect(subDoc._t).toBe('DOC');
      expect(typeof subDoc.c).toBe('string');
      expect(subDoc.b).toBeUndefined();
    });

    test('encrypt then decrypt DOC round-trip', () => {
      const obj = { city: 'Shanghai', street: '123 Main' };
      const subDoc = service.encryptField(obj, 'address', dek, hmacKey, activeKid, 'AES_256_GCM', { structuredType: 'DOC' });
      const decrypted = service.decryptField(subDoc, dek, hmacKey, 'AES_256_GCM');
      expect(decrypted).toEqual(obj);
    });

    test('encrypt nested object as DOC', () => {
      const obj = { address: { city: 'Shanghai' }, tags: ['a', 'b'] };
      const subDoc = service.encryptField(obj, 'profile', dek, hmacKey, activeKid, 'AES_256_GCM', { structuredType: 'DOC' });
      const decrypted = service.decryptField(subDoc, dek, hmacKey, 'AES_256_GCM');
      expect(decrypted).toEqual(obj);
    });

    test('blind index is skipped for DOC even when requested', () => {
      const obj = { x: 1 };
      const subDoc = service.encryptField(obj, 'data', dek, hmacKey, activeKid, 'AES_256_GCM', { structuredType: 'DOC', blindIndex: true });
      expect(subDoc.b).toBeUndefined();
    });

    test('handles Mongoose SubDocument-like objects with toObject()', () => {
      const fakeSubDoc = { toObject: () => ({ name: 'Alice', age: 30 }) };
      const subDoc = service.encryptField(fakeSubDoc, 'profile', dek, hmacKey, activeKid, 'AES_256_GCM', { structuredType: 'DOC' });
      const decrypted = service.decryptField(subDoc, dek, hmacKey, 'AES_256_GCM');
      expect(decrypted).toEqual({ name: 'Alice', age: 30 });
    });
  });

  describe('structured type: COL', () => {
    test('encrypt array produces _t: COL with no b field', () => {
      const arr = ['tag1', 'tag2', 'tag3'];
      const subDoc = service.encryptField(arr, 'tags', dek, hmacKey, activeKid, 'AES_256_GCM', { structuredType: 'COL' });
      expect(subDoc._e).toBe(1);
      expect(subDoc._t).toBe('COL');
      expect(typeof subDoc.c).toBe('string');
      expect(subDoc.b).toBeUndefined();
    });

    test('encrypt then decrypt COL round-trip', () => {
      const arr = ['tag1', 'tag2', 'tag3'];
      const subDoc = service.encryptField(arr, 'tags', dek, hmacKey, activeKid, 'AES_256_GCM', { structuredType: 'COL' });
      const decrypted = service.decryptField(subDoc, dek, hmacKey, 'AES_256_GCM');
      expect(decrypted).toEqual(arr);
    });

    test('encrypt array of objects as COL', () => {
      const arr = [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 2 }];
      const subDoc = service.encryptField(arr, 'items', dek, hmacKey, activeKid, 'AES_256_GCM', { structuredType: 'COL' });
      const decrypted = service.decryptField(subDoc, dek, hmacKey, 'AES_256_GCM');
      expect(decrypted).toEqual(arr);
    });
  });

  describe('structured type: MAP', () => {
    test('decrypt MAP sub-document returns plain object', () => {
      const obj = { key1: 'val1', key2: 'val2' };
      // Encrypt as DOC then decrypt as MAP (same BSON encoding)
      const subDoc = service.encryptField(obj, 'data', dek, hmacKey, activeKid, 'AES_256_GCM', { structuredType: 'DOC' });
      subDoc._t = 'MAP'; // Override type marker to MAP
      const decrypted = service.decryptField(subDoc, dek, hmacKey, 'AES_256_GCM');
      expect(decrypted).toEqual(obj);
    });
  });
});

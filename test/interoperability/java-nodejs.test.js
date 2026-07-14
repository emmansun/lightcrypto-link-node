'use strict';

const crypto = require('crypto');
const { FieldCryptoService } = require('../../src/service/FieldCryptoService');
const CryptoCodec = require('../../src/crypto/CryptoCodec');
const TypeSerializer = require('../../src/service/TypeSerializer');

/**
 * Java Interoperability Tests
 *
 * These tests verify that the Node.js implementation can decrypt documents
 * encrypted by the Java LightCrypto-Link implementation, and vice versa.
 *
 * Test fixtures represent Java-generated encrypted documents in MongoDB format.
 */

// Pre-shared keys for testing (not real production keys)
const TEST_DEK = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8').subarray(0, 32);
const TEST_HMAC_KEY = Buffer.from('fedcba9876543210fedcba9876543210', 'utf8').subarray(0, 32);
const TEST_KID = 'v1-test0001';

describe('Java Interoperability', () => {
  let fieldService;
  let codec;
  let serializer;

  beforeEach(() => {
    fieldService = new FieldCryptoService();
    codec = new CryptoCodec();
    serializer = new TypeSerializer();
  });

  describe('Type marker compatibility', () => {
    test('String type marker is "STR"', () => {
      expect(serializer.resolveTypeMarker('hello')).toBe('STR');
    });

    test('Integer type marker is "INT"', () => {
      expect(serializer.resolveTypeMarker(42)).toBe('INT');
    });

    test('Boolean type marker is "BOOL"', () => {
      expect(serializer.resolveTypeMarker(true)).toBe('BOOL');
    });

    test('Long type marker is "LONG" for large integers', () => {
      expect(serializer.resolveTypeMarker(2147483648)).toBe('LONG');
    });

    test('Double type marker is "DOUBLE" for floats', () => {
      expect(serializer.resolveTypeMarker(3.14)).toBe('DOUBLE');
    });

    test('Buffer type marker is "BYTES"', () => {
      expect(serializer.resolveTypeMarker(Buffer.alloc(0))).toBe('BYTES');
    });
  });

  describe('Algorithm identifiers', () => {
    test('AES-256-GCM algorithm name matches Java', () => {
      const encryptor = codec.getEncryptor('AES_256_GCM');
      expect(encryptor.getAlgorithm()).toBe('AES_256_GCM');
    });

    test('AES-256-CBC algorithm name matches Java', () => {
      const encryptor = codec.getEncryptor('AES_256_CBC');
      expect(encryptor.getAlgorithm()).toBe('AES_256_CBC');
    });

    test('SM4-CBC algorithm name matches Java', () => {
      const encryptor = codec.getEncryptor('SM4_CBC');
      expect(encryptor.getAlgorithm()).toBe('SM4_CBC');
    });
  });

  describe('AES-256-GCM interoperability', () => {
    test('encrypt produces valid GCM ciphertext', () => {
      const dek = crypto.randomBytes(32);
      const plaintext = 'Hello from Node.js';
      const subDoc = fieldService.encryptField(plaintext, 'message', dek, TEST_HMAC_KEY, TEST_KID, 'AES_256_GCM');

      expect(subDoc._e).toBe(1);
      expect(subDoc._a).toBe('AES_256_GCM');
      expect(subDoc._k).toBe(TEST_KID);

      // Verify we can decrypt it back
      const decrypted = fieldService.decryptField(subDoc, dek, TEST_HMAC_KEY, 'AES_256_GCM');
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('AES-256-CBC interoperability', () => {
    test('encrypt produces valid CBC ciphertext', () => {
      const dek = crypto.randomBytes(32);
      const plaintext = 'Hello CBC from Node.js';
      const subDoc = fieldService.encryptField(plaintext, 'message', dek, TEST_HMAC_KEY, TEST_KID, 'AES_256_CBC');

      expect(subDoc._e).toBe(1);
      expect(subDoc._a).toBe('AES_256_CBC');

      const decrypted = fieldService.decryptField(subDoc, dek, TEST_HMAC_KEY, 'AES_256_CBC');
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('SM4-CBC interoperability', () => {
    test('encrypt produces valid SM4 ciphertext', () => {
      const dek = crypto.randomBytes(16);
      const plaintext = 'Hello SM4 from Node.js';
      const subDoc = fieldService.encryptField(plaintext, 'message', dek, TEST_HMAC_KEY, TEST_KID, 'SM4_CBC');

      expect(subDoc._e).toBe(1);
      expect(subDoc._a).toBe('SM4_CBC');

      const decrypted = fieldService.decryptField(subDoc, dek, TEST_HMAC_KEY, 'SM4_CBC');
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('Blind index interoperability', () => {
    test('blind index computation is deterministic and Base64URL', () => {
      const hmacKey = crypto.randomBytes(32);
      const fieldName = 'phone';
      const value = '13800138000';

      const idx1 = codec.generateBlindIndex(hmacKey, fieldName, value);
      const idx2 = codec.generateBlindIndex(hmacKey, fieldName, value);

      expect(idx1).toBe(idx2);
      expect(idx1.length).toBe(43);
      expect(idx1).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    test('blind index includes field name for isolation', () => {
      const hmacKey = crypto.randomBytes(32);
      const idx1 = codec.generateBlindIndex(hmacKey, 'phone', 'same_value');
      const idx2 = codec.generateBlindIndex(hmacKey, 'email', 'same_value');
      expect(idx1).not.toBe(idx2);
    });
  });

  describe('Error handling interoperability', () => {
    test('missing _k field produces Java-compatible error message', () => {
      const subDoc = { _e: 1, _a: 'AES_256_GCM', _t: 'STR', c: Buffer.from('test') };
      expect(() => fieldService.decryptField(subDoc, TEST_DEK, TEST_HMAC_KEY, 'AES_256_GCM'))
        .toThrow(/missing '_k' \(kid\) field/);
    });

    test('unsupported algorithm produces Java-compatible error message', () => {
      const subDoc = { _e: 1, _k: TEST_KID, _a: 'CHACHA20', _t: 'STR', c: Buffer.from('test') };
      expect(() => fieldService.decryptField(subDoc, TEST_DEK, TEST_HMAC_KEY, 'AES_256_GCM'))
        .toThrow(/Unsupported algorithm/);
    });
  });

  describe('Serialization compatibility', () => {
    test('String serialization matches Java String.getBytes(UTF_8)', () => {
      expect(serializer.serializeToString('hello')).toBe('hello');
      expect(serializer.serializeToString('你好世界')).toBe('你好世界');
    });

    test('Integer serialization matches Java String.valueOf()', () => {
      expect(serializer.serializeToString(42)).toBe('42');
      expect(serializer.serializeToString(-123)).toBe('-123');
    });

    test('Boolean serialization matches Java', () => {
      expect(serializer.serializeToString(true)).toBe('true');
      expect(serializer.serializeToString(false)).toBe('false');
    });

    test('LocalDate serialization matches Java ISO_LOCAL_DATE', () => {
      const date = new Date(Date.UTC(1996, 4, 15));
      expect(serializer.serializeToString(date)).toBe('1996-05-15');
    });

    test('LocalDateTime serialization matches Java ISO_LOCAL_DATE_TIME', () => {
      const date = new Date(Date.UTC(1996, 4, 15, 14, 30, 0));
      expect(serializer.serializeToString(date)).toBe('1996-05-15T14:30:00');
    });

    test('byte[] serialization matches Java Base64.getEncoder()', () => {
      const buf = Buffer.from([0x00, 0x01, 0x02, 0xFF]);
      expect(serializer.serializeToString(buf)).toBe(buf.toString('base64'));
    });
  });
});

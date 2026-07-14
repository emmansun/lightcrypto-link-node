'use strict';

const crypto = require('crypto');
const CryptoCodec = require('../../../src/crypto/CryptoCodec');

describe('CryptoCodec', () => {
  let codec;
  let dek32;
  let dek16;

  beforeEach(() => {
    codec = new CryptoCodec();
    dek32 = crypto.randomBytes(32);
    dek16 = crypto.randomBytes(16);
  });

  describe('encrypt/decrypt', () => {
    test('AES_256_GCM round-trip', () => {
      const plaintext = Buffer.from('GCM test', 'utf8');
      const encrypted = codec.encrypt(dek32, plaintext, 'AES_256_GCM');
      const decrypted = codec.decrypt(dek32, encrypted, 'AES_256_GCM');
      expect(decrypted.toString('utf8')).toBe('GCM test');
    });

    test('AES_256_CBC round-trip', () => {
      const plaintext = Buffer.from('CBC test', 'utf8');
      const encrypted = codec.encrypt(dek32, plaintext, 'AES_256_CBC');
      const decrypted = codec.decrypt(dek32, encrypted, 'AES_256_CBC');
      expect(decrypted.toString('utf8')).toBe('CBC test');
    });

    test('SM4_CBC round-trip', () => {
      const plaintext = Buffer.from('SM4 test', 'utf8');
      const encrypted = codec.encrypt(dek16, plaintext, 'SM4_CBC');
      const decrypted = codec.decrypt(dek16, encrypted, 'SM4_CBC');
      expect(decrypted.toString('utf8')).toBe('SM4 test');
    });

    test('unsupported algorithm throws', () => {
      expect(() => codec.encrypt(dek32, Buffer.from('x'), 'UNKNOWN')).toThrow('Unsupported algorithm');
    });
  });

  describe('computeKcv', () => {
    test('returns consistent KCV for same key', () => {
      const kcv1 = codec.computeKcv(dek32, 'AES_256_GCM');
      const kcv2 = codec.computeKcv(dek32, 'AES_256_GCM');
      expect(kcv1).toBe(kcv2);
    });

    test('different algorithms produce different KCVs for same key', () => {
      const gcmKcv = codec.computeKcv(dek32, 'AES_256_GCM');
      const cbcKcv = codec.computeKcv(dek32, 'AES_256_CBC');
      expect(gcmKcv).not.toBe(cbcKcv);
    });
  });

  describe('generateBlindIndex', () => {
    const hmacKey = crypto.randomBytes(32);

    test('deterministic: same input produces same output', () => {
      const idx1 = codec.generateBlindIndex(hmacKey, 'phone', '13800138000');
      const idx2 = codec.generateBlindIndex(hmacKey, 'phone', '13800138000');
      expect(idx1).toBe(idx2);
    });

    test('different values produce different indexes', () => {
      const idx1 = codec.generateBlindIndex(hmacKey, 'phone', '13800138000');
      const idx2 = codec.generateBlindIndex(hmacKey, 'phone', '13800138001');
      expect(idx1).not.toBe(idx2);
    });

    test('different field names produce different indexes', () => {
      const idx1 = codec.generateBlindIndex(hmacKey, 'phone', 'same_value');
      const idx2 = codec.generateBlindIndex(hmacKey, 'email', 'same_value');
      expect(idx1).not.toBe(idx2);
    });

    test('output is Base64URL encoded (43 chars for SHA-256)', () => {
      const idx = codec.generateBlindIndex(hmacKey, 'phone', '13800138000');
      expect(idx.length).toBe(43);
      expect(idx).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('computeBinding', () => {
    const hmacKey = crypto.randomBytes(32);

    test('returns consistent binding for same inputs', () => {
      const b1 = codec.computeBinding(hmacKey, dek32);
      const b2 = codec.computeBinding(hmacKey, dek32);
      expect(b1).toBe(b2);
    });

    test('returns lowercase hex string', () => {
      const binding = codec.computeBinding(hmacKey, dek32);
      expect(binding).toMatch(/^[0-9a-f]{64}$/);
    });

    test('different DEKs produce different bindings', () => {
      const dek2 = crypto.randomBytes(32);
      const b1 = codec.computeBinding(hmacKey, dek32);
      const b2 = codec.computeBinding(hmacKey, dek2);
      expect(b1).not.toBe(b2);
    });
  });
});

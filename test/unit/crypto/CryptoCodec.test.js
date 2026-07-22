'use strict';

const crypto = require('crypto');
const CryptoCodec = require('../../../src/crypto/CryptoCodec');
const Namespace = require('../../../src/namespace/Namespace');

describe('CryptoCodec', () => {
  let codec;
  let dek32;
  let dek16;
  let ns;

  beforeEach(() => {
    codec = new CryptoCodec();
    dek32 = crypto.randomBytes(32);
    dek16 = crypto.randomBytes(16);
    ns = Namespace.parse('User#phone');
  });

  describe('encrypt/decrypt', () => {
    test('AES_256_GCM round-trip returns Base64URL string', () => {
      const plaintext = Buffer.from('GCM test', 'utf8');
      const encrypted = codec.encrypt(dek32, plaintext, 'AES_256_GCM', ns, 1);
      expect(typeof encrypted).toBe('string');
      const decrypted = codec.decrypt(dek32, encrypted);
      expect(decrypted.toString('utf8')).toBe('GCM test');
    });

    test('AES_256_CBC round-trip', () => {
      const plaintext = Buffer.from('CBC test', 'utf8');
      const encrypted = codec.encrypt(dek32, plaintext, 'AES_256_CBC', ns, 1);
      expect(typeof encrypted).toBe('string');
      const decrypted = codec.decrypt(dek32, encrypted);
      expect(decrypted.toString('utf8')).toBe('CBC test');
    });

    test('SM4_CBC round-trip', () => {
      const plaintext = Buffer.from('SM4 test', 'utf8');
      const encrypted = codec.encrypt(dek16, plaintext, 'SM4_CBC', ns, 1);
      const decrypted = codec.decrypt(dek16, encrypted);
      expect(decrypted.toString('utf8')).toBe('SM4 test');
    });

    test('unsupported algorithm throws', () => {
      expect(() => codec.encrypt(dek32, Buffer.from('x'), 'UNKNOWN', ns, 1)).toThrow('Unsupported algorithm');
    });

    test('SM4_CBC with 32-byte DEK uses DEK[0:16]', () => {
      const key32 = Buffer.alloc(32, 0);
      key32.fill(0xaa, 0, 16);
      key32.fill(0xbb, 16, 32);
      const key16 = key32.subarray(0, 16);

      const plaintext = Buffer.from('interop test', 'utf8');
      const encrypted = codec.encrypt(key32, plaintext, 'SM4_CBC', ns, 1);
      const decrypted = codec.decrypt(key16, encrypted);
      expect(decrypted.toString('utf8')).toBe('interop test');
    });

    test('decrypt extracts algorithm from Wire Format header', () => {
      const plaintext = Buffer.from('auto-detect', 'utf8');
      const encrypted = codec.encrypt(dek32, plaintext, 'AES_256_CBC', ns, 1);
      // Decrypt without explicit algorithm — uses header
      const decrypted = codec.decrypt(dek32, encrypted);
      expect(decrypted.toString('utf8')).toBe('auto-detect');
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
    const nsPhone = Namespace.parse('User#phone');
    const nsEmail = Namespace.parse('User#email');

    test('deterministic: same input produces same output', () => {
      const idx1 = codec.generateBlindIndex(hmacKey, nsPhone, 'phone', '13800138000');
      const idx2 = codec.generateBlindIndex(hmacKey, nsPhone, 'phone', '13800138000');
      expect(idx1).toBe(idx2);
    });

    test('different values produce different indexes', () => {
      const idx1 = codec.generateBlindIndex(hmacKey, nsPhone, 'phone', '13800138000');
      const idx2 = codec.generateBlindIndex(hmacKey, nsPhone, 'phone', '13800138001');
      expect(idx1).not.toBe(idx2);
    });

    test('different namespaces produce different indexes', () => {
      const idx1 = codec.generateBlindIndex(hmacKey, nsPhone, 'phone', 'same_value');
      const idx2 = codec.generateBlindIndex(hmacKey, nsEmail, 'phone', 'same_value');
      expect(idx1).not.toBe(idx2);
    });

    test('output is Base64URL encoded (43 chars for SHA-256)', () => {
      const idx = codec.generateBlindIndex(hmacKey, nsPhone, 'phone', '13800138000');
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

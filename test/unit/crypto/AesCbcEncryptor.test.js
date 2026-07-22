'use strict';

const crypto = require('crypto');
const AesCbcEncryptor = require('../../../src/crypto/AesCbcEncryptor');

describe('AesCbcEncryptor', () => {
  let encryptor;
  let key;

  beforeEach(() => {
    encryptor = new AesCbcEncryptor();
    key = crypto.randomBytes(32);
  });

  test('getAlgorithm returns AES_256_CBC', () => {
    expect(encryptor.getAlgorithm()).toBe('AES_256_CBC');
  });

  test('algorithmId returns correct entry', () => {
    const algId = encryptor.algorithmId();
    expect(algId.id).toBe(0x02);
    expect(algId.ivLength).toBe(16);
    expect(algId.isGcm).toBe(false);
  });

  test('encrypt/decrypt round-trip with external IV', () => {
    const plaintext = Buffer.from('Hello, CBC!', 'utf8');
    const iv = crypto.randomBytes(16);
    const ciphertext = encryptor.encrypt(key, iv, plaintext);
    const decrypted = encryptor.decrypt(key, iv, ciphertext);
    expect(decrypted.toString('utf8')).toBe('Hello, CBC!');
  });

  test('encrypt returns PKCS5-padded ciphertext only (no IV)', () => {
    const plaintext = Buffer.from('test', 'utf8'); // 4 bytes → 16 padded
    const iv = crypto.randomBytes(16);
    const ciphertext = encryptor.encrypt(key, iv, plaintext);
    expect(ciphertext.length).toBe(16); // padded to 16 bytes
  });

  test('padded ciphertext length is multiple of 16', () => {
    const plaintext = Buffer.from('a'.repeat(17), 'utf8');
    const iv = crypto.randomBytes(16);
    const ciphertext = encryptor.encrypt(key, iv, plaintext);
    expect(ciphertext.length % 16).toBe(0);
    expect(ciphertext.length).toBe(32); // 17 → 32 with PKCS5
  });

  test('encrypt is deterministic with same IV', () => {
    const plaintext = Buffer.from('same', 'utf8');
    const iv = Buffer.alloc(16, 0xAA);
    const ct1 = encryptor.encrypt(key, iv, plaintext);
    const ct2 = encryptor.encrypt(key, iv, plaintext);
    expect(ct1.equals(ct2)).toBe(true);
  });

  test('decrypt with wrong key produces different plaintext or throws', () => {
    const plaintext = Buffer.from('secret', 'utf8');
    const iv = crypto.randomBytes(16);
    const ciphertext = encryptor.encrypt(key, iv, plaintext);
    const wrongKey = crypto.randomBytes(32);
    try {
      const decrypted = encryptor.decrypt(wrongKey, iv, ciphertext);
      expect(decrypted.toString('utf8')).not.toBe('secret');
    } catch (_e) {
      // Padding error is also acceptable
    }
  });

  test('computeKcv returns consistent hex string', () => {
    const kcv1 = encryptor.computeKcv(key);
    const kcv2 = encryptor.computeKcv(key);
    expect(kcv1).toBe(kcv2);
    expect(kcv1).toMatch(/^[0-9a-f]+$/);
  });
});

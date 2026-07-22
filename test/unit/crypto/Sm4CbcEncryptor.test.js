'use strict';

const crypto = require('crypto');
const Sm4CbcEncryptor = require('../../../src/crypto/Sm4CbcEncryptor');

describe('Sm4CbcEncryptor', () => {
  let encryptor;
  let key;

  beforeEach(() => {
    encryptor = new Sm4CbcEncryptor();
    key = crypto.randomBytes(16);
  });

  test('getAlgorithm returns SM4_CBC', () => {
    expect(encryptor.getAlgorithm()).toBe('SM4_CBC');
  });

  test('algorithmId returns correct entry', () => {
    const algId = encryptor.algorithmId();
    expect(algId.id).toBe(0x04);
    expect(algId.ivLength).toBe(16);
    expect(algId.keyLength).toBe(16);
    expect(algId.isGcm).toBe(false);
  });

  test('encrypt/decrypt round-trip with external IV', () => {
    const plaintext = Buffer.from('Hello, SM4!', 'utf8');
    const iv = crypto.randomBytes(16);
    const ciphertext = encryptor.encrypt(key, iv, plaintext);
    const decrypted = encryptor.decrypt(key, iv, ciphertext);
    expect(decrypted.toString('utf8')).toBe('Hello, SM4!');
  });

  test('encrypt returns PKCS5-padded ciphertext only (no IV)', () => {
    const plaintext = Buffer.from('test', 'utf8');
    const iv = crypto.randomBytes(16);
    const ciphertext = encryptor.encrypt(key, iv, plaintext);
    expect(ciphertext.length).toBe(16); // 4 bytes → 16 padded
  });

  test('encrypt is deterministic with same IV', () => {
    const plaintext = Buffer.from('same', 'utf8');
    const iv = Buffer.alloc(16, 0xBB);
    const ct1 = encryptor.encrypt(key, iv, plaintext);
    const ct2 = encryptor.encrypt(key, iv, plaintext);
    expect(ct1.equals(ct2)).toBe(true);
  });

  test('decrypt fails with wrong key', () => {
    const plaintext = Buffer.from('secret', 'utf8');
    const iv = crypto.randomBytes(16);
    const ciphertext = encryptor.encrypt(key, iv, plaintext);
    const wrongKey = crypto.randomBytes(16);
    expect(() => encryptor.decrypt(wrongKey, iv, ciphertext)).toThrow();
  });

  test('computeKcv returns consistent hex string', () => {
    const kcv1 = encryptor.computeKcv(key);
    const kcv2 = encryptor.computeKcv(key);
    expect(kcv1).toBe(kcv2);
    expect(kcv1).toMatch(/^[0-9a-f]+$/);
  });
});

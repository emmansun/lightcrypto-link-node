'use strict';

const crypto = require('crypto');
const AesGcmEncryptor = require('../../../src/crypto/AesGcmEncryptor');

describe('AesGcmEncryptor', () => {
  let encryptor;
  let key;

  beforeEach(() => {
    encryptor = new AesGcmEncryptor();
    key = crypto.randomBytes(32);
  });

  test('getAlgorithm returns AES_256_GCM', () => {
    expect(encryptor.getAlgorithm()).toBe('AES_256_GCM');
  });

  test('algorithmId returns correct entry', () => {
    const algId = encryptor.algorithmId();
    expect(algId.id).toBe(0x01);
    expect(algId.ivLength).toBe(12);
    expect(algId.isGcm).toBe(true);
  });

  test('encrypt/decrypt round-trip with external IV', () => {
    const plaintext = Buffer.from('Hello, World!', 'utf8');
    const iv = crypto.randomBytes(12);
    const ciphertext = encryptor.encrypt(key, iv, plaintext);
    const decrypted = encryptor.decrypt(key, iv, ciphertext);
    expect(decrypted.toString('utf8')).toBe('Hello, World!');
  });

  test('encrypt returns CT‖Tag only (no IV)', () => {
    const plaintext = Buffer.from('test data', 'utf8');
    const iv = crypto.randomBytes(12);
    const ciphertext = encryptor.encrypt(key, iv, plaintext);
    // CT length = plaintext.length + 16 (auth tag)
    expect(ciphertext.length).toBe(plaintext.length + 16);
  });

  test('encrypt with AAD binds ciphertext to AAD', () => {
    const plaintext = Buffer.from('secret', 'utf8');
    const iv = crypto.randomBytes(12);
    const aad = Buffer.from('my-aad');
    const ciphertext = encryptor.encrypt(key, iv, plaintext, aad);
    // Decrypt with same AAD succeeds
    const decrypted = encryptor.decrypt(key, iv, ciphertext, aad);
    expect(decrypted.toString('utf8')).toBe('secret');
    // Decrypt with wrong AAD fails
    expect(() => encryptor.decrypt(key, iv, ciphertext, Buffer.from('wrong-aad'))).toThrow();
  });

  test('decrypt fails with wrong key', () => {
    const plaintext = Buffer.from('secret', 'utf8');
    const iv = crypto.randomBytes(12);
    const ciphertext = encryptor.encrypt(key, iv, plaintext);
    const wrongKey = crypto.randomBytes(32);
    expect(() => encryptor.decrypt(wrongKey, iv, ciphertext)).toThrow();
  });

  test('decrypt fails with tampered ciphertext', () => {
    const plaintext = Buffer.from('secret', 'utf8');
    const iv = crypto.randomBytes(12);
    const ciphertext = encryptor.encrypt(key, iv, plaintext);
    ciphertext[0] ^= 0xff;
    expect(() => encryptor.decrypt(key, iv, ciphertext)).toThrow();
  });

  test('computeKcv returns consistent hex string', () => {
    const kcv1 = encryptor.computeKcv(key);
    const kcv2 = encryptor.computeKcv(key);
    expect(kcv1).toBe(kcv2);
    expect(kcv1).toMatch(/^[0-9a-f]+$/);
  });

  test('computeKcv returns 32 bytes = 64 hex chars', () => {
    const kcv = encryptor.computeKcv(key);
    expect(kcv.length).toBe(64);
  });

  test('encrypt/decrypt with empty plaintext', () => {
    const iv = crypto.randomBytes(12);
    const plaintext = Buffer.alloc(0);
    const ciphertext = encryptor.encrypt(key, iv, plaintext);
    const decrypted = encryptor.decrypt(key, iv, ciphertext);
    expect(decrypted.length).toBe(0);
  });

  test('encrypt/decrypt with large plaintext', () => {
    const iv = crypto.randomBytes(12);
    const plaintext = crypto.randomBytes(10000);
    const ciphertext = encryptor.encrypt(key, iv, plaintext);
    const decrypted = encryptor.decrypt(key, iv, ciphertext);
    expect(decrypted.equals(plaintext)).toBe(true);
  });
});

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

  test('encrypt/decrypt round-trip', () => {
    const plaintext = Buffer.from('Hello, World!', 'utf8');
    const encrypted = encryptor.encrypt(key, plaintext);
    const decrypted = encryptor.decrypt(key, encrypted);
    expect(decrypted.toString('utf8')).toBe('Hello, World!');
  });

  test('encrypt output format: [IV (12B)] || [ciphertext] || [Auth Tag (16B)]', () => {
    const plaintext = Buffer.from('test data', 'utf8');
    const encrypted = encryptor.encrypt(key, plaintext);
    // Minimum size: 12 (IV) + 0 (empty) + 16 (tag) = 28 bytes for empty plaintext
    expect(encrypted.length).toBeGreaterThanOrEqual(28);
    // IV is 12 bytes, Auth Tag is 16 bytes, ciphertext is same length as plaintext
    expect(encrypted.length).toBe(12 + plaintext.length + 16);
  });

  test('encrypt produces different ciphertext each time (random IV)', () => {
    const plaintext = Buffer.from('same data', 'utf8');
    const enc1 = encryptor.encrypt(key, plaintext);
    const enc2 = encryptor.encrypt(key, plaintext);
    expect(enc1.equals(enc2)).toBe(false);
  });

  test('decrypt fails with wrong key', () => {
    const plaintext = Buffer.from('secret', 'utf8');
    const encrypted = encryptor.encrypt(key, plaintext);
    const wrongKey = crypto.randomBytes(32);
    expect(() => encryptor.decrypt(wrongKey, encrypted)).toThrow();
  });

  test('decrypt fails with tampered ciphertext', () => {
    const plaintext = Buffer.from('secret', 'utf8');
    const encrypted = encryptor.encrypt(key, plaintext);
    // Tamper with ciphertext (not IV or tag)
    encrypted[15] ^= 0xff;
    expect(() => encryptor.decrypt(key, encrypted)).toThrow();
  });

  test('computeKcv returns consistent hex string', () => {
    const kcv1 = encryptor.computeKcv(key);
    const kcv2 = encryptor.computeKcv(key);
    expect(kcv1).toBe(kcv2);
    expect(kcv1).toMatch(/^[0-9a-f]+$/);
  });

  test('computeKcv returns different values for different keys', () => {
    const key2 = crypto.randomBytes(32);
    const kcv1 = encryptor.computeKcv(key);
    const kcv2 = encryptor.computeKcv(key2);
    expect(kcv1).not.toBe(kcv2);
  });

  test('encrypt/decrypt with empty plaintext', () => {
    const plaintext = Buffer.alloc(0);
    const encrypted = encryptor.encrypt(key, plaintext);
    const decrypted = encryptor.decrypt(key, encrypted);
    expect(decrypted.length).toBe(0);
  });

  test('encrypt/decrypt with large plaintext', () => {
    const plaintext = crypto.randomBytes(10000);
    const encrypted = encryptor.encrypt(key, plaintext);
    const decrypted = encryptor.decrypt(key, encrypted);
    expect(decrypted.equals(plaintext)).toBe(true);
  });
});

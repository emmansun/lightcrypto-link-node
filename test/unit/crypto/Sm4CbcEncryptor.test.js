'use strict';

const crypto = require('crypto');
const Sm4CbcEncryptor = require('../../../src/crypto/Sm4CbcEncryptor');

describe('Sm4CbcEncryptor', () => {
  let encryptor;
  let key;

  beforeEach(() => {
    encryptor = new Sm4CbcEncryptor();
    key = crypto.randomBytes(16); // SM4 uses 16-byte key
  });

  test('getAlgorithm returns SM4_CBC', () => {
    expect(encryptor.getAlgorithm()).toBe('SM4_CBC');
  });

  test('encrypt/decrypt round-trip', () => {
    const plaintext = Buffer.from('Hello, SM4!', 'utf8');
    const encrypted = encryptor.encrypt(key, plaintext);
    const decrypted = encryptor.decrypt(key, encrypted);
    expect(decrypted.toString('utf8')).toBe('Hello, SM4!');
  });

  test('encrypt output format: [IV (16B)] || [padded ciphertext]', () => {
    const plaintext = Buffer.from('test', 'utf8');
    const encrypted = encryptor.encrypt(key, plaintext);
    // 16 (IV) + 16 (padded) = 32
    expect(encrypted.length).toBe(32);
  });

  test('encrypt produces different ciphertext each time', () => {
    const plaintext = Buffer.from('same', 'utf8');
    const enc1 = encryptor.encrypt(key, plaintext);
    const enc2 = encryptor.encrypt(key, plaintext);
    expect(enc1.equals(enc2)).toBe(false);
  });

  test('decrypt fails with wrong key', () => {
    const plaintext = Buffer.from('secret', 'utf8');
    const encrypted = encryptor.encrypt(key, plaintext);
    const wrongKey = crypto.randomBytes(16);
    expect(() => encryptor.decrypt(wrongKey, encrypted)).toThrow();
  });

  test('computeKcv returns consistent hex string', () => {
    const kcv1 = encryptor.computeKcv(key);
    const kcv2 = encryptor.computeKcv(key);
    expect(kcv1).toBe(kcv2);
    expect(kcv1).toMatch(/^[0-9a-f]+$/);
  });
});

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

  test('encrypt/decrypt round-trip', () => {
    const plaintext = Buffer.from('Hello, CBC!', 'utf8');
    const encrypted = encryptor.encrypt(key, plaintext);
    const decrypted = encryptor.decrypt(key, encrypted);
    expect(decrypted.toString('utf8')).toBe('Hello, CBC!');
  });

  test('encrypt output format: [IV (16B)] || [padded ciphertext]', () => {
    const plaintext = Buffer.from('test', 'utf8'); // 4 bytes
    const encrypted = encryptor.encrypt(key, plaintext);
    // With PKCS5 padding: 4 bytes → 16 bytes padded
    // Total: 16 (IV) + 16 (padded) = 32
    expect(encrypted.length).toBe(16 + 16);
  });

  test('padded ciphertext length is multiple of 16', () => {
    const plaintext = Buffer.from('a'.repeat(17), 'utf8'); // 17 bytes → 32 padded
    const encrypted = encryptor.encrypt(key, plaintext);
    const ciphertextLength = encrypted.length - 16; // minus IV
    expect(ciphertextLength % 16).toBe(0);
  });

  test('encrypt produces different ciphertext each time', () => {
    const plaintext = Buffer.from('same', 'utf8');
    const enc1 = encryptor.encrypt(key, plaintext);
    const enc2 = encryptor.encrypt(key, plaintext);
    expect(enc1.equals(enc2)).toBe(false);
  });

  test('decrypt with wrong key produces different plaintext', () => {
    const plaintext = Buffer.from('secret', 'utf8');
    const encrypted = encryptor.encrypt(key, plaintext);
    const wrongKey = crypto.randomBytes(32);
    // AES-CBC is not authenticated — wrong key may produce garbage or throw on padding
    try {
      const decrypted = encryptor.decrypt(wrongKey, encrypted);
      expect(decrypted.toString('utf8')).not.toBe('secret');
    } catch (_e) {
      // Padding error is also acceptable — wrong key can cause invalid padding
    }
  });

  test('computeKcv returns consistent hex string', () => {
    const kcv1 = encryptor.computeKcv(key);
    const kcv2 = encryptor.computeKcv(key);
    expect(kcv1).toBe(kcv2);
    expect(kcv1).toMatch(/^[0-9a-f]+$/);
  });
});

'use strict';

const crypto = require('crypto');
const SymmetricEncryptor = require('./SymmetricEncryptor');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * AES-256-GCM encryptor with 12-byte IV and GCM authentication tag.
 * Output format: [IV (12B)] || [ciphertext] || [Auth Tag (16B)]
 */
class AesGcmEncryptor extends SymmetricEncryptor {
  getAlgorithm() {
    return 'AES_256_GCM';
  }

  /**
   * @param {Buffer} key - 32-byte encryption key
   * @param {Buffer} plaintext - Data to encrypt
   * @returns {Buffer} [IV (12B)] || [ciphertext] || [Auth Tag (16B)]
   * @throws {Error} If key length is not 32 bytes
   */
  encrypt(key, plaintext) {
    if (!Buffer.isBuffer(key) || key.length !== KEY_LENGTH) {
      throw new Error(
        `Invalid key: AES-256-GCM requires a ${KEY_LENGTH}-byte key, got ${key ? key.length : 0} bytes`
      );
    }
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, encrypted, authTag]);
  }

  /**
   * @param {Buffer} key - 32-byte decryption key
   * @param {Buffer} data - [IV (12B)] || [ciphertext] || [Auth Tag (16B)]
   * @returns {Buffer} Decrypted plaintext
   * @throws {Error} If data is too short to contain IV and Auth Tag
   */
  decrypt(key, data) {
    const minLength = IV_LENGTH + AUTH_TAG_LENGTH;
    if (!Buffer.isBuffer(data) || data.length < minLength) {
      throw new Error(
        `Invalid ciphertext: expected at least ${minLength} bytes, got ${data ? data.length : 0}`
      );
    }

    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(data.length - AUTH_TAG_LENGTH);
    const ciphertext = data.subarray(IV_LENGTH, data.length - AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /**
   * Compute KCV using 12-byte zero IV and 16-byte zero block.
   * Returns 32 bytes (16 ciphertext + 16 auth tag) as hex, matching Java.
   * @param {Buffer} key - The key to verify
   * @returns {string} Lowercase hex string (64 chars = 32 bytes)
   */
  computeKcv(key) {
    const iv = Buffer.alloc(IV_LENGTH, 0);
    const zeroBlock = Buffer.alloc(16, 0);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(zeroBlock), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([encrypted, authTag]).toString('hex');
  }
}

module.exports = AesGcmEncryptor;

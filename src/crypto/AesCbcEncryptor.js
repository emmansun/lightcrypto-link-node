'use strict';

const crypto = require('crypto');
const SymmetricEncryptor = require('./SymmetricEncryptor');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * AES-256-CBC encryptor with 16-byte IV and PKCS5 padding.
 * Output format: [IV (16B)] || [PKCS5-padded ciphertext]
 */
class AesCbcEncryptor extends SymmetricEncryptor {
  getAlgorithm() {
    return 'AES_256_CBC';
  }

  /**
   * @param {Buffer} key - 32-byte encryption key
   * @param {Buffer} plaintext - Data to encrypt
   * @returns {Buffer} [IV (16B)] || [PKCS5-padded ciphertext]
   * @throws {Error} If key length is not 32 bytes
   */
  encrypt(key, plaintext) {
    if (!Buffer.isBuffer(key) || key.length !== KEY_LENGTH) {
      throw new Error(
        `Invalid key: AES-256-CBC requires a ${KEY_LENGTH}-byte key, got ${key ? key.length : 0} bytes`
      );
    }
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([iv, encrypted]);
  }

  /**
   * @param {Buffer} key - 32-byte decryption key
   * @param {Buffer} data - [IV (16B)] || [PKCS5-padded ciphertext]
   * @returns {Buffer} Decrypted plaintext
   * @throws {Error} If data is too short or ciphertext is not a multiple of 16 bytes
   */
  decrypt(key, data) {
    if (!Buffer.isBuffer(data) || data.length <= IV_LENGTH) {
      throw new Error(
        `Invalid ciphertext: expected more than ${IV_LENGTH} bytes, got ${data ? data.length : 0}`
      );
    }
    const ciphertext = data.subarray(IV_LENGTH);
    if (ciphertext.length === 0 || ciphertext.length % 16 !== 0) {
      throw new Error(
        `Invalid ciphertext: length must be a multiple of 16 bytes, got ${ciphertext.length}`
      );
    }

    const iv = data.subarray(0, IV_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /**
   * Compute KCV using 16-byte zero IV and 16-byte zero block.
   * @param {Buffer} key - The key to verify
   * @returns {string} Lowercase hex string
   */
  computeKcv(key) {
    const iv = Buffer.alloc(IV_LENGTH, 0);
    const zeroBlock = Buffer.alloc(16, 0);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(zeroBlock), cipher.final()]);
    return encrypted.toString('hex');
  }
}

module.exports = AesCbcEncryptor;

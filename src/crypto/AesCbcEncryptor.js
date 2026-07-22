'use strict';

const crypto = require('crypto');
const SymmetricEncryptor = require('./SymmetricEncryptor');
const { AlgorithmId } = require('../format/AlgorithmId');

const ALGORITHM = 'aes-256-cbc';

/**
 * AES-256-CBC encryptor with external IV.
 * Returns PKCS5-padded ciphertext only (IV is managed externally).
 * AAD parameter is ignored (CBC does not use AAD).
 */
class AesCbcEncryptor extends SymmetricEncryptor {
  algorithmId() {
    return AlgorithmId.AES_256_CBC;
  }

  /**
   * @param {Buffer} key - 32-byte encryption key
   * @param {Buffer} iv - 16-byte initialization vector (generated externally)
   * @param {Buffer} plaintext - Data to encrypt
   * @param {Buffer} [aad] - Ignored for CBC mode
   * @returns {Buffer} PKCS5-padded ciphertext (no IV)
   */
  encrypt(key, iv, plaintext, aad) {
    if (!Buffer.isBuffer(key) || key.length !== AlgorithmId.AES_256_CBC.keyLength) {
      throw new Error(
        `Invalid key: AES-256-CBC requires a ${AlgorithmId.AES_256_CBC.keyLength}-byte key, got ${key ? key.length : 0} bytes`
      );
    }
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    return Buffer.concat([cipher.update(plaintext), cipher.final()]);
  }

  /**
   * @param {Buffer} key - 32-byte decryption key
   * @param {Buffer} iv - 16-byte initialization vector
   * @param {Buffer} ciphertext - PKCS5-padded ciphertext
   * @param {Buffer} [aad] - Ignored for CBC mode
   * @returns {Buffer} Decrypted plaintext
   */
  decrypt(key, iv, ciphertext, aad) {
    if (ciphertext.length === 0 || ciphertext.length % 16 !== 0) {
      throw new Error(
        `Invalid ciphertext: length must be a multiple of 16 bytes, got ${ciphertext.length}`
      );
    }
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /**
   * Compute KCV using 16-byte zero IV and 16-byte zero block.
   * @param {Buffer} key - The key to verify
   * @returns {string} Lowercase hex string
   */
  computeKcv(key) {
    const iv = Buffer.alloc(AlgorithmId.AES_256_CBC.ivLength, 0);
    const zeroBlock = Buffer.alloc(16, 0);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(zeroBlock), cipher.final()]);
    return encrypted.toString('hex');
  }
}

module.exports = AesCbcEncryptor;

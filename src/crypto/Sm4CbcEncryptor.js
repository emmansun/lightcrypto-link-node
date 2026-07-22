'use strict';

const crypto = require('crypto');
const SymmetricEncryptor = require('./SymmetricEncryptor');
const { AlgorithmId } = require('../format/AlgorithmId');

const ALGORITHM = 'sm4-cbc';

/**
 * SM4-CBC encryptor with external IV, 16-byte key, and PKCS5 padding.
 * Returns PKCS5-padded ciphertext only (IV is managed externally).
 * AAD parameter is ignored (CBC does not use AAD).
 */
class Sm4CbcEncryptor extends SymmetricEncryptor {
  algorithmId() {
    return AlgorithmId.SM4_CBC;
  }

  /**
   * @param {Buffer} key - 16-byte SM4 encryption key
   * @param {Buffer} iv - 16-byte initialization vector (generated externally)
   * @param {Buffer} plaintext - Data to encrypt
   * @param {Buffer} [aad] - Ignored for CBC mode
   * @returns {Buffer} PKCS5-padded ciphertext (no IV)
   */
  encrypt(key, iv, plaintext, aad) {
    if (!Buffer.isBuffer(key) || key.length !== AlgorithmId.SM4_CBC.keyLength) {
      throw new Error(
        `Invalid key: SM4 requires a ${AlgorithmId.SM4_CBC.keyLength}-byte key, got ${key ? key.length : 0} bytes`
      );
    }
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    return Buffer.concat([cipher.update(plaintext), cipher.final()]);
  }

  /**
   * @param {Buffer} key - 16-byte SM4 decryption key
   * @param {Buffer} iv - 16-byte initialization vector
   * @param {Buffer} ciphertext - PKCS5-padded ciphertext
   * @param {Buffer} [aad] - Ignored for CBC mode
   * @returns {Buffer} Decrypted plaintext
   */
  decrypt(key, iv, ciphertext, aad) {
    if (!Buffer.isBuffer(key) || key.length !== AlgorithmId.SM4_CBC.keyLength) {
      throw new Error(
        `Invalid key: SM4 requires a ${AlgorithmId.SM4_CBC.keyLength}-byte key, got ${key ? key.length : 0} bytes`
      );
    }
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
   * @param {Buffer} key - 16-byte SM4 key
   * @returns {string} Lowercase hex string
   */
  computeKcv(key) {
    const iv = Buffer.alloc(AlgorithmId.SM4_CBC.ivLength, 0);
    const zeroBlock = Buffer.alloc(16, 0);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(zeroBlock), cipher.final()]);
    return encrypted.toString('hex');
  }
}

module.exports = Sm4CbcEncryptor;

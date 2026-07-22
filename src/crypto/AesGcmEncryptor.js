'use strict';

const crypto = require('crypto');
const SymmetricEncryptor = require('./SymmetricEncryptor');
const { AlgorithmId } = require('../format/AlgorithmId');

const ALGORITHM = 'aes-256-gcm';
const AUTH_TAG_LENGTH = 16;

/**
 * AES-256-GCM encryptor with external IV and AAD support.
 * Returns ciphertext‖tag only (IV is managed externally).
 */
class AesGcmEncryptor extends SymmetricEncryptor {
  algorithmId() {
    return AlgorithmId.AES_256_GCM;
  }

  /**
   * @param {Buffer} key - 32-byte encryption key
   * @param {Buffer} iv - 12-byte initialization vector (generated externally)
   * @param {Buffer} plaintext - Data to encrypt
   * @param {Buffer} [aad] - Additional Authenticated Data
   * @returns {Buffer} ciphertext‖AuthTag (no IV)
   */
  encrypt(key, iv, plaintext, aad) {
    if (!Buffer.isBuffer(key) || key.length !== AlgorithmId.AES_256_GCM.keyLength) {
      throw new Error(
        `Invalid key: AES-256-GCM requires a ${AlgorithmId.AES_256_GCM.keyLength}-byte key, got ${key ? key.length : 0} bytes`
      );
    }
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    if (aad) {
      cipher.setAAD(aad);
    }
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([encrypted, authTag]);
  }

  /**
   * @param {Buffer} key - 32-byte decryption key
   * @param {Buffer} iv - 12-byte initialization vector
   * @param {Buffer} ciphertext - ciphertext‖AuthTag
   * @param {Buffer} [aad] - Additional Authenticated Data
   * @returns {Buffer} Decrypted plaintext
   */
  decrypt(key, iv, ciphertext, aad) {
    if (ciphertext.length < AUTH_TAG_LENGTH) {
      throw new Error(
        `Invalid ciphertext: expected at least ${AUTH_TAG_LENGTH} bytes for auth tag, got ${ciphertext.length}`
      );
    }

    const authTag = ciphertext.subarray(ciphertext.length - AUTH_TAG_LENGTH);
    const ct = ciphertext.subarray(0, ciphertext.length - AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    if (aad) {
      decipher.setAAD(aad);
    }
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }

  /**
   * Compute KCV using 12-byte zero IV and 16-byte zero block.
   * Returns 32 bytes (16 ciphertext + 16 auth tag) as hex.
   * @param {Buffer} key - The key to verify
   * @returns {string} Lowercase hex string (64 chars = 32 bytes)
   */
  computeKcv(key) {
    const iv = Buffer.alloc(AlgorithmId.AES_256_GCM.ivLength, 0);
    const zeroBlock = Buffer.alloc(16, 0);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(zeroBlock), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([encrypted, authTag]).toString('hex');
  }
}

module.exports = AesGcmEncryptor;

'use strict';

/**
 * Base class for symmetric encryption/decryption.
 * Subclasses must implement encrypt(), decrypt(), computeKcv(), and getAlgorithm().
 */
class SymmetricEncryptor {
  /**
   * @returns {string} The algorithm identifier (e.g., "AES_256_GCM")
   */
  getAlgorithm() {
    throw new Error('getAlgorithm() must be implemented by subclass');
  }

  /**
   * Encrypt plaintext with the given key.
   * @param {Buffer} key - The encryption key
   * @param {Buffer} plaintext - The data to encrypt
   * @returns {Buffer} The ciphertext in format [IV] || [ciphertext (+ tag for GCM)]
   */
  encrypt(key, plaintext) {
    throw new Error('encrypt() must be implemented by subclass');
  }

  /**
   * Decrypt ciphertext with the given key.
   * @param {Buffer} key - The decryption key
   * @param {Buffer} data - The ciphertext in format [IV] || [ciphertext (+ tag for GCM)]
   * @returns {Buffer} The decrypted plaintext
   */
  decrypt(key, data) {
    throw new Error('decrypt() must be implemented by subclass');
  }

  /**
   * Compute Key Check Value (KCV) for key integrity verification.
   * @param {Buffer} key - The key to verify
   * @returns {string} Lowercase hex string of the encrypted zero block
   */
  computeKcv(key) {
    throw new Error('computeKcv() must be implemented by subclass');
  }
}

module.exports = SymmetricEncryptor;

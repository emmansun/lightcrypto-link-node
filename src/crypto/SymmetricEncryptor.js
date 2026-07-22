'use strict';

/**
 * Base class for symmetric encryption/decryption.
 * Stateless, purely-functional interface matching Java SymmetricEncryptor.
 *
 * Subclasses must implement:
 *   encrypt(key, iv, plaintext, aad) → ciphertext
 *   decrypt(key, iv, ciphertext, aad) → plaintext
 *   computeKcv(key) → hex string
 *   algorithmId() → AlgorithmId entry
 */
class SymmetricEncryptor {
  /**
   * @returns {Object} AlgorithmId registry entry
   */
  algorithmId() {
    throw new Error('algorithmId() must be implemented by subclass');
  }

  /**
   * @returns {string} Algorithm name (e.g., "AES_256_GCM")
   */
  getAlgorithm() {
    return this.algorithmId().name;
  }

  /**
   * Encrypt plaintext with explicit IV and AAD.
   * @param {Buffer} key - The encryption key
   * @param {Buffer} iv - Initialization vector (generated externally)
   * @param {Buffer} plaintext - The data to encrypt
   * @param {Buffer} [aad] - Additional Authenticated Data (GCM only, ignored by CBC)
   * @returns {Buffer} Ciphertext only (GCM: CT‖Tag; CBC: PKCS5-padded CT). Does NOT include IV.
   */
  encrypt(key, iv, plaintext, aad) {
    throw new Error('encrypt() must be implemented by subclass');
  }

  /**
   * Decrypt ciphertext with explicit IV and AAD.
   * @param {Buffer} key - The decryption key
   * @param {Buffer} iv - Initialization vector
   * @param {Buffer} ciphertext - Ciphertext (GCM: CT‖Tag; CBC: PKCS5-padded CT)
   * @param {Buffer} [aad] - Additional Authenticated Data (GCM only, ignored by CBC)
   * @returns {Buffer} Decrypted plaintext
   */
  decrypt(key, iv, ciphertext, aad) {
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

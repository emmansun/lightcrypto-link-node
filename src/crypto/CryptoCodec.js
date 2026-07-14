'use strict';

const crypto = require('crypto');
const AesGcmEncryptor = require('./AesGcmEncryptor');
const AesCbcEncryptor = require('./AesCbcEncryptor');
const Sm4CbcEncryptor = require('./Sm4CbcEncryptor');

/**
 * Multi-algorithm cryptographic dispatch.
 * Provides encrypt/decrypt/computeKcv and HMAC-based blind index generation.
 */
class CryptoCodec {
  constructor() {
    this._encryptors = new Map();
    this._encryptors.set('AES_256_GCM', new AesGcmEncryptor());
    this._encryptors.set('AES_256_CBC', new AesCbcEncryptor());
    this._encryptors.set('SM4_CBC', new Sm4CbcEncryptor());
  }

  /**
   * Get encryptor instance for the given algorithm.
   * @param {string} algorithm - Algorithm identifier
   * @returns {SymmetricEncryptor}
   * @throws {Error} If algorithm is unsupported
   */
  getEncryptor(algorithm) {
    const encryptor = this._encryptors.get(algorithm);
    if (!encryptor) {
      throw new Error(`Unsupported algorithm: ${algorithm}`);
    }
    return encryptor;
  }

  /**
   * Encrypt data with the specified algorithm.
   * @param {Buffer} dek - Data encryption key
   * @param {Buffer} plaintext - Data to encrypt
   * @param {string} algorithm - Algorithm identifier
   * @returns {Buffer} Encrypted data
   */
  encrypt(dek, plaintext, algorithm) {
    const encryptor = this.getEncryptor(algorithm);
    const key = this._adaptKey(dek, algorithm);
    return encryptor.encrypt(key, plaintext);
  }

  /**
   * Decrypt data with the specified algorithm.
   * @param {Buffer} dek - Data encryption key
   * @param {Buffer} data - Encrypted data
   * @param {string} algorithm - Algorithm identifier
   * @returns {Buffer} Decrypted plaintext
   */
  decrypt(dek, data, algorithm) {
    const encryptor = this.getEncryptor(algorithm);
    const key = this._adaptKey(dek, algorithm);
    return encryptor.decrypt(key, data);
  }

  /**
   * Compute Key Check Value for key integrity verification.
   * @param {Buffer} key - The key to verify
   * @param {string} algorithm - Algorithm identifier
   * @returns {string} Lowercase hex KCV string
   */
  computeKcv(key, algorithm) {
    const encryptor = this.getEncryptor(algorithm);
    const adaptedKey = this._adaptKey(key, algorithm);
    return encryptor.computeKcv(adaptedKey);
  }

  /**
   * Adapt key length for the target algorithm.
   * SM4 requires 16-byte keys; AES-256 requires 32-byte keys.
   * If key is longer than needed, derive via SHA-256 truncation.
   * @param {Buffer} key
   * @param {string} algorithm
   * @returns {Buffer}
   * @private
   */
  _adaptKey(key, algorithm) {
    if (algorithm === 'SM4_CBC' && Buffer.isBuffer(key) && key.length === 32) {
      return crypto.createHash('sha256').update(key).digest().subarray(0, 16);
    }
    return key;
  }

  /**
   * Generate deterministic blind index for encrypted field queries.
   * HMAC-SHA-256(hmacKey, fieldName:serializedValue) → Base64URL (no padding)
   * @param {Buffer} hmacKey - HMAC key
   * @param {string} fieldName - Field name for isolation
   * @param {string} serializedValue - Serialized field value
   * @returns {string} Base64URL encoded blind index (43 chars for SHA-256)
   */
  generateBlindIndex(hmacKey, fieldName, serializedValue) {
    const input = `${fieldName}:${serializedValue}`;
    const hmac = crypto.createHmac('sha256', hmacKey);
    hmac.update(input, 'utf8');
    const digest = hmac.digest();
    // Base64URL encoding without padding
    return digest.toString('base64url');
  }

  /**
   * Compute binding hash between DEK and HMAC key.
   * HMAC-SHA-256(hmacKey, dek) → lowercase hex
   * @param {Buffer} hmacKey - HMAC key
   * @param {Buffer} dek - Data encryption key
   * @returns {string} Lowercase hex binding hash
   */
  computeBinding(hmacKey, dek) {
    const hmac = crypto.createHmac('sha256', hmacKey);
    hmac.update(dek);
    return hmac.digest('hex');
  }
}

module.exports = CryptoCodec;

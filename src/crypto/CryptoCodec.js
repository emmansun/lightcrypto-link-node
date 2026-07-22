'use strict';

const crypto = require('crypto');
const AesGcmEncryptor = require('./AesGcmEncryptor');
const AesCbcEncryptor = require('./AesCbcEncryptor');
const Sm4CbcEncryptor = require('./Sm4CbcEncryptor');
const { fromName } = require('../format/AlgorithmId');
const WireFormatEncoder = require('../format/WireFormatEncoder');
const WireFormatDecoder = require('../format/WireFormatDecoder');
const BlindIndexEngine = require('../blindindex/BlindIndexEngine');

/**
 * Multi-algorithm cryptographic dispatch.
 * Provides encrypt/decrypt with Wire Format V1 output, KCV, binding, and blind index.
 */
class CryptoCodec {
  constructor() {
    this._encryptors = new Map();
    this._encryptors.set('AES_256_GCM', new AesGcmEncryptor());
    this._encryptors.set('AES_256_CBC', new AesCbcEncryptor());
    this._encryptors.set('SM4_CBC', new Sm4CbcEncryptor());
    this._blindIndexEngine = new BlindIndexEngine();
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
   * Encrypt data with Wire Format V1 output.
   * @param {Buffer} dek - Data encryption key
   * @param {Buffer} plaintext - Data to encrypt
   * @param {string} algorithm - Algorithm identifier
   * @param {import('../namespace/Namespace')} namespace - Namespace instance
   * @param {number} dekVersion - DEK version (≥ 1)
   * @returns {string} Base64URL-encoded Wire Format V1 blob
   */
  encrypt(dek, plaintext, algorithm, namespace, dekVersion) {
    const encryptor = this.getEncryptor(algorithm);
    const key = this._adaptKey(dek, algorithm);
    const algInfo = fromName(algorithm);

    // Generate IV externally
    const iv = crypto.randomBytes(algInfo.ivLength);

    // Build AAD for GCM modes
    const aad = algInfo.isGcm
      ? WireFormatEncoder.buildAad(algorithm, namespace, dekVersion)
      : null;

    // Encrypt: returns CT‖Tag (GCM) or padded CT (CBC)
    const ciphertext = encryptor.encrypt(key, iv, plaintext, aad);

    // Assemble Wire Format V1 Base64URL output
    return WireFormatEncoder.encodeToBase64Url(algorithm, namespace, dekVersion, iv, ciphertext);
  }

  /**
   * Decrypt a Wire Format V1 blob.
   * @param {Buffer|string} dek - Data encryption key (Buffer or hex string)
   * @param {string|Buffer} data - Base64URL string or Buffer (legacy)
   * @param {string} [algorithm] - Default algorithm (overridden by Wire Format header)
   * @returns {Buffer} Decrypted plaintext
   */
  decrypt(dek, data, algorithm) {
    // Wire Format V1: Base64URL string
    if (typeof data === 'string') {
      const decoded = WireFormatDecoder.decodeFromBase64Url(data);
      const encryptor = this.getEncryptor(decoded.algorithm);
      const key = this._adaptKey(dek, decoded.algorithm);

      // Reconstruct AAD for GCM modes
      const algInfo = fromName(decoded.algorithm);
      const aad = algInfo.isGcm
        ? WireFormatDecoder.reconstructAad(decoded)
        : null;

      return encryptor.decrypt(key, decoded.iv, decoded.ciphertext, aad);
    }

    // Legacy Buffer format fallback (for backward compatibility during transition)
    if (Buffer.isBuffer(data)) {
      const encryptor = this.getEncryptor(algorithm);
      const key = this._adaptKey(dek, algorithm);
      const algInfo = fromName(algorithm);
      const iv = data.subarray(0, algInfo.ivLength);
      const ciphertext = data.subarray(algInfo.ivLength);
      return encryptor.decrypt(key, iv, ciphertext, null);
    }

    throw new Error('Unsupported data format: expected Base64URL string or Buffer');
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
   * For SM4 with 32-byte DEK, take first 16 bytes (matches Java behavior).
   * @param {Buffer} key
   * @param {string} algorithm
   * @returns {Buffer}
   * @private
   */
  _adaptKey(key, algorithm) {
    if (algorithm === 'SM4_CBC' && Buffer.isBuffer(key) && key.length === 32) {
      return key.subarray(0, 16);
    }
    return key;
  }

  /**
   * Generate deterministic blind index using BlindIndexEngine.
   * @param {Buffer} hmacKey - Master HMAC key
   * @param {import('../namespace/Namespace')} namespace - Namespace instance
   * @param {string} fieldName - Field name for isolation
   * @param {string|Buffer} value - Value to index
   * @returns {string} Base64URL encoded blind index
   */
  generateBlindIndex(hmacKey, namespace, fieldName, value) {
    return this._blindIndexEngine.compute(hmacKey, namespace, fieldName, value);
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

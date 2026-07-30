'use strict';

const LclCryptoError = require('./LclCryptoError');

/**
 * Thrown when cryptographic authentication fails during decryption
 * (AES-GCM auth tag mismatch or AES-CBC padding error).
 */
class CryptoAuthenticationError extends LclCryptoError {
  /**
   * @param {string} message - Human-readable error message
   * @param {Object} [context] - Structured context fields
   */
  constructor(message, context = {}) {
    super(message, context);
    this.code = 'ERR_LCL_CRYPTO_AUTH';
  }
}

module.exports = CryptoAuthenticationError;

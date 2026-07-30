'use strict';

const LclCryptoError = require('./LclCryptoError');

/**
 * Thrown when a ciphertext blob cannot be parsed due to structural corruption.
 */
class PayloadCorruptionError extends LclCryptoError {
  /**
   * @param {string} message - Human-readable error message
   * @param {Object} [context] - Structured context fields
   * @param {number} [context.blobLength] - Actual blob length
   * @param {number} [context.expectedMinLength] - Expected minimum blob length
   */
  constructor(message, context = {}) {
    super(message, context);
    this.code = 'ERR_LCL_PAYLOAD_CORRUPTION';
    /** @type {number|undefined} */
    this.blobLength = context.blobLength;
    /** @type {number|undefined} */
    this.expectedMinLength = context.expectedMinLength;
  }
}

module.exports = PayloadCorruptionError;

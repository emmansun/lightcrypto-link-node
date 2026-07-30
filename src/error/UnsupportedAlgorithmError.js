'use strict';

const LclCryptoError = require('./LclCryptoError');

/**
 * Thrown when an algorithm identifier is not recognized by the CryptoCodec registry.
 */
class UnsupportedAlgorithmError extends LclCryptoError {
  /**
   * @param {string} message - Human-readable error message
   * @param {Object} [context] - Structured context fields
   * @param {string|null} [context.algorithm] - The unrecognized algorithm identifier
   */
  constructor(message, context = {}) {
    super(message, context);
    this.code = 'ERR_LCL_UNSUPPORTED_ALGORITHM';
    /** @type {string|null|undefined} */
    this.algorithm = context.algorithm;
  }
}

module.exports = UnsupportedAlgorithmError;

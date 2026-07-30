'use strict';

const LclCryptoError = require('./LclCryptoError');

/**
 * Thrown when the required DEK or vault cannot be found during decryption.
 */
class KeyResolutionError extends LclCryptoError {
  /**
   * @param {string} message - Human-readable error message
   * @param {Object} [context] - Structured context fields
   * @param {boolean} [context.vaultExists] - Whether the vault document exists
   */
  constructor(message, context = {}) {
    super(message, context);
    this.code = 'ERR_LCL_KEY_RESOLUTION';
    /** @type {boolean|undefined} */
    this.vaultExists = context.vaultExists;
  }
}

module.exports = KeyResolutionError;

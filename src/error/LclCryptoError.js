'use strict';

/**
 * Base class for all LCL crypto-related errors.
 * Provides structured context fields for programmatic error handling.
 */
class LclCryptoError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {Object} [context] - Structured context fields
   * @param {string} [context.namespace] - Canonical namespace
   * @param {number} [context.dekVersion] - DEK version number
   * @param {string} [context.kid] - Key identifier
   * @param {string} [context.fieldName] - Encrypted field name
   * @param {Error} [context.cause] - Original underlying error
   */
  constructor(message, context = {}) {
    super(message);
    this.name = this.constructor.name;
    /** @type {string} Machine-readable error code */
    this.code = 'ERR_LCL_CRYPTO';
    /** @type {string|undefined} */
    this.namespace = context.namespace;
    /** @type {number|undefined} */
    this.dekVersion = context.dekVersion;
    /** @type {string|undefined} */
    this.kid = context.kid;
    /** @type {string|undefined} */
    this.fieldName = context.fieldName;
    /** @type {Error|undefined} */
    this.cause = context.cause;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

module.exports = LclCryptoError;

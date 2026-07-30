'use strict';

const LclCryptoError = require('./LclCryptoError');

/**
 * Thrown when decryption succeeds but the plaintext cannot be deserialized
 * according to the stored type marker.
 */
class SchemaDriftError extends LclCryptoError {
  /**
   * @param {string} message - Human-readable error message
   * @param {Object} [context] - Structured context fields
   * @param {string} [context.typeMarker] - The stored type marker
   * @param {Buffer} [context.rawBytes] - The decrypted plaintext Buffer
   */
  constructor(message, context = {}) {
    super(message, context);
    this.code = 'ERR_LCL_SCHEMA_DRIFT';
    /** @type {string|undefined} */
    this.typeMarker = context.typeMarker;
    /** @type {Buffer|undefined} */
    this.rawBytes = context.rawBytes;
  }
}

module.exports = SchemaDriftError;

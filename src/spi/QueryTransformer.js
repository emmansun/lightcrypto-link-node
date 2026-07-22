'use strict';

/**
 * QueryTransformer — abstract SPI for blind-index query rewriting.
 * Implementations transform plaintext field references and values
 * into blind-index lookups for encrypted queries.
 */
class QueryTransformer {
  /**
   * Rewrite a plaintext field name to its blind-index path.
   * @param {string} originalField - Plaintext field name
   * @returns {string} Rewritten field name (e.g. "field.b")
   */
  rewriteFieldName(originalField) {
    throw new Error('Not implemented');
  }

  /**
   * Rewrite a plaintext query value to its blind-index hash.
   * @param {*} plaintextValue - Plaintext query value
   * @param {string} namespace - Namespace string for HMAC key derivation
   * @returns {string} Base64URL blind index hash
   */
  rewriteQueryValue(plaintextValue, namespace) {
    throw new Error('Not implemented');
  }

  /**
   * Check whether a field supports blind-index query rewriting.
   * @param {string} field - Field name
   * @param {Map<string, Object>} encryptedFields - Map of encrypted field configs
   * @returns {boolean}
   */
  supportsField(field, encryptedFields) {
    throw new Error('Not implemented');
  }
}

module.exports = QueryTransformer;

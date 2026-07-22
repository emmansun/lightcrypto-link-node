'use strict';

/**
 * StorageAdapter — abstract SPI for encrypted payload construction and parsing.
 * Implementations define the on-disk sub-document format (e.g. `{c, _e, _t, b}`).
 */
class StorageAdapter {
  /**
   * Build an encrypted payload sub-document from its components.
   * @param {string} blob - Base64URL wire-format ciphertext
   * @param {string} typeMarker - Type marker (e.g. "STR", "DOC", "COL")
   * @param {string|null} [blindIndex] - Optional blind index value
   * @returns {Object} Encrypted payload sub-document
   */
  buildEncryptedPayload(blob, typeMarker, blindIndex) {
    throw new Error('Not implemented');
  }

  /**
   * Extract the Base64URL wire-format blob from an encrypted payload.
   * @param {Object} payload - Encrypted payload sub-document
   * @returns {string|null} Base64URL blob string, or null if invalid
   */
  extractBlob(payload) {
    throw new Error('Not implemented');
  }

  /**
   * Extract the type marker from an encrypted payload.
   * @param {Object} payload - Encrypted payload sub-document
   * @returns {string|null} Type marker string, or null if invalid
   */
  extractTypeMarker(payload) {
    throw new Error('Not implemented');
  }

  /**
   * Extract the blind index value from an encrypted payload.
   * @param {Object} payload - Encrypted payload sub-document
   * @returns {string|null} Blind index value, or null if absent
   */
  extractBlindIndex(payload) {
    throw new Error('Not implemented');
  }

  /**
   * Check whether a value is an encrypted payload sub-document.
   * @param {*} value - Value to check
   * @returns {boolean}
   */
  isEncryptedPayload(value) {
    throw new Error('Not implemented');
  }
}

module.exports = StorageAdapter;

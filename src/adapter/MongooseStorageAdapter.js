'use strict';

const StorageAdapter = require('../spi/StorageAdapter');

/**
 * MongooseStorageAdapter — StorageAdapter for Mongoose/BSON documents.
 * Payload format: `{ c: blob, _e: 1, _t: typeMarker, b?: blindIndex }`.
 */
class MongooseStorageAdapter extends StorageAdapter {
  /**
   * Build an encrypted payload sub-document.
   * @param {string} blob - Base64URL wire-format ciphertext
   * @param {string} typeMarker - Type marker (e.g. "STR", "DOC")
   * @param {string|null} [blindIndex] - Optional blind index value
   * @returns {Object} Encrypted payload sub-document
   */
  buildEncryptedPayload(blob, typeMarker, blindIndex) {
    const payload = { c: blob, _e: 1, _t: typeMarker };
    if (blindIndex != null) {
      payload.b = blindIndex;
    }
    return payload;
  }

  /**
   * Extract the blob from an encrypted payload.
   * @param {Object} payload
   * @returns {string|null}
   */
  extractBlob(payload) {
    if (!payload || typeof payload !== 'object') return null;
    return payload.c != null ? payload.c : null;
  }

  /**
   * Extract the type marker from an encrypted payload.
   * @param {Object} payload
   * @returns {string|null}
   */
  extractTypeMarker(payload) {
    if (!payload || typeof payload !== 'object') return null;
    return payload._t != null ? payload._t : null;
  }

  /**
   * Extract the blind index from an encrypted payload.
   * @param {Object} payload
   * @returns {string|null}
   */
  extractBlindIndex(payload) {
    if (!payload || typeof payload !== 'object') return null;
    return payload.b != null ? payload.b : null;
  }

  /**
   * Check whether a value is an encrypted payload.
   * @param {*} value
   * @returns {boolean}
   */
  isEncryptedPayload(value) {
    return value != null && typeof value === 'object' && value._e === 1;
  }
}

module.exports = MongooseStorageAdapter;

'use strict';

/**
 * DocumentAccessor — abstract SPI for field-level document access.
 * Implementations provide read/write access to fields within documents.
 */
class DocumentAccessor {
  /**
   * Get a field value from a document.
   * @param {Object} doc - The document
   * @param {string} field - Field name
   * @returns {*} Field value, or undefined if absent
   */
  getField(doc, field) {
    throw new Error('Not implemented');
  }

  /**
   * Set a field value in-place on a document.
   * @param {Object} doc - The document
   * @param {string} field - Field name
   * @param {*} value - Value to set
   */
  setField(doc, field, value) {
    throw new Error('Not implemented');
  }

  /**
   * Check whether a value is a document-like structure.
   * @param {*} value - Value to check
   * @returns {boolean}
   */
  isDocumentLike(value) {
    throw new Error('Not implemented');
  }

  /**
   * Return the value as an iterable array if array-like, or null.
   * @param {*} value - Value to check
   * @returns {Array|null}
   */
  asList(value) {
    throw new Error('Not implemented');
  }

  /**
   * Return [key, value] pairs if the value is map-like, or null.
   * @param {*} value - Value to check
   * @returns {Array<[string, *]>|null}
   */
  asMap(value) {
    throw new Error('Not implemented');
  }
}

module.exports = DocumentAccessor;

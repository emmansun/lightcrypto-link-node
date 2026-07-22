'use strict';

const DocumentAccessor = require('../spi/DocumentAccessor');

/**
 * MongooseDocumentAccessor — DocumentAccessor for plain objects and Mongoose Documents.
 */
class MongooseDocumentAccessor extends DocumentAccessor {
  /**
   * Get a field value using bracket notation.
   * @param {Object} doc
   * @param {string} field
   * @returns {*}
   */
  getField(doc, field) {
    if (!doc) return undefined;
    return doc[field];
  }

  /**
   * Set a field value in-place using bracket notation.
   * @param {Object} doc
   * @param {string} field
   * @param {*} value
   */
  setField(doc, field, value) {
    if (!doc) return;
    doc[field] = value;
  }

  /**
   * Check if value is document-like (plain object or Mongoose Document).
   * Returns false for null, Array, Buffer, Date, ObjectId.
   * @param {*} value
   * @returns {boolean}
   */
  isDocumentLike(value) {
    if (value == null) return false;
    if (typeof value !== 'object') return false;
    if (Array.isArray(value)) return false;
    if (Buffer.isBuffer(value)) return false;
    if (value instanceof Date) return false;
    // ObjectId detection: check constructor name or _bsontype
    if (value._bsontype === 'ObjectId' || value._bsontype === 'ObjectID') return false;
    if (value.constructor && value.constructor.name === 'ObjectId') return false;
    return true;
  }

  /**
   * Return value as array if array-like, or null.
   * @param {*} value
   * @returns {Array|null}
   */
  asList(value) {
    if (Array.isArray(value)) return value;
    return null;
  }

  /**
   * Return [key, value] pairs if value is map-like, or null.
   * @param {*} value
   * @returns {Array<[string, *]>|null}
   */
  asMap(value) {
    if (!this.isDocumentLike(value)) return null;
    return Object.entries(value);
  }
}

module.exports = MongooseDocumentAccessor;

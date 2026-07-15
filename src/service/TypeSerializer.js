'use strict';

const encoder = new TextEncoder();

/**
 * TypeSerializer - Deterministic serialization of values to strings for encryption and blind indexing.
 * Ensures cross-language (Java ↔ Node.js) consistency.
 */
class TypeSerializer {
  /**
   * Serialize a value to a string representation.
   * @param {*} value - The value to serialize
   * @returns {string} Serialized string
   */
  serializeToString(value) {
    if (value === null || value === undefined) {
      throw new Error('Cannot serialize null or undefined value');
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    if (typeof value === 'number') {
      return value.toString();
    }

    if (typeof value === 'string') {
      return value;
    }

    if (Buffer.isBuffer(value)) {
      return value.toString('base64');
    }

    if (value instanceof Date) {
      return this._serializeDate(value);
    }

    // Check for Decimal128 (mongoose)
    if (value._bsontype === 'Decimal128' || (value.constructor && value.constructor.name === 'Decimal128')) {
      return value.toString();
    }

    // Check for Long (mongoose-long)
    if (value._bsontype === 'Long' || (value.constructor && value.constructor.name === 'Long')) {
      return value.toString();
    }

    // Check for enum-like objects with ENUM prefix
    if (typeof value === 'object' && value.__enumType && value.__enumValue) {
      return value.__enumValue;
    }

    // Fallback: toString
    return value.toString();
  }

  /**
   * Serialize a value to a Buffer.
   * @param {*} value - The value to serialize
   * @returns {Uint8Array} Serialized bytes
   */
  serialize(value) {
    return encoder.encode(this.serializeToString(value));
  }

  /**
   * Resolve type marker for a given value.
   * @param {*} value - The value to inspect
   * @param {string} [mongooseType] - Optional Mongoose schema type hint
   * @returns {string} Type marker string (e.g., "STR", "INT", etc.)
   */
  resolveTypeMarker(value, mongooseType) {
    // Use value-based detection first for types that can be precisely determined from runtime value.
    // Mongoose 'Number' maps to both INT/DOUBLE/LONG — value inspection is needed to distinguish.
    if (mongooseType && mongooseType !== 'Number' && mongooseType !== 'Mixed') {
      return this._resolveFromMongooseType(mongooseType);
    }

    if (typeof value === 'boolean') {
      return 'BOOL';
    }

    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        if (value > 2147483647 || value < -2147483648) {
          return 'LONG';
        }
        return 'INT';
      }
      return 'DOUBLE';
    }

    if (typeof value === 'string') {
      return 'STR';
    }

    if (Buffer.isBuffer(value)) {
      return 'BYTES';
    }

    if (value instanceof Date) {
      // Check if it has time component
      const hours = value.getUTCHours();
      const minutes = value.getUTCMinutes();
      const seconds = value.getUTCSeconds();
      const ms = value.getUTCMilliseconds();
      if (hours === 0 && minutes === 0 && seconds === 0 && ms === 0) {
        return 'LDATE';
      }
      return 'LDT';
    }

    if (value._bsontype === 'Decimal128' || (value.constructor && value.constructor.name === 'Decimal128')) {
      return 'DEC';
    }

    if (value._bsontype === 'Long' || (value.constructor && value.constructor.name === 'Long')) {
      return 'LONG';
    }

    if (typeof value === 'object' && value.__enumType) {
      return `ENUM:${value.__enumType}`;
    }

    return 'STR';
  }

  /**
   * Serialize a Date value based on whether it's a LocalDate or LocalDateTime.
   * @param {Date} date - The date to serialize
   * @returns {string} ISO format string
   * @private
   */
  _serializeDate(date) {
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const seconds = date.getUTCSeconds();
    const ms = date.getUTCMilliseconds();

    // If no time component, treat as LocalDate
    if (hours === 0 && minutes === 0 && seconds === 0 && ms === 0) {
      return this._formatLocalDate(date);
    }

    // Otherwise LocalDateTime - truncate milliseconds
    return this._formatLocalDateTime(date);
  }

  /**
   * Format date as YYYY-MM-DD (LocalDate).
   * @param {Date} date
   * @returns {string}
   * @private
   */
  _formatLocalDate(date) {
    const y = date.getUTCFullYear().toString().padStart(4, '0');
    const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const d = date.getUTCDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Format date as YYYY-MM-DDTHH:mm:ss (LocalDateTime, milliseconds truncated).
   * @param {Date} date
   * @returns {string}
   * @private
   */
  _formatLocalDateTime(date) {
    const datePart = this._formatLocalDate(date);
    const hh = date.getUTCHours().toString().padStart(2, '0');
    const mm = date.getUTCMinutes().toString().padStart(2, '0');
    const ss = date.getUTCSeconds().toString().padStart(2, '0');
    const ms = date.getUTCMilliseconds().toString().padStart(3, '0');
    
    return `${datePart}T${hh}:${mm}:${ss}.${ms}`;
  }

  /**
   * Resolve type marker from Mongoose schema type.
   * @param {string} mongooseType - Mongoose type name
   * @returns {string} Type marker
   * @private
   */
  _resolveFromMongooseType(mongooseType) {
    const typeMap = {
      'String': 'STR',
      'Number': 'DOUBLE',
      'Boolean': 'BOOL',
      'Date': 'LDT',
      'Buffer': 'BYTES',
      'Decimal128': 'DEC',
      'Long': 'LONG',
      'Mixed': 'STR'
    };
    return typeMap[mongooseType] || 'STR';
  }
}

module.exports = TypeSerializer;

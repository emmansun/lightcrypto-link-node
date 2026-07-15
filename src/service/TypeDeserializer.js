'use strict';

/**
 * TypeDeserializer - Deserialize values from string representation back to JavaScript types
 * based on type markers (_t field).
 */
class TypeDeserializer {
  constructor() {
    this._tryLoadMongooseLong();
    this._tryLoadBson();
  }

  /**
   * Try to load mongoose-long for Long type support.
   * @private
   */
  _tryLoadMongooseLong() {
    try {
      this._Long = require('mongoose-long');
    } catch (e) {
      this._Long = null;
    }
  }

  /**
   * Try to load bson for Decimal128 support.
   * @private
   */
  _tryLoadBson() {
    try {
      const bson = require('bson');
      this._Decimal128 = bson.Decimal128;
    } catch (e) {
      try {
        const mongoose = require('mongoose');
        this._Decimal128 = mongoose.Types.Decimal128 || (mongoose.mongo && mongoose.mongo.Decimal128);
      } catch (e2) {
        this._Decimal128 = null;
      }
    }
  }

  /**
   * Deserialize a string value based on type marker.
   * @param {string} typeMarker - The _t type marker (e.g., "STR", "INT", "BOOL")
   * @param {string} stringValue - The serialized string value
   * @returns {*} Deserialized JavaScript value
   */
  deserialize(typeMarker, stringValue) {
    // Handle ENUM type markers
    if (typeMarker && typeMarker.startsWith('ENUM:')) {
      return stringValue; // Return as string, no Java enum reconstruction
    }

    switch (typeMarker) {
      case 'STR':
        return stringValue;

      case 'INT':
        return this._deserializeInt(stringValue);

      case 'LONG':
        return this._deserializeLong(stringValue);

      case 'SHORT':
        return this._deserializeInt(stringValue);

      case 'BYTE':
        return this._deserializeInt(stringValue);

      case 'FLOAT':
        return parseFloat(stringValue);

      case 'DOUBLE':
        return parseFloat(stringValue);

      case 'DEC':
        return this._deserializeDecimal(stringValue);

      case 'BOOL':
        return stringValue === 'true';

      case 'LDATE':
        return this._deserializeLocalDate(stringValue);

      case 'LDT':
        return this._deserializeLocalDateTime(stringValue);

      case 'BYTES':
        return Buffer.from(stringValue, 'base64');

      default:
        return stringValue;
    }
  }

  /**
   * Parse integer with precision warning for large values.
   * @param {string} value
   * @returns {number}
   * @private
   */
  _deserializeInt(value) {
    const num = parseInt(value, 10);
    if (num > 2147483647 || num < -2147483648) {
      console.warn(`Integer precision warning: value ${value} exceeds 32-bit signed range`);
    }
    return num;
  }

  /**
   * Parse Long value using mongoose-long if available.
   * @param {string} value
   * @returns {number|Long}
   * @private
   */
  _deserializeLong(value) {
    if (this._Long) {
      // mongoose-long is available - but we need the mongoose Long type
      // The actual Long handling depends on how mongoose-long is used
      // For now, try to use native BigInt or warn about precision
    }

    const num = Number(value);
    if (num > Number.MAX_SAFE_INTEGER || num < Number.MIN_SAFE_INTEGER) {
      console.warn(`Long precision warning: value ${value} exceeds JavaScript safe integer range. Consider using mongoose-long.`);
    }
    return num;
  }

  /**
   * Parse decimal to Decimal128 object.
   * @param {string} value
   * @returns {Decimal128|string}
   * @private
   */
  _deserializeDecimal(value) {
    if (this._Decimal128) {
      return this._Decimal128.fromString(value);
    }
    // Fallback: return as string
    return value;
  }

  /**
   * Parse LocalDate string (YYYY-MM-DD) as Date at UTC midnight.
   * @param {string} value - e.g., "1996-05-15"
   * @returns {Date}
   * @private
   */
  _deserializeLocalDate(value) {
    const parts = value.split('-');
    const date = new Date(Date.UTC(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10)
    ));
    return date;
  }

  /**
   * Parse LocalDateTime string (YYYY-MM-DDTHH:mm:ss) as Date.
   * @param {string} value - e.g., "1996-05-15T14:30:00"
   * @returns {Date}
   * @private
   */
  _deserializeLocalDateTime(value) {
    const [datePart, timePartWithMs] = value.split('T');
    const [year, month, day] = datePart.split('-').map(Number);

    const [timePart, msPart] = timePartWithMs.split('.');
    const [hours, minutes, seconds] = timePart.split(':').map(Number);
    
    const milliseconds = msPart ? Number(msPart) : 0;
    return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds, milliseconds));
  }
}

module.exports = TypeDeserializer;

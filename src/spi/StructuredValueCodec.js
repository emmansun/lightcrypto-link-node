'use strict';

/**
 * StructuredValueCodec — abstract SPI for structured value serialization (DOC/COL/MAP).
 * Implementations encode and decode structured field values to/from binary.
 */
class StructuredValueCodec {
  /**
   * Encode a structured value to binary.
   * @param {*} structuredValue - The value to encode
   * @param {string} typeMarker - Type marker ('DOC', 'COL', 'MAP')
   * @returns {Buffer} Serialized binary representation
   */
  encode(structuredValue, typeMarker) {
    throw new Error('Not implemented');
  }

  /**
   * Decode binary data to a structured value.
   * @param {Buffer} data - Binary data
   * @param {string} typeMarker - Type marker ('DOC', 'COL', 'MAP')
   * @returns {*} Deserialized structured value
   */
  decode(data, typeMarker) {
    throw new Error('Not implemented');
  }
}

module.exports = StructuredValueCodec;

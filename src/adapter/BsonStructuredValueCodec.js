'use strict';

const { serialize, deserialize } = require('bson');
const StructuredValueCodec = require('../spi/StructuredValueCodec');

/**
 * BsonStructuredValueCodec — BSON-based StructuredValueCodec.
 * DOC/MAP: serialize directly; COL: wrap as `{ _v: value }`.
 */
class BsonStructuredValueCodec extends StructuredValueCodec {
  /**
   * Encode a structured value to BSON binary.
   * @param {*} structuredValue
   * @param {string} typeMarker - 'DOC', 'COL', or 'MAP'
   * @returns {Buffer}
   */
  encode(structuredValue, typeMarker) {
    if (typeMarker === 'DOC' || typeMarker === 'MAP') {
      return Buffer.from(serialize(structuredValue));
    }
    if (typeMarker === 'COL') {
      return Buffer.from(serialize({ _v: structuredValue }));
    }
    throw new Error(`Unsupported typeMarker for encoding: ${typeMarker}`);
  }

  /**
   * Decode BSON binary to a structured value.
   * @param {Buffer} data
   * @param {string} typeMarker - 'DOC', 'COL', or 'MAP'
   * @returns {*}
   */
  decode(data, typeMarker) {
    if (typeMarker === 'DOC' || typeMarker === 'MAP') {
      return deserialize(data);
    }
    if (typeMarker === 'COL') {
      const doc = deserialize(data);
      return doc._v;
    }
    throw new Error(`Unsupported typeMarker for decoding: ${typeMarker}`);
  }
}

module.exports = BsonStructuredValueCodec;

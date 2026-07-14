'use strict';

const { serialize, deserialize } = require('bson');

/**
 * BsonCodec - BSON binary encode/decode helper for structured field encryption.
 * Matches Java's BsonBinaryWriter + DocumentCodec output byte-for-byte.
 *
 * - Documents (plain objects) are serialized directly as BSON binary.
 * - Collections (arrays) are wrapped as `{ _v: [...] }` before BSON encoding,
 *   and unwrapped on decode.
 */
class BsonCodec {
  /**
   * Encode a plain object as BSON binary.
   * @param {Object} obj - Plain JavaScript object
   * @returns {Buffer} BSON binary bytes
   */
  encodeDocument(obj) {
    return Buffer.from(serialize(obj));
  }

  /**
   * Encode an array as BSON binary with `_v` wrapper.
   * @param {Array} arr - JavaScript array
   * @returns {Buffer} BSON binary bytes of `{ _v: arr }`
   */
  encodeCollection(arr) {
    return Buffer.from(serialize({ _v: arr }));
  }

  /**
   * Decode BSON binary to a plain object.
   * @param {Buffer} buf - BSON binary bytes
   * @returns {Object} Plain JavaScript object
   */
  decodeDocument(buf) {
    return deserialize(buf);
  }

  /**
   * Decode BSON binary to an array (unwraps `_v`).
   * @param {Buffer} buf - BSON binary bytes of `{ _v: [...] }`
   * @returns {Array} JavaScript array
   */
  decodeCollection(buf) {
    const doc = deserialize(buf);
    return doc._v;
  }
}

module.exports = BsonCodec;

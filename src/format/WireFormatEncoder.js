'use strict';

const { fromName } = require('./AlgorithmId');

const WIRE_VERSION = 0x01;

/**
 * Wire Format V1 encoder — produces byte-identical output to Java WireFormatEncoder.
 *
 * Binary layout:
 *   [1B version=0x01][1B algId][2B nsLen BE][NB namespace UTF-8]
 *   [4B dekVersion BE][1B ivLen][IV bytes][2B aadExtLen=0x0000][ciphertext bytes]
 */
class WireFormatEncoder {
  /**
   * Encode encrypted payload into Wire Format V1 binary blob.
   * @param {string} algorithm - Algorithm name (e.g. "AES_256_GCM")
   * @param {import('../namespace/Namespace')} namespace - Namespace instance
   * @param {number} dekVersion - DEK version (≥ 1)
   * @param {Buffer} iv - Initialization vector
   * @param {Buffer} ciphertext - Ciphertext (GCM: CT‖Tag; CBC: padded CT)
   * @returns {Buffer} Wire Format V1 binary blob
   */
  static encode(algorithm, namespace, dekVersion, iv, ciphertext) {
    const alg = fromName(algorithm);
    const nsBytes = namespace.canonicalBytes();
    const nsLen = nsBytes.length;

    if (nsLen === 0) {
      throw new Error('Namespace must not be empty');
    }
    if (nsLen > 65535) {
      throw new Error(`Namespace too long: ${nsLen} bytes (max 65535)`);
    }
    if (dekVersion < 1) {
      throw new Error(`dekVersion must be >= 1, got ${dekVersion}`);
    }

    const buf = Buffer.alloc(1 + 1 + 2 + nsLen + 4 + 1 + iv.length + 2 + ciphertext.length);
    let offset = 0;

    buf[offset++] = WIRE_VERSION;              // 1B version
    buf[offset++] = alg.id;                    // 1B algId
    buf.writeUInt16BE(nsLen, offset);           // 2B nsLen
    offset += 2;
    nsBytes.copy(buf, offset);                  // NB namespace
    offset += nsLen;
    buf.writeUInt32BE(dekVersion, offset);      // 4B dekVersion
    offset += 4;
    buf[offset++] = iv.length;                 // 1B ivLen
    iv.copy(buf, offset);                       // IV bytes
    offset += iv.length;
    buf.writeUInt16BE(0, offset);               // 2B aadExtLen = 0
    offset += 2;
    ciphertext.copy(buf, offset);               // ciphertext bytes

    return buf;
  }

  /**
   * Encode to Base64URL (no padding) string for MongoDB storage.
   * @param {string} algorithm
   * @param {import('../namespace/Namespace')} namespace
   * @param {number} dekVersion
   * @param {Buffer} iv
   * @param {Buffer} ciphertext
   * @returns {string} Base64URL string
   */
  static encodeToBase64Url(algorithm, namespace, dekVersion, iv, ciphertext) {
    return WireFormatEncoder.encode(algorithm, namespace, dekVersion, iv, ciphertext)
      .toString('base64url');
  }

  /**
   * Build AAD for GCM encryption — matches Java WireFormatEncoder.buildAad().
   * AAD = [0x01][algId byte][namespace UTF-8 bytes][dekVersion 4B big-endian]
   * @param {string} algorithm
   * @param {import('../namespace/Namespace')} namespace
   * @param {number} dekVersion
   * @returns {Buffer}
   */
  static buildAad(algorithm, namespace, dekVersion) {
    const alg = fromName(algorithm);
    const nsBytes = namespace.canonicalBytes();

    const aad = Buffer.alloc(1 + 1 + nsBytes.length + 4);
    aad[0] = WIRE_VERSION;
    aad[1] = alg.id;
    nsBytes.copy(aad, 2);
    aad.writeUInt32BE(dekVersion, 2 + nsBytes.length);
    return aad;
  }
}

module.exports = WireFormatEncoder;

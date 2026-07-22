'use strict';

const { fromByte } = require('./AlgorithmId');

const WIRE_VERSION = 0x01;
const MIN_BLOB_SIZE = 12; // version(1) + algId(1) + nsLen(2) + dekVersion(4) + ivLen(1) + aadExtLen(2) + at least 1 byte CT

/**
 * Wire Format V1 decoder — parses blobs produced by Java WireFormatDecoder.
 */
class WireFormatDecoder {
  /**
   * Decode a Wire Format V1 binary blob.
   * @param {Buffer} blob - Binary blob
   * @returns {{version: number, algorithm: string, namespace: string, dekVersion: number, iv: Buffer, aadExt: Buffer, ciphertext: Buffer}}
   */
  static decode(blob) {
    if (!Buffer.isBuffer(blob)) {
      throw new Error('Input must be a Buffer');
    }
    if (blob.length < MIN_BLOB_SIZE) {
      throw new Error(`Truncated Wire Format V1 blob: ${blob.length} bytes (minimum ${MIN_BLOB_SIZE})`);
    }

    let offset = 0;

    const version = blob[offset++];
    if (version !== WIRE_VERSION) {
      throw new Error(`Unsupported wire format version: 0x${version.toString(16).padStart(2, '0')} (expected 0x01)`);
    }

    const algId = blob[offset++];
    const alg = fromByte(algId);

    const nsLen = blob.readUInt16BE(offset);
    offset += 2;

    const namespace = blob.subarray(offset, offset + nsLen).toString('utf8');
    offset += nsLen;

    const dekVersion = blob.readUInt32BE(offset);
    offset += 4;

    const ivLen = blob[offset++];
    const iv = Buffer.from(blob.subarray(offset, offset + ivLen));
    offset += ivLen;

    const aadExtLen = blob.readUInt16BE(offset);
    offset += 2;

    const aadExt = Buffer.from(blob.subarray(offset, offset + aadExtLen));
    offset += aadExtLen;

    const ciphertext = Buffer.from(blob.subarray(offset));

    if (ciphertext.length === 0) {
      throw new Error('Empty ciphertext in Wire Format V1 blob');
    }

    return {
      version,
      algorithm: alg.name,
      namespace,
      dekVersion,
      iv,
      aadExt,
      ciphertext
    };
  }

  /**
   * Decode a Base64URL-encoded Wire Format V1 string.
   * @param {string} str - Base64URL string (no padding)
   * @returns {{version: number, algorithm: string, namespace: string, dekVersion: number, iv: Buffer, aadExt: Buffer, ciphertext: Buffer}}
   */
  static decodeFromBase64Url(str) {
    const blob = Buffer.from(str, 'base64url');
    return WireFormatDecoder.decode(blob);
  }

  /**
   * Reconstruct AAD from decoded blob fields.
   * @param {{algorithm: string, namespace: string, dekVersion: number}} decoded - Decoded fields
   * @returns {Buffer} AAD bytes
   */
  static reconstructAad(decoded) {
    const alg = fromByte(require('./AlgorithmId').fromName(decoded.algorithm).id);
    const nsBytes = Buffer.from(decoded.namespace, 'utf8');

    const aad = Buffer.alloc(1 + 1 + nsBytes.length + 4);
    aad[0] = WIRE_VERSION;
    aad[1] = alg.id;
    nsBytes.copy(aad, 2);
    aad.writeUInt32BE(decoded.dekVersion, 2 + nsBytes.length);
    return aad;
  }
}

module.exports = WireFormatDecoder;

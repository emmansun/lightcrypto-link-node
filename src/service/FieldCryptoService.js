'use strict';

const CryptoCodec = require('../crypto/CryptoCodec');
const BsonCodec = require('../crypto/BsonCodec');
const TypeSerializer = require('./TypeSerializer');
const TypeDeserializer = require('./TypeDeserializer');

/**
 * Custom error classes for crypto operations.
 */
class FatalCryptoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FatalCryptoError';
  }
}

class DecryptionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DecryptionError';
  }
}

/**
 * FieldCryptoService - Encrypts/decrypts individual field values.
 * Builds and parses the encrypted sub-document format compatible with Java LightCrypto-Link.
 *
 * Sub-document format: { _e: 1, _k: kid, _a: algorithm, _t: typeMarker, c: ciphertext, b?: blindIndex }
 */
class FieldCryptoService {
  constructor() {
    this._codec = new CryptoCodec();
    this._bsonCodec = new BsonCodec();
    this._serializer = new TypeSerializer();
    this._deserializer = new TypeDeserializer();
  }

  /**
   * Encrypt a field value into a sub-document.
   * @param {*} value - The plaintext value to encrypt
   * @param {string} fieldName - Field name (for blind index isolation)
   * @param {Buffer} dek - Data encryption key
   * @param {Buffer} hmacKey - HMAC key for blind index
   * @param {string} activeKid - Active key ID
   * @param {string} algorithm - Algorithm identifier (e.g., "AES_256_GCM")
   * @param {Object} [options] - Options
   * @param {boolean} [options.blindIndex=false] - Whether to compute blind index
   * @param {string} [options.mongooseType] - Mongoose schema type hint
   * @param {string} [options.customFieldName] - Custom field name for blind index
   * @param {string} [options.structuredType] - Structured type marker ('DOC', 'COL', 'MAP')
   * @returns {Object} Encrypted sub-document
   */
  encryptField(value, fieldName, dek, hmacKey, activeKid, algorithm, options = {}) {
    if (value === null || value === undefined) {
      return value;
    }

    const blindIndex = options.blindIndex || false;
    const mongooseType = options.mongooseType;
    const effectiveFieldName = options.customFieldName || fieldName;
    const structuredType = options.structuredType;

    // Structured type path: DOC / COL / MAP
    if (structuredType === 'DOC' || structuredType === 'MAP') {
      // Convert Mongoose SubDocument to plain object if needed
      const plainObj = (value && typeof value.toObject === 'function') ? value.toObject() : value;
      const plaintext = this._bsonCodec.encodeDocument(plainObj);
      const ciphertext = this._codec.encrypt(dek, plaintext, algorithm);
      return {
        _e: 1,
        _k: activeKid,
        _a: algorithm,
        _t: structuredType,
        c: ciphertext
      };
    }

    if (structuredType === 'COL') {
      const plaintext = this._bsonCodec.encodeCollection(value);
      const ciphertext = this._codec.encrypt(dek, plaintext, algorithm);
      return {
        _e: 1,
        _k: activeKid,
        _a: algorithm,
        _t: 'COL',
        c: ciphertext
      };
    }

    // Scalar path (existing behavior)
    // Serialize value
    const serializedString = this._serializer.serializeToString(value);
    const plaintext = Buffer.from(serializedString, 'utf8');

    // Resolve type marker
    const typeMarker = this._serializer.resolveTypeMarker(value, mongooseType);

    // Encrypt
    const ciphertext = this._codec.encrypt(dek, plaintext, algorithm);

    // Build sub-document
    const subDoc = {
      _e: 1,
      _k: activeKid,
      _a: algorithm,
      _t: typeMarker,
      c: ciphertext
    };

    // Compute blind index if enabled
    if (blindIndex) {
      subDoc.b = this._codec.generateBlindIndex(hmacKey, effectiveFieldName, serializedString);
    }

    return subDoc;
  }

  /**
   * Decrypt an encrypted sub-document back to plaintext.
   * @param {Object} subDocument - The encrypted sub-document
   * @param {Buffer} dek - Data encryption key
   * @param {Buffer} hmacKey - HMAC key (unused for decryption, reserved for verification)
   * @param {string} algorithm - Default algorithm (overridden by _a field)
   * @returns {*} Decrypted plaintext value
   */
  decryptField(subDocument, dek, hmacKey, algorithm) {
    if (!subDocument || typeof subDocument !== 'object') {
      return subDocument;
    }

    // Validate _e marker
    if (subDocument._e !== 1) {
      if (subDocument._e === undefined) {
        return subDocument; // Not an encrypted sub-document
      }
      throw new DecryptionError(`Invalid encryption marker: _e = ${subDocument._e}`);
    }

    // Validate _k (kid) field
    if (!subDocument._k) {
      throw new FatalCryptoError("missing '_k' (kid) field in encrypted sub-document");
    }

    // Get algorithm from sub-document
    const algo = subDocument._a || algorithm;
    if (!algo) {
      throw new DecryptionError('Unsupported algorithm: no algorithm specified in sub-document');
    }

    // Check algorithm is supported
    try {
      this._codec.getEncryptor(algo);
    } catch (e) {
      throw new DecryptionError(`Unsupported algorithm: ${algo}`);
    }

    // Get ciphertext
    const ciphertext = subDocument.c;
    if (!ciphertext) {
      throw new DecryptionError('Missing ciphertext field in encrypted sub-document');
    }

    // Ensure ciphertext is a Buffer (handle BSON Binary, Buffer, and base64 string)
    let cipherBuffer;
    if (Buffer.isBuffer(ciphertext)) {
      cipherBuffer = ciphertext;
    } else if (ciphertext && ciphertext._bsontype === 'Binary' && ciphertext.buffer) {
      cipherBuffer = ciphertext.buffer;
    } else if (typeof ciphertext === 'string') {
      cipherBuffer = Buffer.from(ciphertext, 'base64');
    } else {
      cipherBuffer = Buffer.from(ciphertext);
    }

    // Decrypt
    let plaintext;
    try {
      plaintext = this._codec.decrypt(dek, cipherBuffer, algo);
    } catch (e) {
      throw new DecryptionError(`Decryption failed: ${e.message}`);
    }

    // Get type marker
    const typeMarker = subDocument._t || 'STR';

    // Structured type path: DOC / COL / MAP
    if (typeMarker === 'DOC' || typeMarker === 'MAP') {
      return this._bsonCodec.decodeDocument(plaintext);
    }

    if (typeMarker === 'COL') {
      return this._bsonCodec.decodeCollection(plaintext);
    }

    // Scalar path (existing behavior)
    const stringValue = plaintext.toString('utf8');
    return this._deserializer.deserialize(typeMarker, stringValue);
  }
}

module.exports = { FieldCryptoService, FatalCryptoError, DecryptionError };

'use strict';

const CryptoCodec = require('../crypto/CryptoCodec');
const BsonCodec = require('../crypto/BsonCodec');
const TypeSerializer = require('./TypeSerializer');
const TypeDeserializer = require('./TypeDeserializer');
const Namespace = require('../namespace/Namespace');

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
 * Sub-document format: { _e: 1, _k: kid, _a: algorithm, _t: typeMarker, c: Base64URL string, b?: blindIndex }
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
   * @param {import('../namespace/Namespace')} [options.namespace] - Namespace instance
   * @param {number} [options.dekVersion=1] - DEK version
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
    const namespace = options.namespace || Namespace.parse(`${effectiveFieldName}#${effectiveFieldName}`);
    const dekVersion = options.dekVersion || 1;

    // Structured type path: DOC / COL / MAP
    if (structuredType === 'DOC' || structuredType === 'MAP') {
      const plainObj = (value && typeof value.toObject === 'function') ? value.toObject() : value;
      const plaintext = this._bsonCodec.encodeDocument(plainObj);
      const ciphertext = this._codec.encrypt(dek, plaintext, algorithm, namespace, dekVersion);
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
      const ciphertext = this._codec.encrypt(dek, plaintext, algorithm, namespace, dekVersion);
      return {
        _e: 1,
        _k: activeKid,
        _a: algorithm,
        _t: 'COL',
        c: ciphertext
      };
    }

    // Scalar path
    const typeMarker = this._serializer.resolveTypeMarker(value, mongooseType);

    let plaintext;
    let serializedString;
    if (typeMarker === 'BYTES' && Buffer.isBuffer(value)) {
      plaintext = value;
    } else {
      serializedString = this._serializer.serializeToString(value);
      plaintext = Buffer.from(serializedString, 'utf8');
    }

    // Encrypt — produces Base64URL string
    const ciphertext = this._codec.encrypt(dek, plaintext, algorithm, namespace, dekVersion);

    // Build sub-document (c is now a string, not Buffer)
    const subDoc = {
      _e: 1,
      _k: activeKid,
      _a: algorithm,
      _t: typeMarker,
      c: ciphertext
    };

    // Compute blind index if enabled
    if (blindIndex) {
      if (typeMarker === 'BYTES' && Buffer.isBuffer(value)) {
        serializedString = value.toString('base64');
      }
      subDoc.b = this._codec.generateBlindIndex(hmacKey, namespace, effectiveFieldName, serializedString);
    }

    return subDoc;
  }

  /**
   * Decrypt an encrypted sub-document back to plaintext.
   * @param {Object} subDocument - The encrypted sub-document
   * @param {Buffer} dek - Data encryption key
   * @param {Buffer} hmacKey - HMAC key (unused for decryption, reserved for verification)
   * @param {string} algorithm - Default algorithm (overridden by _a field or Wire Format header)
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

    // Get algorithm from sub-document or Wire Format header
    const algo = subDocument._a || algorithm;
    if (!algo) {
      throw new DecryptionError('Unsupported algorithm: no algorithm specified in sub-document');
    }

    // Get ciphertext — now expected as Base64URL string (Wire Format V1) or legacy Buffer
    const ciphertext = subDocument.c;
    if (!ciphertext) {
      throw new DecryptionError('Missing ciphertext field in encrypted sub-document');
    }

    // Decrypt
    let plaintext;
    try {
      if (typeof ciphertext === 'string') {
        // Wire Format V1 Base64URL string
        plaintext = this._codec.decrypt(dek, ciphertext, algo);
      } else if (Buffer.isBuffer(ciphertext)) {
        // Legacy Buffer format
        plaintext = this._codec.decrypt(dek, ciphertext, algo);
      } else if (ciphertext && ciphertext._bsontype === 'Binary' && ciphertext.buffer) {
        // BSON Binary → Buffer
        plaintext = this._codec.decrypt(dek, ciphertext.buffer, algo);
      } else {
        plaintext = this._codec.decrypt(dek, Buffer.from(ciphertext), algo);
      }
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

    // Scalar path
    if (typeMarker === 'BYTES') {
      return plaintext;
    }
    const stringValue = plaintext.toString('utf8');
    return this._deserializer.deserialize(typeMarker, stringValue);
  }
}

module.exports = { FieldCryptoService, FatalCryptoError, DecryptionError };

'use strict';

const CryptoCodec = require('../crypto/CryptoCodec');
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
 * Sub-document format: { c: Base64URL string, _e: 1, _t: typeMarker, _k: kid, _a: algorithm, b?: blindIndex }
 */
class FieldCryptoService {
  /**
   * @param {Object} options - Options
   * @param {import('../spi/StorageAdapter')} options.storageAdapter - StorageAdapter implementation (required)
   * @param {import('../spi/StructuredValueCodec')} options.structuredValueCodec - StructuredValueCodec implementation (required)
   */
  constructor({ storageAdapter, structuredValueCodec } = {}) {
    if (!storageAdapter) throw new Error('storageAdapter is required');
    if (!structuredValueCodec) throw new Error('structuredValueCodec is required');
    this._codec = new CryptoCodec();
    this._storageAdapter = storageAdapter;
    this._structuredCodec = structuredValueCodec;
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
      const plaintext = this._structuredCodec.encode(plainObj, structuredType);
      const ciphertext = this._codec.encrypt(dek, plaintext, algorithm, namespace, dekVersion);
      const payload = this._storageAdapter.buildEncryptedPayload(ciphertext, structuredType, null);
      payload._k = activeKid;
      payload._a = algorithm;
      return payload;
    }

    if (structuredType === 'COL') {
      const plaintext = this._structuredCodec.encode(value, 'COL');
      const ciphertext = this._codec.encrypt(dek, plaintext, algorithm, namespace, dekVersion);
      const payload = this._storageAdapter.buildEncryptedPayload(ciphertext, 'COL', null);
      payload._k = activeKid;
      payload._a = algorithm;
      return payload;
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

    // Compute blind index if enabled
    let blindIndexValue = null;
    if (blindIndex) {
      if (typeMarker === 'BYTES' && Buffer.isBuffer(value)) {
        serializedString = value.toString('base64');
      }
      blindIndexValue = this._codec.generateBlindIndex(hmacKey, namespace, effectiveFieldName, serializedString);
    }

    // Build sub-document via StorageAdapter
    const subDoc = this._storageAdapter.buildEncryptedPayload(ciphertext, typeMarker, blindIndexValue);
    subDoc._k = activeKid;
    subDoc._a = algorithm;

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

    // Use StorageAdapter for detection
    if (!this._storageAdapter.isEncryptedPayload(subDocument)) {
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

    // Extract blob via StorageAdapter
    const ciphertext = this._storageAdapter.extractBlob(subDocument);
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

    // Get type marker via StorageAdapter
    const typeMarker = this._storageAdapter.extractTypeMarker(subDocument) || 'STR';

    // Structured type path: DOC / COL / MAP
    if (typeMarker === 'DOC' || typeMarker === 'MAP') {
      return this._structuredCodec.decode(plaintext, typeMarker);
    }

    if (typeMarker === 'COL') {
      return this._structuredCodec.decode(plaintext, 'COL');
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

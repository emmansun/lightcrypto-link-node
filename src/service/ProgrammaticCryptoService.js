'use strict';

const CryptoCodec = require('../crypto/CryptoCodec');
const BsonCodec = require('../crypto/BsonCodec');
const TypeSerializer = require('./TypeSerializer');
const TypeDeserializer = require('./TypeDeserializer');
const { FieldCryptoService, DecryptionError } = require('./FieldCryptoService');
const Namespace = require('../namespace/Namespace');
const WireFormatDecoder = require('../format/WireFormatDecoder');

const DEFAULT_ALGORITHM = 'AES_256_GCM';

/**
 * ProgrammaticCryptoService — Manual encrypt/decrypt API for use outside the
 * Mongoose plugin flow. Covers scalar encryption/decryption and raw document
 * field decryption (e.g., aggregation pipeline results, raw driver queries).
 *
 * Produces sub-documents 100% compatible with the Java LightCrypto-Link
 * ProgrammaticCryptoService.
 */
class ProgrammaticCryptoService {
  /**
   * @param {Object} options
   * @param {KeyVaultService} options.keyVaultService  - Required. Manages per-namespace DEK lifecycle.
   * @param {FieldCryptoService} [options.fieldCryptoService] - Optional. Created internally if omitted.
   * @param {string} [options.algorithm='AES_256_GCM'] - Default encryption algorithm.
   */
  constructor({ keyVaultService, fieldCryptoService, algorithm } = {}) {
    if (!keyVaultService) {
      throw new Error('keyVaultService is required');
    }

    this._keyVaultService = keyVaultService;
    this._fieldCryptoService = fieldCryptoService || new FieldCryptoService();
    this._algorithm = algorithm || DEFAULT_ALGORITHM;
    this._codec = new CryptoCodec();
    this._bsonCodec = new BsonCodec();
    this._serializer = new TypeSerializer();
    this._deserializer = new TypeDeserializer();
  }

  /**
   * Encrypt a scalar value into a canonical LCL sub-document.
   *
   * @param {*} value - Plaintext value to encrypt. Returns null/undefined as-is.
   * @param {string} namespace - Namespace string (e.g., "User#phone" or "default.default.User#phone").
   * @param {string} [algorithm] - Override the default algorithm for this operation.
   * @returns {Promise<Object|null|undefined>} Sub-document { _e, _t, c }, or null/undefined if input is null/undefined.
   */
  async encryptValue(value, namespace, algorithm) {
    if (value === null || value === undefined) {
      return value;
    }
    if (!namespace) {
      throw new Error('namespace is required');
    }

    const algo = algorithm || this._algorithm;

    // Parse namespace and get canonical form
    const ns = Namespace.parse(namespace);
    const canonicalNs = ns.canonical();

    // Ensure vault is initialized
    await this._keyVaultService.ensureVaultInitialized(canonicalNs);
    const dekVersion = await this._keyVaultService.getActiveDekVersion(canonicalNs);
    const activeKid = await this._keyVaultService.getActiveKid(canonicalNs);
    const dek = await this._keyVaultService.getDek(activeKid);

    // Validate algorithm early
    this._codec.getEncryptor(algo);

    // Structured type detection: plain objects and arrays use BSON binary serialization
    if (Array.isArray(value)) {
      const plaintext = this._bsonCodec.encodeCollection(value);
      const ciphertext = this._codec.encrypt(dek, plaintext, algo, ns, dekVersion);
      return {
        _e: 1,
        _t: 'COL',
        c: ciphertext
      };
    }

    if (
      value &&
      typeof value === 'object' &&
      !Buffer.isBuffer(value) &&
      !(value instanceof Date) &&
      value.constructor === Object
    ) {
      const plaintext = this._bsonCodec.encodeDocument(value);
      const ciphertext = this._codec.encrypt(dek, plaintext, algo, ns, dekVersion);
      return {
        _e: 1,
        _t: 'DOC',
        c: ciphertext
      };
    }

    // Scalar path: Serialize value to string, then to Buffer
    const serializedString = this._serializer.serializeToString(value);
    const plaintext = Buffer.from(serializedString, 'utf8');

    // Resolve type marker
    const typeMarker = this._serializer.resolveTypeMarker(value);

    // Encrypt
    const ciphertext = this._codec.encrypt(dek, plaintext, algo, ns, dekVersion);

    // Build canonical sub-document (aligned with Java: only _e, _t, c)
    return {
      _e: 1,
      _t: typeMarker,
      c: ciphertext
    };
  }

  /**
   * Decrypt a canonical LCL sub-document back to a JavaScript value.
   * Extracts namespace and dekVersion from the Wire Format V1 blob.
   *
   * @param {Object|null|undefined} encryptedSubDocument - Sub-document with _e, _t, c markers.
   * @returns {Promise<*>} Decrypted plaintext value, or null/undefined if input is null/undefined.
   * @throws {Error} If required markers are missing or DEK cannot be resolved.
   */
  async decryptValue(encryptedSubDocument) {
    if (encryptedSubDocument === null || encryptedSubDocument === undefined) {
      return encryptedSubDocument;
    }
    if (typeof encryptedSubDocument !== 'object') {
      throw new Error('encryptedSubDocument must be an object');
    }

    // Validate _e marker
    if (encryptedSubDocument._e === undefined) {
      throw new Error('Missing required marker: _e');
    }
    if (encryptedSubDocument._e !== 1) {
      throw new DecryptionError(`Invalid encryption marker: _e = ${encryptedSubDocument._e}`);
    }

    // Validate _t (type) marker
    if (!encryptedSubDocument._t) {
      throw new Error('Missing required marker: _t');
    }

    const ciphertext = encryptedSubDocument.c;
    if (!ciphertext) {
      throw new Error('Missing ciphertext field: c');
    }

    // Decode Wire Format blob to get namespace and dekVersion
    let decoded;
    try {
      if (typeof ciphertext === 'string') {
        decoded = WireFormatDecoder.decodeFromBase64Url(ciphertext);
      } else if (Buffer.isBuffer(ciphertext)) {
        decoded = WireFormatDecoder.decode(ciphertext);
      } else {
        throw new DecryptionError('Unsupported ciphertext format');
      }
    } catch (e) {
      if (e.name === 'DecryptionError') throw e;
      throw new DecryptionError(`Invalid Wire Format blob: ${e.message}`);
    }

    const namespace = decoded.namespace;
    const dekVersion = decoded.dekVersion;

    // Ensure vault initialized and get DEK by version
    await this._keyVaultService.ensureVaultInitialized(namespace);
    const dek = await this._keyVaultService.getDekByVersion(namespace, dekVersion);

    // Determine algorithm
    const algo = encryptedSubDocument._a || decoded.algorithm || this._algorithm;

    // Delegate to FieldCryptoService for decryption and deserialization
    return this._fieldCryptoService.decryptField(encryptedSubDocument, dek, null, algo);
  }

  /**
   * Decrypt all specified encrypted fields in a raw MongoDB document.
   * Mutates the document in-place and returns the same reference.
   *
   * @param {Object}   rawDocument       - Raw document (e.g., from aggregation or db.collection.find()).
   * @param {string}   entityName        - Entity name for namespace construction (e.g., "User").
   * @param {string[]} encryptedFields   - Array of field names to decrypt.
   * @returns {Promise<Object>} The same rawDocument reference, mutated with decrypted values.
   */
  async decryptDocument(rawDocument, entityName, encryptedFields) {
    if (!rawDocument || typeof rawDocument !== 'object') {
      return rawDocument;
    }
    if (!entityName) {
      throw new Error('entityName is required');
    }
    if (!Array.isArray(encryptedFields)) {
      throw new Error('encryptedFields must be an array');
    }

    for (const fieldName of encryptedFields) {
      const subDoc = rawDocument[fieldName];

      // Skip fields not present or not encrypted sub-documents
      if (!subDoc || typeof subDoc !== 'object' || subDoc._e !== 1) {
        continue;
      }

      rawDocument[fieldName] = await this.decryptValue(subDoc);
    }

    return rawDocument;
  }
}

module.exports = ProgrammaticCryptoService;

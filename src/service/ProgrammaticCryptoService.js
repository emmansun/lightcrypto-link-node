'use strict';

const CryptoCodec = require('../crypto/CryptoCodec');
const TypeSerializer = require('./TypeSerializer');
const TypeDeserializer = require('./TypeDeserializer');
const { FieldCryptoService, DecryptionError } = require('./FieldCryptoService');

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
   * @param {KeyVaultService} options.keyVaultService  - Required. Manages per-entity DEK lifecycle.
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
    this._serializer = new TypeSerializer();
    this._deserializer = new TypeDeserializer();
  }

  /**
   * Encrypt a scalar value into a canonical LCL sub-document.
   *
   * @param {*} value          - Plaintext value to encrypt. Returns null/undefined as-is.
   * @param {string} entityName - Entity name used to resolve the active DEK (e.g., "User").
   * @param {string} [algorithm] - Override the default algorithm for this operation.
   * @returns {Promise<Object|null|undefined>} Sub-document { _e, _k, _a, _t, c, _entity }, or null/undefined if input is null/undefined.
   * @throws {Error} If entityName is missing.
   */
  async encryptValue(value, entityName, algorithm) {
    if (value === null || value === undefined) {
      return value;
    }
    if (!entityName) {
      throw new Error('entityName is required');
    }

    const algo = algorithm || this._algorithm;

    // Validate algorithm early
    this._codec.getEncryptor(algo);

    // Resolve active kid and DEK via keyVaultService
    const vaultEntry = await this._keyVaultService.ensureVaultInitialized(entityName);

    // Serialize value to string, then to Buffer
    const serializedString = this._serializer.serializeToString(value);
    const plaintext = Buffer.from(serializedString, 'utf8');

    // Resolve type marker
    const typeMarker = this._serializer.resolveTypeMarker(value);

    // Encrypt
    const ciphertext = this._codec.encrypt(vaultEntry.dek, plaintext, algo);

    // Build canonical sub-document
    // _entity is stored for standalone decryptValue calls (no entityName param needed)
    return {
      _e: 1,
      _k: vaultEntry.activeKid,
      _a: algo,
      _t: typeMarker,
      c: ciphertext,
      _entity: entityName
    };
  }

  /**
   * Decrypt a canonical LCL sub-document back to a JavaScript value.
   *
   * @param {Object|null|undefined} encryptedSubDocument - Sub-document with _e, _k, _t, c markers. Returns null/undefined as-is.
   * @param {string} [entityName] - Entity name. If omitted, uses _entity stored in sub-document.
   * @returns {Promise<*>} Decrypted plaintext value, or null/undefined if input is null/undefined.
   * @throws {Error} If required markers are missing or DEK cannot be resolved.
   */
  async decryptValue(encryptedSubDocument, entityName) {
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

    // Validate _k (kid) marker
    if (!encryptedSubDocument._k) {
      throw new Error('Missing required marker: _k');
    }

    // Validate _t (type) marker
    if (!encryptedSubDocument._t) {
      throw new Error('Missing required marker: _t');
    }

    // Resolve entityName: explicit param takes precedence, then _entity from sub-document
    const resolvedEntity = entityName || encryptedSubDocument._entity;
    if (!resolvedEntity) {
      throw new Error(
        'entityName is required: pass it as the second argument or ensure _entity is present in the sub-document'
      );
    }

    const kid = encryptedSubDocument._k;

    // Resolve DEK by kid via keyVaultService
    const dek = await this._keyVaultService.getDek(resolvedEntity, kid);

    // Determine algorithm
    const algo = encryptedSubDocument._a || this._algorithm;

    // Delegate to FieldCryptoService for decryption and deserialization
    return this._fieldCryptoService.decryptField(encryptedSubDocument, dek, null, algo);
  }

  /**
   * Decrypt all specified encrypted fields in a raw MongoDB document.
   * Mutates the document in-place and returns the same reference.
   *
   * @param {Object}   rawDocument       - Raw document (e.g., from aggregation or db.collection.find()).
   * @param {string}   entityName        - Entity name for DEK resolution.
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

    // Ensure vault is loaded into cache
    await this._keyVaultService.ensureVaultInitialized(entityName);

    for (const fieldName of encryptedFields) {
      const subDoc = rawDocument[fieldName];

      // Skip fields not present or not encrypted sub-documents
      if (!subDoc || typeof subDoc !== 'object' || subDoc._e !== 1) {
        continue;
      }

      rawDocument[fieldName] = await this.decryptValue(subDoc, entityName);
    }

    return rawDocument;
  }
}

module.exports = ProgrammaticCryptoService;

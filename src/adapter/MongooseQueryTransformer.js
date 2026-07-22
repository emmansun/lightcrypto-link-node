'use strict';

const QueryTransformer = require('../spi/QueryTransformer');
const Namespace = require('../namespace/Namespace');

/**
 * MongooseQueryTransformer — QueryTransformer for Mongoose/BSON queries.
 * Rewrites field names to `.b` suffix and values to blind-index hashes.
 */
class MongooseQueryTransformer extends QueryTransformer {
  /**
   * @param {Object} deps - Dependencies
   * @param {import('../crypto/CryptoCodec')} deps.codec - CryptoCodec for blind index generation
   * @param {import('../service/KeyVaultService')} deps.keyVaultService - Key vault service
   * @param {import('../service/TypeSerializer')} deps.serializer - Type serializer
   * @param {string} [deps.entityName] - Entity name for namespace construction
   */
  constructor({ codec, keyVaultService, serializer, entityName } = {}) {
    super();
    this._codec = codec;
    this._keyVaultService = keyVaultService;
    this._serializer = serializer;
    this._entityName = entityName;
  }

  /**
   * Rewrite field name to blind-index path.
   * @param {string} originalField
   * @returns {string}
   */
  rewriteFieldName(originalField) {
    return `${originalField}.b`;
  }

  /**
   * Rewrite a plaintext query value to its blind-index hash.
   * @param {*} plaintextValue
   * @param {string} namespace - Canonical namespace string
   * @param {Object} [options] - Additional options
   * @param {string} [options.fieldName] - Effective field name for isolation
   * @returns {Promise<string>} Base64URL blind index hash
   */
  async rewriteQueryValue(plaintextValue, namespace, options = {}) {
    const ns = Namespace.parse(namespace);
    const canonicalNs = ns.canonical();
    await this._keyVaultService.ensureVaultInitialized(canonicalNs);
    const hmacKey = await this._keyVaultService.getActiveHmacKey(canonicalNs);
    const serialized = this._serializer.serializeToString(plaintextValue);
    const effectiveFieldName = options.fieldName || ns.fieldName;
    return this._codec.generateBlindIndex(hmacKey, ns, effectiveFieldName, serialized);
  }

  /**
   * Check if a field supports blind-index query rewriting.
   * @param {string} field
   * @param {Map<string, Object>} encryptedFields
   * @returns {boolean}
   */
  supportsField(field, encryptedFields) {
    if (!encryptedFields) return false;
    const config = encryptedFields.get(field);
    return config != null && config.blindIndex === true;
  }

  /**
   * Rewrite a full query object for blind-index lookups.
   * Backward-compatible with the old rewriteQuery function.
   * @param {Object} query - Mongoose query filter
   * @param {Map<string, Object>} encryptedFields - Encrypted field configs
   * @returns {Promise<Object>} Rewritten query
   */
  async rewriteQuery(query, encryptedFields) {
    if (!query || typeof query !== 'object') return query;

    const rewritten = { ...query };

    for (const [fieldName, fieldConfig] of encryptedFields) {
      if (rewritten[fieldName] === undefined) continue;

      if (!fieldConfig.blindIndex) {
        throw new Error(
          `Cannot query encrypted field '${fieldName}' without blindIndex: true. ` +
          `Enable blindIndex on this field, or use a backfill migration to re-save existing documents.`
        );
      }

      const effectiveFieldName = fieldConfig.customFieldName || fieldName;
      const value = rewritten[fieldName];

      const ns = Namespace.parse(`${this._entityName}#${effectiveFieldName}`);
      const canonicalNs = ns.canonical();

      await this._keyVaultService.ensureVaultInitialized(canonicalNs);
      const hmacKey = await this._keyVaultService.getActiveHmacKey(canonicalNs);

      if (typeof value === 'object' && value !== null && !Buffer.isBuffer(value)) {
        if (value.$in && Array.isArray(value.$in)) {
          const indexes = value.$in.map(v => {
            const serialized = this._serializer.serializeToString(v);
            return this._codec.generateBlindIndex(hmacKey, ns, effectiveFieldName, serialized);
          });
          rewritten[`${fieldName}.b`] = { $in: indexes };
          delete rewritten[fieldName];
          continue;
        }
        if (value.$gt !== undefined || value.$lt !== undefined ||
            value.$gte !== undefined || value.$lte !== undefined) {
          continue;
        }
      }

      const serialized = this._serializer.serializeToString(value);
      const blindIndex = this._codec.generateBlindIndex(hmacKey, ns, effectiveFieldName, serialized);
      rewritten[`${fieldName}.b`] = blindIndex;
      delete rewritten[fieldName];
    }

    return rewritten;
  }
}

module.exports = MongooseQueryTransformer;

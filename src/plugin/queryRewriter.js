'use strict';

const Namespace = require('../namespace/Namespace');

/**
 * queryRewriter - Intercepts Mongoose find() queries and rewrites
 * field name conditions to blind index conditions for encrypted fields.
 *
 * Throws an error when a query targets an encrypted field that does not
 * have blindIndex enabled (matching Java's UnsupportedOperationException).
 */

/**
 * Rewrite a query object to use blind index fields for encrypted fields.
 * Uses per-field HMAC keys for blind index computation.
 *
 * @param {Object} query - Mongoose query filter
 * @param {Map<string, Object>} encryptedFields - Map of field name to field config
 * @param {import('../crypto/CryptoCodec')} codec - CryptoCodec instance for blind index generation
 * @param {import('../service/KeyVaultService')} keyVaultService - KeyVaultService for per-field HMAC key resolution
 * @param {import('../service/TypeSerializer')} serializer - Type serializer
 * @param {string} [entityName] - Entity name for namespace construction
 * @returns {Promise<Object>} Rewritten query
 * @throws {Error} If query targets an encrypted field without blindIndex
 */
async function rewriteQuery(query, encryptedFields, codec, keyVaultService, serializer, entityName) {
  if (!query || typeof query !== 'object') {
    return query;
  }

  const rewritten = { ...query };

  for (const [fieldName, fieldConfig] of encryptedFields) {
    // Check if query references this encrypted field
    if (rewritten[fieldName] === undefined) continue;

    // Encrypted field without blindIndex → cannot query (matches Java behavior)
    if (!fieldConfig.blindIndex) {
      throw new Error(
        `Cannot query encrypted field '${fieldName}' without blindIndex: true. ` +
        `Enable blindIndex on this field, or use a backfill migration to re-save existing documents.`
      );
    }

    const effectiveFieldName = fieldConfig.customFieldName || fieldName;
    const value = rewritten[fieldName];

    // Construct canonical namespace for this field
    const ns = Namespace.parse(`${entityName}#${effectiveFieldName}`);
    const canonicalNs = ns.canonical();

    // Get per-field HMAC key
    await keyVaultService.ensureVaultInitialized(canonicalNs);
    const hmacKey = await keyVaultService.getActiveHmacKey(canonicalNs);

    if (typeof value === 'object' && value !== null && !Buffer.isBuffer(value)) {
      // Handle $in operator
      if (value.$in && Array.isArray(value.$in)) {
        const indexes = value.$in.map(v => {
          const serialized = serializer.serializeToString(v);
          return codec.generateBlindIndex(hmacKey, ns, effectiveFieldName, serialized);
        });
        rewritten[`${fieldName}.b`] = { $in: indexes };
        delete rewritten[fieldName];
        continue;
      }
      // Don't rewrite range operators ($gt, $lt, $gte, $lte)
      if (value.$gt !== undefined || value.$lt !== undefined ||
          value.$gte !== undefined || value.$lte !== undefined) {
        continue;
      }
    }

    // Exact match rewrite
    const serialized = serializer.serializeToString(value);
    const blindIndex = codec.generateBlindIndex(hmacKey, ns, effectiveFieldName, serialized);
    rewritten[`${fieldName}.b`] = blindIndex;
    delete rewritten[fieldName];
  }

  return rewritten;
}

module.exports = { rewriteQuery };

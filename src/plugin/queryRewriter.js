'use strict';

/**
 * queryRewriter - Intercepts Mongoose find() queries and rewrites
 * field name conditions to blind index conditions for encrypted fields.
 *
 * Throws an error when a query targets an encrypted field that does not
 * have blindIndex enabled (matching Java's UnsupportedOperationException).
 */

/**
 * Rewrite a query object to use blind index fields for encrypted fields.
 * @param {Object} query - Mongoose query filter
 * @param {Map<string, Object>} encryptedFields - Map of field name to field config
 * @param {CryptoCodec} codec - CryptoCodec instance for blind index generation
 * @param {Buffer} hmacKey - HMAC key
 * @param {TypeSerializer} serializer - Type serializer
 * @returns {Object} Rewritten query
 * @throws {Error} If query targets an encrypted field without blindIndex
 */
function rewriteQuery(query, encryptedFields, codec, hmacKey, serializer) {
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

    if (typeof value === 'object' && value !== null && !Buffer.isBuffer(value)) {
      // Handle $in operator
      if (value.$in && Array.isArray(value.$in)) {
        const indexes = value.$in.map(v => {
          const serialized = serializer.serializeToString(v);
          return codec.generateBlindIndex(hmacKey, effectiveFieldName, serialized);
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
    const blindIndex = codec.generateBlindIndex(hmacKey, effectiveFieldName, serialized);
    rewritten[`${fieldName}.b`] = blindIndex;
    delete rewritten[fieldName];
  }

  return rewritten;
}

module.exports = { rewriteQuery };

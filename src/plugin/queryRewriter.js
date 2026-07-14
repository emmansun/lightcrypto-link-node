'use strict';

/**
 * queryRewriter - Intercepts Mongoose find() queries and rewrites
 * field name conditions to blind index conditions for encrypted fields.
 */

/**
 * Rewrite a query object to use blind index fields for encrypted fields.
 * @param {Object} query - Mongoose query filter
 * @param {Map<string, Object>} encryptedFields - Map of field name to field config
 * @param {CryptoCodec} codec - CryptoCodec instance for blind index generation
 * @param {Buffer} hmacKey - HMAC key
 * @param {TypeSerializer} serializer - Type serializer
 * @returns {Object} Rewritten query
 */
function rewriteQuery(query, encryptedFields, codec, hmacKey, serializer) {
  if (!query || typeof query !== 'object') {
    return query;
  }

  const rewritten = { ...query };

  for (const [fieldName, fieldConfig] of encryptedFields) {
    if (!fieldConfig.blindIndex) continue;

    const effectiveFieldName = fieldConfig.customFieldName || fieldName;

    // Check for direct value match
    if (rewritten[fieldName] !== undefined) {
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
  }

  return rewritten;
}

module.exports = { rewriteQuery };

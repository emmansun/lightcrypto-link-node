'use strict';

const MongooseQueryTransformer = require('../adapter/MongooseQueryTransformer');
const TypeSerializer = require('../service/TypeSerializer');

/**
 * queryRewriter - Intercepts Mongoose find() queries and rewrites
 * field name conditions to blind index conditions for encrypted fields.
 *
 * Backward-compatible wrapper over MongooseQueryTransformer.
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
  const transformer = new MongooseQueryTransformer({
    codec,
    keyVaultService,
    serializer: serializer || new TypeSerializer(),
    entityName
  });
  return transformer.rewriteQuery(query, encryptedFields);
}

module.exports = { rewriteQuery };

'use strict';

const { FieldCryptoService } = require('../service/FieldCryptoService');
const CryptoCodec = require('../crypto/CryptoCodec');
const TypeSerializer = require('../service/TypeSerializer');
const { rewriteQuery } = require('./queryRewriter');

/**
 * Preprocess schema definition to handle Mongoose 9's built-in `encrypt` option conflict.
 *
 * Mongoose 9 introduced native CSFLE support where `encrypt: true` is a reserved option.
 * This helper strips `encrypt`/`blindIndex` from schema definitions before Mongoose sees them,
 * storing them in a `_lclFieldOptions` map that the plugin can read later.
 *
 * Usage (Mongoose 9 compatible):
 *   const { prepareEncryptedSchema } = require('lightcrypto-link-node');
 *   const definition = prepareEncryptedSchema({
 *     name: String,
 *     phone: { type: String, encrypt: true, blindIndex: true },
 *     ssn: { type: String, encrypt: true }
 *   });
 *   const schema = new mongoose.Schema(definition);
 *   schema.plugin(lclCryptoPlugin, { keyVaultService, entityName: 'User' });
 *
 * @param {Object} definition - Schema definition object
 * @returns {Object} Processed definition safe for new mongoose.Schema()
 */
function prepareEncryptedSchema(definition) {
  const options = {};
  const processed = {};

  for (const [pathName, pathDef] of Object.entries(definition)) {
    if (
      pathDef &&
      typeof pathDef === 'object' &&
      !Array.isArray(pathDef) &&
      (pathDef.encrypt === true || pathDef.blindIndex === true)
    ) {
      options[pathName] = {
        encrypt: pathDef.encrypt === true,
        blindIndex: pathDef.blindIndex === true,
        fieldName: pathDef.fieldName
      };

      const { encrypt, blindIndex, fieldName, ...rest } = pathDef;
      processed[pathName] = rest;
    } else {
      processed[pathName] = pathDef;
    }
  }

  // Attach as non-enumerable property so Mongoose Schema constructor ignores it
  Object.defineProperty(processed, '_lclFieldOptions', {
    value: options,
    enumerable: false,
    writable: true,
    configurable: true
  });

  return processed;
}

/**
 * Mongoose plugin for transparent field-level encryption.
 *
 * Usage (Mongoose 9 compatible — use prepareEncryptedSchema helper):
 *   const { lclCryptoPlugin, prepareEncryptedSchema } = require('lightcrypto-link-node');
 *   const definition = prepareEncryptedSchema({
 *     phone: { type: String, encrypt: true, blindIndex: true },
 *     ssn: { type: String, encrypt: true }
 *   });
 *   const schema = new mongoose.Schema(definition);
 *   schema.plugin(lclCryptoPlugin, { keyVaultService, entityName: 'User' });
 *
 * @param {mongoose.Schema} schema - Mongoose schema
 * @param {Object} options - Plugin options
 * @param {KeyVaultService} options.keyVaultService - Key vault service instance
 * @param {string} [options.entityName] - Entity name (defaults to model name)
 * @param {string} [options.algorithm='AES_256_GCM'] - Default encryption algorithm
 */
function lclCryptoPlugin(schema, options) {
  const keyVaultService = options.keyVaultService;
  const entityName = options.entityName;
  const algorithm = options.algorithm || 'AES_256_GCM';
  const fieldCryptoService = new FieldCryptoService();
  const codec = new CryptoCodec();
  const serializer = new TypeSerializer();

  // Collect encrypted fields from schema
  // Priority 1: _lclFieldOptions set by prepareEncryptedSchema() helper
  // Priority 2: custom option keys (lclEncrypt / lclBlindIndex) for advanced users
  const encryptedFields = new Map();

  // Mongoose stores the definition object as schema.obj, which retains our non-enumerable property
  const lclOptions = (schema.obj && schema.obj._lclFieldOptions) || {};
  for (const [pathName, opts] of Object.entries(lclOptions)) {
    if (opts.encrypt) {
      const schemaType = schema.path(pathName);
      encryptedFields.set(pathName, {
        encrypt: true,
        blindIndex: opts.blindIndex === true,
        customFieldName: opts.fieldName,
        mongooseType: schemaType ? schemaType.instance : 'String'
      });
    }
  }

  // Also support lclEncrypt/lclBlindIndex custom options (alternative syntax)
  schema.eachPath((pathName, schemaType) => {
    if (encryptedFields.has(pathName)) return; // Already processed
    const opts = schemaType.options;
    if (opts && opts.lclEncrypt) {
      encryptedFields.set(pathName, {
        encrypt: true,
        blindIndex: opts.lclBlindIndex === true,
        customFieldName: opts.lclFieldName,
        mongooseType: schemaType.instance
      });
    }
  });

  if (encryptedFields.size === 0) {
    return; // No encrypted fields, skip plugin setup
  }

  // Store encrypted field info on schema for query rewriter access
  schema._lclEncryptedFields = encryptedFields;

  // Transform schema: change encrypted fields to Mixed type to store sub-documents
  for (const [pathName] of encryptedFields) {
    schema.path(pathName, { type: Object });
  }

  /**
   * Pre-save hook: encrypt marked fields before persistence.
   */
  schema.pre('save', async function () {
    const resolvedEntityName = entityName || this.constructor.modelName;
    const vaultEntry = await keyVaultService.ensureVaultInitialized(resolvedEntityName);

    for (const [pathName, fieldConfig] of encryptedFields) {
      const value = this.get(pathName);
      if (value === null || value === undefined) continue;

      // Skip if already encrypted (has _e marker)
      if (typeof value === 'object' && value._e === 1) continue;

      const encrypted = fieldCryptoService.encryptField(
        value,
        pathName,
        vaultEntry.dek,
        vaultEntry.hmacKey,
        vaultEntry.activeKid,
        algorithm,
        {
          blindIndex: fieldConfig.blindIndex,
          mongooseType: fieldConfig.mongooseType,
          customFieldName: fieldConfig.customFieldName
        }
      );

      this.set(pathName, encrypted);
    }
  });

  /**
   * Post-find hook: decrypt encrypted sub-documents after retrieval.
   */
  schema.post('find', async function (docs) {
    if (!docs || docs.length === 0) return;

    for (const doc of docs) {
      await decryptDocument(doc);
    }
  });

  /**
   * Post-findOne hook: decrypt encrypted sub-documents after single document retrieval.
   */
  schema.post('findOne', async function (doc) {
    if (!doc) return;
    await decryptDocument(doc);
  });

  /**
   * Pre-find hook: rewrite query for blind index support.
   */
  schema.pre('find', async function () {
    const resolvedEntityName = entityName || this.model.modelName;
    const vaultEntry = await keyVaultService.ensureVaultInitialized(resolvedEntityName);

    const query = this.getQuery();
    const rewrittenQuery = rewriteQuery(query, encryptedFields, codec, vaultEntry.hmacKey, serializer);
    this.setQuery(rewrittenQuery);
  });

  /**
   * Pre-findOne hook: rewrite query for blind index support.
   */
  schema.pre('findOne', async function () {
    const resolvedEntityName = entityName || this.model.modelName;
    const vaultEntry = await keyVaultService.ensureVaultInitialized(resolvedEntityName);

    const query = this.getQuery();
    const rewrittenQuery = rewriteQuery(query, encryptedFields, codec, vaultEntry.hmacKey, serializer);
    this.setQuery(rewrittenQuery);
  });

  /**
   * Decrypt all encrypted fields in a document.
   * Supports backward compatibility: uses each sub-document's `_k` (kid) to resolve the correct DEK.
   * @param {mongoose.Document} doc
   */
  async function decryptDocument(doc) {
    if (!doc) return;
    const resolvedEntityName = entityName || doc.constructor.modelName;

    // Ensure vault is initialized (loads keys into cache)
    await keyVaultService.ensureVaultInitialized(resolvedEntityName);

    for (const [pathName] of encryptedFields) {
      const subDoc = doc.get(pathName);
      if (!subDoc || typeof subDoc !== 'object' || subDoc._e !== 1) continue;

      // Use sub-document's kid to resolve the correct DEK (supports key rotation)
      const kid = subDoc._k;
      const dek = await keyVaultService.getDek(resolvedEntityName, kid);
      const hmacKey = await keyVaultService.getHmacKey(resolvedEntityName, kid);

      const decrypted = fieldCryptoService.decryptField(subDoc, dek, hmacKey, algorithm);
      doc.set(pathName, decrypted);
    }
  }
}

module.exports = { lclCryptoPlugin, prepareEncryptedSchema };

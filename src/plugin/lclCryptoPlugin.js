'use strict';

const { FieldCryptoService } = require('../service/FieldCryptoService');
const KeyVaultService = require('../service/KeyVaultService');
const MongoVaultStore = require('../adapter/MongoVaultStore');
const CryptoCodec = require('../crypto/CryptoCodec');
const TypeSerializer = require('../service/TypeSerializer');
const Namespace = require('../namespace/Namespace');
const WireFormatDecoder = require('../format/WireFormatDecoder');
const MongooseStorageAdapter = require('../adapter/MongooseStorageAdapter');
const BsonStructuredValueCodec = require('../adapter/BsonStructuredValueCodec');
const MongooseQueryTransformer = require('../adapter/MongooseQueryTransformer');

/**
 * Check if a value is a mongoose Schema instance.
 */
function isSchemaInstance(val) {
  return val && typeof val === 'object' && typeof val.path === 'function' && typeof val.eachPath === 'function';
}

/**
 * Determine the structuredType for an encrypted field based on its original definition.
 * @returns {string|null} 'DOC', 'COL', or null (scalar)
 */
function resolveStructuredType(pathDef) {
  if (!pathDef || typeof pathDef !== 'object') return null;

  // Shorthand array: [Type], [Schema], [{...}]
  if (Array.isArray(pathDef)) {
    return 'COL';
  }

  const typeValue = pathDef.type;
  if (typeValue == null) return null;

  // Longhand array: { type: [...] }
  if (Array.isArray(typeValue)) {
    return 'COL';
  }

  // Schema instance: { type: someSchema }
  if (isSchemaInstance(typeValue)) {
    return 'DOC';
  }

  // Nested object definition: { type: { street: String, ... } }
  if (
    typeof typeValue === 'object' &&
    typeValue.constructor === Object &&
    Object.keys(typeValue).length > 0
  ) {
    return 'DOC';
  }

  return null;
}

/**
 * Resolve the effective encryption mode based on field type and user-specified mode.
 * Returns: 'WHOLE_OBJECT', 'WHOLE_ARRAY', 'ELEMENT', or null (scalar/field-level)
 */
function resolveMode(structuredType, mode) {
  const effectiveMode = mode || 'AUTO';

  if (structuredType === 'DOC') {
    // POJO/sub-document: AUTO → WHOLE_OBJECT, ELEMENT → error, WHOLE → WHOLE_OBJECT
    if (effectiveMode === 'ELEMENT') {
      throw new Error('EncryptionMode ELEMENT is not supported for sub-document (DOC) fields');
    }
    return 'WHOLE_OBJECT';
  }

  if (structuredType === 'COL') {
    // Array: need to determine based on element type and mode
    // AUTO: element-level for scalar arrays, WHOLE_ARRAY for sub-doc arrays
    // ELEMENT: element-level (reject sub-doc arrays)
    // WHOLE: WHOLE_ARRAY for all arrays
    if (effectiveMode === 'WHOLE') {
      return 'WHOLE_ARRAY';
    }
    if (effectiveMode === 'ELEMENT') {
      return 'ELEMENT';
    }
    // AUTO — the caller needs to inspect element type to decide
    return 'AUTO_ARRAY';
  }

  return null; // scalar
}

/**
 * Check if an array definition contains sub-document elements (Schema or object definition).
 */
function isSubDocArray(pathDef) {
  let arrDef;
  if (Array.isArray(pathDef)) {
    arrDef = pathDef;
  } else if (pathDef && Array.isArray(pathDef.type)) {
    arrDef = pathDef.type;
  } else {
    return false;
  }

  if (arrDef.length === 0) return false;
  const elem = arrDef[0];
  if (isSchemaInstance(elem)) return true;
  if (elem && typeof elem === 'object' && elem.constructor === Object) return true;
  return false;
}

/**
 * Strip encrypt/blindIndex/mode from a nested definition recursively.
 * Collects nested encrypted field info into the options map.
 *
 * @param {Object} def - Nested definition (object or array element definition)
 * @param {string} parentPath - Parent path (e.g., 'address' or 'items')
 * @param {Object} options - The _lclFieldOptions map to collect nested field info into
 * @returns {Object|Array} Cleaned definition safe for Mongoose
 */
function stripNestedEncryptOptions(def, parentPath, options, isArrayElement = false) {
  if (Array.isArray(def)) {
    // Array element definition — check each element
    return def.map((elem, idx) => {
      if (elem && typeof elem === 'object' && elem.constructor === Object && !isSchemaInstance(elem)) {
        return stripNestedEncryptOptions(elem, parentPath, options, true);
      }
      return elem;
    });
  }

  if (!def || typeof def !== 'object' || isSchemaInstance(def)) {
    return def;
  }

  // Check if `type` is a nested object definition
  const typeValue = def.type;
  if (
    typeValue &&
    typeof typeValue === 'object' &&
    !Array.isArray(typeValue) &&
    !isSchemaInstance(typeValue) &&
    typeValue.constructor === Object
  ) {
    // Scan nested fields for encrypt: true
    const cleaned = {};
    for (const [key, val] of Object.entries(typeValue)) {
      if (
        val &&
        typeof val === 'object' &&
        !Array.isArray(val) &&
        !isSchemaInstance(val) &&
        (val.encrypt === true || val.blindIndex === true)
      ) {
        // Found a nested encrypted field
        const nestedPath = `${parentPath}.${key}`;
        options[nestedPath] = {
          encrypt: val.encrypt === true,
          blindIndex: val.blindIndex === true,
          fieldName: val.fieldName,
          mode: val.mode,
          structuredType: null,
          isNested: true,
          isArrayElement,
          parentPath,
          leafField: key
        };

        // Strip encrypt options from the nested field
        const { encrypt, blindIndex, fieldName, mode, ...rest } = val;
        cleaned[key] = rest;
      } else {
        cleaned[key] = val;
      }
    }
    return { ...def, type: cleaned };
  }

  // Check if `type` is an array (array of sub-documents with nested encrypted fields)
  if (typeValue && Array.isArray(typeValue) && typeValue.length > 0) {
    const elem = typeValue[0];
    if (elem && typeof elem === 'object' && elem.constructor === Object && !isSchemaInstance(elem)) {
      // Scan array element fields for encrypt: true
      const cleanedElem = {};
      for (const [key, val] of Object.entries(elem)) {
        if (
          val &&
          typeof val === 'object' &&
          !Array.isArray(val) &&
          !isSchemaInstance(val) &&
          (val.encrypt === true || val.blindIndex === true)
        ) {
          // Found a nested encrypted field inside array element
          const nestedPath = `${parentPath}.${key}`;
          options[nestedPath] = {
            encrypt: val.encrypt === true,
            blindIndex: val.blindIndex === true,
            fieldName: val.fieldName,
            mode: val.mode,
            structuredType: null,
            isNested: true,
            isArrayElement: true,
            parentPath,
            leafField: key
          };

          const { encrypt, blindIndex, fieldName, mode, ...rest } = val;
          cleanedElem[key] = rest;
        } else {
          cleanedElem[key] = val;
        }
      }
      return { ...def, type: [cleanedElem, ...typeValue.slice(1)] };
    }
  }

  // Shorthand nested object: { street: { type: String, encrypt: true }, city: String }
  // (no `type` wrapper — the whole def is the nested object)
  if (!def.type && Object.keys(def).length > 0) {
    const cleaned = {};
    for (const [key, val] of Object.entries(def)) {
      if (
        val &&
        typeof val === 'object' &&
        !Array.isArray(val) &&
        !isSchemaInstance(val) &&
        (val.encrypt === true || val.blindIndex === true)
      ) {
        const nestedPath = `${parentPath}.${key}`;
        options[nestedPath] = {
          encrypt: val.encrypt === true,
          blindIndex: val.blindIndex === true,
          fieldName: val.fieldName,
          mode: val.mode,
          structuredType: null,
          isNested: true,
          isArrayElement,
          parentPath,
          leafField: key
        };

        const { encrypt, blindIndex, fieldName, mode, ...rest } = val;
        cleaned[key] = rest;
      } else {
        cleaned[key] = val;
      }
    }
    return cleaned;
  }

  return def;
}

/**
 * Preprocess schema definition to handle Mongoose 9's built-in `encrypt` option conflict.
 *
 * Mongoose 9 introduced native CSFLE support where `encrypt: true` is a reserved option.
 * This helper strips `encrypt`/`blindIndex`/`mode` from schema definitions before Mongoose sees them,
 * storing them in a `_lclFieldOptions` map that the plugin can read later.
 *
 * Supports:
 * - Scalar fields: `{ type: String, encrypt: true, blindIndex: true }`
 * - Sub-document fields: `{ type: addressSchema, encrypt: true }` or `{ type: { street: String }, encrypt: true }`
 * - Array fields: `{ type: [String], encrypt: true }` or `[String]` shorthand with encrypt
 * - Nested encrypted fields inside sub-documents and arrays
 * - `mode` option: `'AUTO'` (default), `'ELEMENT'`, `'WHOLE'`
 *
 * @param {Object} definition - Schema definition object
 * @returns {Object} Processed definition safe for new mongoose.Schema()
 */
function prepareEncryptedSchema(definition) {
  const options = {};
  const processed = {};

  for (const [pathName, pathDef] of Object.entries(definition)) {
    // Case 1: Shorthand array with encrypt — e.g., `tags: [String]` with encrypt in the array
    if (
      Array.isArray(pathDef) &&
      pathDef.encrypt === true
    ) {
      options[pathName] = {
        encrypt: true,
        blindIndex: pathDef.blindIndex === true,
        fieldName: pathDef.fieldName,
        mode: pathDef.mode,
        structuredType: 'COL',
        isSubDocArray: isSubDocArray(pathDef)
      };

      // Keep the array elements (shorthand) for Mongoose, stripping custom props
      const arr = pathDef.filter(() => true);
      processed[pathName] = arr;
      continue;
    }

    // Case 2: Object with encrypt/blindIndex (covers scalars, sub-docs, arrays)
    if (
      pathDef &&
      typeof pathDef === 'object' &&
      !Array.isArray(pathDef) &&
      (pathDef.encrypt === true || pathDef.blindIndex === true)
    ) {
      // Determine structured type BEFORE transforming the definition
      const structuredType = resolveStructuredType(pathDef);

      options[pathName] = {
        encrypt: pathDef.encrypt === true,
        blindIndex: pathDef.blindIndex === true,
        fieldName: pathDef.fieldName,
        mode: pathDef.mode,
        structuredType,
        isSubDocArray: structuredType === 'COL' ? isSubDocArray(pathDef) : false
      };

      const { encrypt, blindIndex, fieldName, mode, ...rest } = pathDef;

      // Check if the type is a nested object definition (not a constructor reference)
      // For encrypted nested objects, replace with Mixed so the entire value is stored as one blob
      if (
        rest.type &&
        typeof rest.type === 'object' &&
        !Array.isArray(rest.type) &&
        !isSchemaInstance(rest.type) &&
        rest.type.constructor === Object
      ) {
        processed[pathName] = Object;
      } else {
        processed[pathName] = rest;
      }
    } else {
      // No top-level encrypt — but scan for nested encrypted fields
      processed[pathName] = stripNestedEncryptOptions(pathDef, pathName, options);
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
 * @param {mongoose.Schema} schema - Mongoose schema
 * @param {Object} options - Plugin options
 * @param {KeyVaultService} options.keyVaultService - Key vault service instance
 * @param {string} [options.entityName] - Entity name (defaults to model name)
 * @param {string} [options.algorithm='AES_256_GCM'] - Default encryption algorithm
 */
function lclCryptoPlugin(schema, options) {
  // Resolve keyVaultService from options:
  // 1. If keyVaultService is provided directly, use it
  // 2. If vaultStore is provided, construct KeyVaultService
  // 3. If connection is provided, extract native client and construct MongoVaultStore + KeyVaultService
  // 4. Throw if none of the above
  let keyVaultService = options.keyVaultService;

  if (!keyVaultService) {
    let vaultStore = options.vaultStore;

    if (!vaultStore && options.connection) {
      // Extract native MongoClient from Mongoose Connection
      const client = options.connection.getClient();
      const db = client.db(options.connection.name);
      vaultStore = new MongoVaultStore(db);
    }

    if (!vaultStore) {
      throw new Error(
        'lclCryptoPlugin requires one of: keyVaultService, vaultStore, or connection. ' +
        'Provide a KeyVaultService instance, a VaultStore implementation, or a Mongoose Connection.'
      );
    }

    if (!options.cmkProvider) {
      throw new Error('lclCryptoPlugin requires cmkProvider when constructing KeyVaultService from vaultStore or connection');
    }

    keyVaultService = new KeyVaultService({
      vaultStore,
      cmkProvider: options.cmkProvider,
      cacheTtl: options.cacheTtl
    });
  }
  const entityName = options.entityName;
  const algorithm = options.algorithm || 'AES_256_GCM';

  // SPI implementations — accept overrides or use Mongoose/BSON defaults
  const storageAdapter = options.storageAdapter || new MongooseStorageAdapter();
  const structuredValueCodec = options.structuredValueCodec || new BsonStructuredValueCodec();

  const fieldCryptoService = new FieldCryptoService({
    storageAdapter,
    structuredValueCodec
  });
  const codec = new CryptoCodec();
  const serializer = new TypeSerializer();

  // Query transformer for blind-index rewriting
  const queryTransformer = new MongooseQueryTransformer({
    codec,
    keyVaultService,
    serializer,
    entityName
  });

  // Collect encrypted fields from schema
  // Priority 1: _lclFieldOptions set by prepareEncryptedSchema() helper
  // Priority 2: custom option keys (lclEncrypt / lclBlindIndex) for advanced users
  const encryptedFields = new Map();

  // Get original definition for type inspection
  const originalDefinition = schema.obj || {};

  // Mongoose stores the definition object as schema.obj, which retains our non-enumerable property
  const lclOptions = (schema.obj && schema.obj._lclFieldOptions) || {};
  for (const [pathName, opts] of Object.entries(lclOptions)) {
    if (opts.encrypt) {
      // Nested encrypted field (inside sub-document or array element)
      if (opts.isNested) {
        const parentSchemaType = schema.path(opts.parentPath);
        const leafSchemaType = schema.path(pathName);
        encryptedFields.set(pathName, {
          encrypt: true,
          blindIndex: opts.blindIndex === true,
          customFieldName: opts.fieldName,
          mongooseType: leafSchemaType ? leafSchemaType.instance : 'String',
          structuredType: null,
          mode: null,
          isNested: true,
          isArrayElement: opts.isArrayElement === true,
          parentPath: opts.parentPath,
          leafField: opts.leafField
        });
        continue;
      }

      const schemaType = schema.path(pathName);

      // Use pre-computed structuredType from prepareEncryptedSchema
      const structuredType = opts.structuredType || resolveStructuredType(originalDefinition[pathName]);

      // Resolve mode
      const mode = resolveMode(structuredType, opts.mode);

      // For AUTO_ARRAY, determine based on element type
      let effectiveMode = mode;
      if (mode === 'AUTO_ARRAY') {
        const subDocArr = opts.isSubDocArray || isSubDocArray(originalDefinition[pathName]);
        effectiveMode = subDocArr ? 'WHOLE_ARRAY' : 'ELEMENT';
      }

      // Validate: blindIndex + whole-object/whole-array → error
      if (opts.blindIndex && (effectiveMode === 'WHOLE_OBJECT' || effectiveMode === 'WHOLE_ARRAY')) {
        throw new Error(
          `blindIndex: true is not supported for whole-${effectiveMode === 'WHOLE_OBJECT' ? 'object' : 'array'} encrypted field '${pathName}'`
        );
      }

      // Validate: ELEMENT mode on sub-doc array → error
      const isSubDocArr = opts.isSubDocArray || isSubDocArray(originalDefinition[pathName]);
      if (effectiveMode === 'ELEMENT' && isSubDocArr) {
        throw new Error(
          `EncryptionMode ELEMENT is not supported for sub-document array field '${pathName}'`
        );
      }

      encryptedFields.set(pathName, {
        encrypt: true,
        blindIndex: opts.blindIndex === true,
        customFieldName: opts.fieldName,
        mongooseType: schemaType ? schemaType.instance : 'String',
        structuredType,
        mode: effectiveMode
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
        mongooseType: schemaType.instance,
        structuredType: null,
        mode: null
      });
    }
  });

  if (encryptedFields.size === 0) {
    return; // No encrypted fields, skip plugin setup
  }

  // Store encrypted field info on schema for query rewriter access
  schema._lclEncryptedFields = encryptedFields;

  // Transform schema: change encrypted fields to Mixed type to store sub-documents
  for (const [pathName, fieldConfig] of encryptedFields) {
    if (fieldConfig.isNested && fieldConfig.isArrayElement) {
      // For nested fields inside array elements, transform the path in the array's sub-schema
      const arraySchemaType = schema.path(fieldConfig.parentPath);
      if (arraySchemaType && arraySchemaType.schema) {
        arraySchemaType.schema.path(fieldConfig.leafField, { type: Object });
      }
    } else {
      schema.path(pathName, { type: Object });
    }
  }

  /**
   * Pre-save hook: encrypt marked fields before persistence.
   * Per-field vault routing: each encrypted field gets its own vault/DEK.
   */
  schema.pre('save', async function () {
    const resolvedEntityName = entityName || this.constructor.modelName;

    for (const [pathName, fieldConfig] of encryptedFields) {
      // Construct per-field canonical namespace and ensure vault is initialized
      const fieldNamespace = Namespace.parse(`${resolvedEntityName}#${fieldConfig.customFieldName || pathName}`);
      const canonicalNs = fieldNamespace.canonical();
      await keyVaultService.ensureVaultInitialized(canonicalNs);
      const activeKid = await keyVaultService.getActiveKid(canonicalNs);
      const dekVersion = await keyVaultService.getActiveDekVersion(canonicalNs);
      const dek = await keyVaultService.getDek(activeKid);
      const hmacKey = await keyVaultService.getHmacKey(activeKid);

      // Nested encrypted field inside sub-document
      if (fieldConfig.isNested && !fieldConfig.isArrayElement) {
        const parentValue = this.get(fieldConfig.parentPath);
        if (!parentValue || typeof parentValue !== 'object') continue;

        const leafValue = parentValue[fieldConfig.leafField];
        if (leafValue === null || leafValue === undefined) continue;
        if (typeof leafValue === 'object' && leafValue._e === 1) continue;

        const encrypted = fieldCryptoService.encryptField(
          leafValue,
          pathName,
          dek,
          hmacKey,
          activeKid,
          algorithm,
          {
            blindIndex: false,
            mongooseType: fieldConfig.mongooseType,
            customFieldName: fieldConfig.customFieldName,
            namespace: fieldNamespace,
            dekVersion: dekVersion
          }
        );

        parentValue[fieldConfig.leafField] = encrypted;
        this.markModified(fieldConfig.parentPath);
        continue;
      }

      // Nested encrypted field inside array elements (LIST_ITER + FIELD)
      if (fieldConfig.isNested && fieldConfig.isArrayElement) {
        const arrayValue = this.get(fieldConfig.parentPath);
        if (!Array.isArray(arrayValue)) continue;

        for (let i = 0; i < arrayValue.length; i++) {
          const elem = arrayValue[i];
          if (!elem || typeof elem !== 'object') continue;
          const leafValue = elem[fieldConfig.leafField];
          if (leafValue === null || leafValue === undefined) continue;
          if (typeof leafValue === 'object' && leafValue._e === 1) continue;

          const encrypted = fieldCryptoService.encryptField(
            leafValue,
            pathName,
            dek,
            hmacKey,
            activeKid,
            algorithm,
            {
              blindIndex: false,
              mongooseType: fieldConfig.mongooseType,
              customFieldName: fieldConfig.customFieldName,
              namespace: fieldNamespace,
              dekVersion: dekVersion
            }
          );
          elem[fieldConfig.leafField] = encrypted;
        }
        this.markModified(fieldConfig.parentPath);
        continue;
      }

      const value = this.get(pathName);
      if (value === null || value === undefined) continue;

      // Skip if already encrypted (has _e marker)
      if (typeof value === 'object' && value._e === 1) continue;

      // Element-level encryption: iterate over array elements
      if (fieldConfig.mode === 'ELEMENT' && Array.isArray(value)) {
        const encryptedArray = [];
        for (const elem of value) {
          if (elem === null || elem === undefined) {
            encryptedArray.push(elem);
            continue;
          }
          if (typeof elem === 'object' && elem._e === 1) {
            encryptedArray.push(elem);
            continue;
          }
          const encrypted = fieldCryptoService.encryptField(
            elem,
            pathName,
            dek,
            hmacKey,
            activeKid,
            algorithm,
            {
              blindIndex: false,
              mongooseType: fieldConfig.mongooseType,
              customFieldName: fieldConfig.customFieldName,
              namespace: fieldNamespace,
              dekVersion: dekVersion
            }
          );
          encryptedArray.push(encrypted);
        }
        this.set(pathName, encryptedArray);
        continue;
      }

      const encryptOptions = {
        blindIndex: fieldConfig.blindIndex,
        mongooseType: fieldConfig.mongooseType,
        customFieldName: fieldConfig.customFieldName,
        namespace: fieldNamespace,
        dekVersion: dekVersion
      };

      // Pass structuredType for whole-object/whole-array encryption
      if (fieldConfig.mode === 'WHOLE_OBJECT' && fieldConfig.structuredType === 'DOC') {
        encryptOptions.structuredType = 'DOC';
      } else if (fieldConfig.mode === 'WHOLE_ARRAY' && fieldConfig.structuredType === 'COL') {
        encryptOptions.structuredType = 'COL';
      }

      const encrypted = fieldCryptoService.encryptField(
        value,
        pathName,
        dek,
        hmacKey,
        activeKid,
        algorithm,
        encryptOptions
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
    const query = this.getQuery();
    const rewrittenQuery = await queryTransformer.rewriteQuery(query, encryptedFields);
    this.setQuery(rewrittenQuery);
  });

  /**
   * Pre-findOne hook: rewrite query for blind index support.
   */
  schema.pre('findOne', async function () {
    const query = this.getQuery();
    const rewrittenQuery = await queryTransformer.rewriteQuery(query, encryptedFields);
    this.setQuery(rewrittenQuery);
  });

  /**
   * Decrypt all encrypted fields in a document.
   * Per-field vault routing: decrypts each field using Wire Format blob's namespace + dekVersion.
   * @param {mongoose.Document} doc
   */
  async function decryptDocument(doc) {
    if (!doc) return;

    for (const [pathName, fieldConfig] of encryptedFields) {
      // Nested encrypted field inside sub-document
      if (fieldConfig.isNested && !fieldConfig.isArrayElement) {
        const parentValue = doc.get(fieldConfig.parentPath);
        if (!parentValue || typeof parentValue !== 'object') continue;

        const leafValue = parentValue[fieldConfig.leafField];
        if (!leafValue || typeof leafValue !== 'object' || leafValue._e !== 1) continue;

        const decrypted = await decryptSubDoc(leafValue);
        parentValue[fieldConfig.leafField] = decrypted;
        continue;
      }

      // Nested encrypted field inside array elements (LIST_ITER + FIELD)
      if (fieldConfig.isNested && fieldConfig.isArrayElement) {
        const arrayValue = doc.get(fieldConfig.parentPath);
        if (!Array.isArray(arrayValue)) continue;

        for (const elem of arrayValue) {
          if (!elem || typeof elem !== 'object') continue;
          const leafValue = elem[fieldConfig.leafField];
          if (!leafValue || typeof leafValue !== 'object' || leafValue._e !== 1) continue;

          const decrypted = await decryptSubDoc(leafValue);
          elem[fieldConfig.leafField] = decrypted;
        }
        continue;
      }

      const fieldValue = doc.get(pathName);
      if (!fieldValue) continue;

      // Element-level encrypted array: each element is an encrypted sub-document
      if (Array.isArray(fieldValue) && fieldValue.length > 0) {
        const firstElem = fieldValue[0];
        if (firstElem && typeof firstElem === 'object' && firstElem._e === 1) {
          const decryptedArray = [];
          for (const elem of fieldValue) {
            if (!elem || typeof elem !== 'object' || elem._e !== 1) {
              decryptedArray.push(elem);
              continue;
            }
            const decrypted = await decryptSubDoc(elem);
            decryptedArray.push(decrypted);
          }
          doc.set(pathName, decryptedArray);
          continue;
        }
        // Non-encrypted array, skip
        continue;
      }

      // Single encrypted sub-document (scalar, DOC, COL, MAP)
      if (typeof fieldValue !== 'object' || fieldValue._e !== 1) continue;

      const decrypted = await decryptSubDoc(fieldValue);
      doc.set(pathName, decrypted);
    }
  }

  /**
   * Decrypt a single encrypted sub-document by decoding namespace + dekVersion
   * from the Wire Format V1 blob.
   * @param {Object} subDoc - Encrypted sub-document with _e, _t, c
   * @returns {Promise<*>} Decrypted value
   */
  async function decryptSubDoc(subDoc) {
    const ciphertext = subDoc.c;

    let namespace, dekVersion;
    if (typeof ciphertext === 'string') {
      const decoded = WireFormatDecoder.decodeFromBase64Url(ciphertext);
      namespace = decoded.namespace;
      dekVersion = decoded.dekVersion;
    } else if (Buffer.isBuffer(ciphertext)) {
      const decoded = WireFormatDecoder.decode(ciphertext);
      namespace = decoded.namespace;
      dekVersion = decoded.dekVersion;
    } else {
      throw new Error('Unsupported ciphertext format in encrypted sub-document');
    }

    await keyVaultService.ensureVaultInitialized(namespace);
    const dek = await keyVaultService.getDekByVersion(namespace, dekVersion);

    return fieldCryptoService.decryptField(subDoc, dek, null, algorithm);
  }
}

module.exports = { lclCryptoPlugin, prepareEncryptedSchema };

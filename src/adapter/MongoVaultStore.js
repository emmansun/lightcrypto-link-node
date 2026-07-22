'use strict';

const VaultStore = require('./VaultStore');
const OptimisticLockError = require('./OptimisticLockError');

const DEFAULT_COLLECTION = '__lcl_keyvault';
const VAULT_ID_PREFIX = 'lcl-dek-';

/**
 * MongoVaultStore — VaultStore implementation using native mongodb driver.
 *
 * Aligned with Java's MongoVaultStore. Uses the native `mongodb` Db instance
 * (not Mongoose) for direct BSON document operations.
 *
 * Document conversion:
 *   - `_id` (BSON) ↔ `id` (VaultDocument)
 *   - Wrapped key buffers stored as Base64 strings in BSON
 */
class MongoVaultStore extends VaultStore {
  /**
   * @param {import('mongodb').Db} db - Native mongodb Db instance
   * @param {string} [collectionName='__lcl_keyvault'] - Collection name
   */
  constructor(db, collectionName = DEFAULT_COLLECTION) {
    super();
    this._db = db;
    this._collectionName = collectionName;
  }

  /**
   * Get the MongoDB collection handle.
   * @private
   */
  get _collection() {
    return this._db.collection(this._collectionName);
  }

  /**
   * Persist a VaultDocument (upsert via replaceOne).
   * Sets updatedAt to current time before persisting.
   *
   * @param {Object} doc - VaultDocument plain object
   * @returns {Promise<void>}
   */
  async save(doc) {
    const bsonDoc = this._toBson(doc);
    bsonDoc.updatedAt = new Date();
    await this._collection.replaceOne(
      { _id: bsonDoc._id },
      bsonDoc,
      { upsert: true }
    );
  }

  /**
   * Load a VaultDocument by canonical namespace.
   * Internally prepends VAULT_ID_PREFIX to construct the _id.
   *
   * @param {string} namespace - Canonical namespace (e.g., "default.default.User#phone")
   * @returns {Promise<Object|null>}
   */
  async load(namespace) {
    const bsonDoc = await this._collection.findOne({ _id: VAULT_ID_PREFIX + namespace });
    if (!bsonDoc) return null;
    return this._fromBson(bsonDoc);
  }

  /**
   * Check whether a vault document exists for the given namespace.
   *
   * @param {string} namespace - Canonical namespace
   * @returns {Promise<boolean>}
   */
  async exists(namespace) {
    const count = await this._collection.countDocuments({ _id: VAULT_ID_PREFIX + namespace }, { limit: 1 });
    return count > 0;
  }

  /**
   * Rotate (CAS update) via replaceOne with version filter.
   *
   * @param {Object} doc - Updated VaultDocument with incremented version
   * @returns {Promise<Object>} The persisted document
   * @throws {OptimisticLockError} On version mismatch
   */
  async rotate(doc) {
    const bsonDoc = this._toBson(doc);
    bsonDoc.updatedAt = new Date();
    const expectedVersion = doc.v - 1;

    const result = await this._collection.replaceOne(
      { _id: bsonDoc._id, v: expectedVersion },
      bsonDoc
    );

    if (result.matchedCount === 0) {
      // Determine actual version for error reporting
      const current = await this._collection.findOne({ _id: bsonDoc._id }, { projection: { v: 1 } });
      const actualVersion = current ? current.v : 0;
      throw new OptimisticLockError(doc.id, expectedVersion, actualVersion);
    }

    return this._fromBson(bsonDoc);
  }

  /**
   * Load all VaultDocuments.
   *
   * @returns {Promise<Object[]>}
   */
  async loadAll() {
    const cursor = this._collection.find({});
    const docs = await cursor.toArray();
    return docs.map(d => this._fromBson(d));
  }

  /**
   * Convert a plain VaultDocument to BSON document for storage.
   * - `id` → `_id`
   * - Wrapped key buffers → Base64 strings
   *
   * @private
   */
  _toBson(doc) {
    return {
      _id: VAULT_ID_PREFIX + doc.id,
      v: doc.v,
      status: doc.status,
      activeKid: doc.activeKid,
      keys: doc.keys.map(k => ({
        kid: k.kid,
        status: k.status,
        dek: this._wrappedKeyToBson(k.dek),
        hmk: this._wrappedKeyToBson(k.hmk),
        binding: k.binding,
        createdAt: k.createdAt
      })),
      cmk: { provider: doc.cmk.provider, id: doc.cmk.id },
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    };
  }

  /**
   * Convert wrapped key info to BSON format (Buffer → Base64 string).
   * @private
   */
  _wrappedKeyToBson(info) {
    return {
      wrapped: Buffer.isBuffer(info.wrapped) ? info.wrapped.toString('base64') : info.wrapped,
      algorithm: info.algorithm,
      kcv: info.kcv,
      cmkVersion: info.cmkVersion
    };
  }

  /**
   * Convert a BSON document to a plain VaultDocument.
   * - `_id` → `id`
   * - Base64 wrapped keys → Buffer
   *
   * @private
   */
  _fromBson(bsonDoc) {
    const rawId = bsonDoc._id;
    return {
      id: typeof rawId === 'string' && rawId.startsWith(VAULT_ID_PREFIX)
        ? rawId.substring(VAULT_ID_PREFIX.length)
        : rawId,
      v: bsonDoc.v,
      status: bsonDoc.status,
      activeKid: bsonDoc.activeKid,
      keys: (bsonDoc.keys || []).map(k => ({
        kid: k.kid,
        status: k.status,
        dek: this._wrappedKeyFromBson(k.dek),
        hmk: this._wrappedKeyFromBson(k.hmk),
        binding: k.binding,
        createdAt: k.createdAt instanceof Date ? k.createdAt : new Date(k.createdAt)
      })),
      cmk: { provider: bsonDoc.cmk.provider, id: bsonDoc.cmk.id },
      createdAt: bsonDoc.createdAt instanceof Date ? bsonDoc.createdAt : new Date(bsonDoc.createdAt),
      updatedAt: bsonDoc.updatedAt instanceof Date ? bsonDoc.updatedAt : new Date(bsonDoc.updatedAt)
    };
  }

  /**
   * Convert wrapped key info from BSON format (Base64 string → Buffer).
   * @private
   */
  _wrappedKeyFromBson(info) {
    return {
      wrapped: typeof info.wrapped === 'string' ? Buffer.from(info.wrapped, 'base64') : info.wrapped,
      algorithm: info.algorithm,
      kcv: info.kcv,
      cmkVersion: info.cmkVersion || ''
    };
  }
}

module.exports = MongoVaultStore;

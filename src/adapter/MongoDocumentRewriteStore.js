'use strict';

const DocumentRewriteStore = require('../spi/DocumentRewriteStore');
const { createRawDocument } = require('../spi/RawDocument');

const CHECKPOINT_COLLECTION = '__lcl_checkpoints';

/**
 * MongoDocumentRewriteStore — DocumentRewriteStore implementation using native mongodb driver.
 *
 * Provides cursor-based batch scanning with stable _id order, CAS-protected
 * replacement via encrypted field `_k` conditions, and checkpoint persistence.
 *
 * Aligned with Java MongoDocumentRewriteStore.
 */
class MongoDocumentRewriteStore extends DocumentRewriteStore {
  /**
   * @param {Object} options
   * @param {import('mongodb').Db} options.db - Native mongodb Db instance
   */
  constructor(options) {
    super();
    if (!options || !options.db) {
      throw new Error('MongoDocumentRewriteStore requires a db option (native mongodb Db instance)');
    }
    this._db = options.db;
  }

  /**
   * Scan documents in stable _id order, yielding RawDocument objects.
   *
   * @param {Object} scanOptions - ScanOptions plain object
   * @param {string} scanOptions.collectionHint - Collection name
   * @param {number} [scanOptions.batchSize=500] - Batch size for cursor
   * @param {*} [scanOptions.resumeAfter] - Resume after this _id
   * @param {number} [scanOptions.maxScanTimeMs] - Max scan time (uses maxTimeMS on cursor)
   * @yields {Object} RawDocument objects
   */
  async *scan(scanOptions) {
    const collectionName = scanOptions.collectionHint;
    const batchSize = scanOptions.batchSize || 500;
    const collection = this._db.collection(collectionName);

    // Build filter
    const filter = {};
    if (scanOptions.resumeAfter != null) {
      filter._id = { $gt: scanOptions.resumeAfter };
    }

    // Build cursor options
    const cursorOptions = {
      batchSize,
      noCursorTimeout: true
    };
    if (scanOptions.maxScanTimeMs) {
      cursorOptions.maxTimeMS = scanOptions.maxScanTimeMs;
    }

    const cursor = collection.find(filter, cursorOptions).sort({ _id: 1 });

    try {
      for await (const doc of cursor) {
        // Extract encrypted fields and their CAS conditions (_k values)
        const fields = {};
        const casConditions = {};

        for (const [key, value] of Object.entries(doc)) {
          if (key === '_id') continue;
          if (value && typeof value === 'object' && value._e === 1) {
            fields[key] = value;
            if (value._k) {
              casConditions[key] = value._k;
            }
          }
        }

        yield createRawDocument({
          id: doc._id,
          fields,
          casConditions
        });
      }
    } finally {
      await cursor.close();
    }
  }

  /**
   * Atomically replace encrypted fields in a document using CAS conditions.
   *
   * @param {Object} rawDocument - RawDocument with id, fields (updated), casConditions
   * @returns {Promise<boolean>} true if replaced, false on CAS conflict
   */
  async replace(rawDocument) {
    const collectionName = this._getCollectionName(rawDocument);
    const collection = this._db.collection(collectionName);

    // Build CAS filter: { _id: doc.id, 'field._k': oldKid, ... }
    const filter = { _id: rawDocument.id };
    for (const [fieldPath, oldKid] of Object.entries(rawDocument.casConditions)) {
      filter[`${fieldPath}._k`] = oldKid;
    }

    // Build $set with updated fields
    const setFields = {};
    for (const [fieldPath, newValue] of Object.entries(rawDocument.fields)) {
      setFields[fieldPath] = newValue;
    }

    const result = await collection.updateOne(filter, { $set: setFields });
    return result.modifiedCount > 0;
  }

  /**
   * Batch replace multiple documents using bulkWrite (ordered: false).
   *
   * @param {Object[]} rawDocuments - Array of RawDocument objects
   * @returns {Promise<number>} Count of successfully replaced documents
   */
  async replaceBatch(rawDocuments) {
    if (rawDocuments.length === 0) return 0;

    // Group by collection (in practice, all docs are from same collection)
    const operations = rawDocuments.map(rawDoc => {
      const filter = { _id: rawDoc.id };
      for (const [fieldPath, oldKid] of Object.entries(rawDoc.casConditions)) {
        filter[`${fieldPath}._k`] = oldKid;
      }

      const setFields = {};
      for (const [fieldPath, newValue] of Object.entries(rawDoc.fields)) {
        setFields[fieldPath] = newValue;
      }

      return {
        updateOne: {
          filter,
          update: { $set: setFields }
        }
      };
    });

    // Determine collection from first doc (all should be same collection in a batch)
    const collectionName = this._getCollectionName(rawDocuments[0]);
    const collection = this._db.collection(collectionName);

    try {
      const result = await collection.bulkWrite(operations, { ordered: false });
      return result.modifiedCount || 0;
    } catch (err) {
      // BulkWriteError with partial results
      if (err.result && typeof err.result.nModified === 'number') {
        return err.result.nModified;
      }
      throw err;
    }
  }

  /**
   * Save a checkpoint for resume capability.
   *
   * @param {string} taskId - Unique task identifier
   * @param {string} cursorState - Opaque cursor state (last processed _id as string)
   * @returns {Promise<void>}
   */
  async saveCheckpoint(taskId, cursorState) {
    const collection = this._db.collection(CHECKPOINT_COLLECTION);
    await collection.updateOne(
      { _id: taskId },
      { $set: { cursorState, updatedAt: new Date() } },
      { upsert: true }
    );
  }

  /**
   * Load a previously saved checkpoint.
   *
   * @param {string} taskId - Unique task identifier
   * @returns {Promise<string|null>} Cursor state or null if no checkpoint exists
   */
  async loadCheckpoint(taskId) {
    const collection = this._db.collection(CHECKPOINT_COLLECTION);
    const doc = await collection.findOne({ _id: taskId });
    if (!doc || doc.cursorState === '__COMPLETED__') return null;
    return doc.cursorState || null;
  }

  /**
   * Get collection name from a raw document.
   * Uses _collectionHint if set, otherwise falls back to scanning context.
   * @private
   */
  _getCollectionName(rawDocument) {
    // The collection hint is stored during scan; for replace operations
    // we rely on the caller providing docs from the same collection.
    // Store collection hint on the document during scan if needed.
    if (rawDocument._collectionHint) {
      return rawDocument._collectionHint;
    }
    // Default: this should be set by the service layer
    throw new Error('Cannot determine collection name for replace operation. Ensure _collectionHint is set.');
  }
}

module.exports = MongoDocumentRewriteStore;

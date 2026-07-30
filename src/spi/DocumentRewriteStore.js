'use strict';

/**
 * DocumentRewriteStore — abstract base class defining the contract for
 * adapter-agnostic batch document scanning, CAS atomic replacement,
 * and checkpoint persistence.
 *
 * Aligned with Java DocumentRewriteStore SPI.
 * Subclasses MUST override every method; the base implementations throw 'Not implemented'.
 */
class DocumentRewriteStore {
  /**
   * Scan documents in stable _id order, yielding RawDocument objects.
   * @param {Object} _scanOptions - ScanOptions plain object
   * @returns {AsyncGenerator<Object>} Yields RawDocument objects
   */
  async *scan(_scanOptions) {
    throw new Error('Not implemented');
  }

  /**
   * Atomically replace a document using CAS conditions.
   * @param {Object} _rawDocument - RawDocument with updated fields and casConditions
   * @returns {Promise<boolean>} true if replaced, false on CAS conflict
   */
  async replace(_rawDocument) {
    throw new Error('Not implemented');
  }

  /**
   * Batch replace multiple documents using database-specific bulk operations.
   * @param {Object[]} _rawDocuments - Array of RawDocument objects
   * @returns {Promise<number>} Count of successfully replaced documents
   */
  async replaceBatch(_rawDocuments) {
    throw new Error('Not implemented');
  }

  /**
   * Persist a checkpoint for resume capability.
   * @param {string} _taskId - Unique task identifier
   * @param {string} _cursorState - Opaque cursor state (e.g., last processed _id)
   * @returns {Promise<void>}
   */
  async saveCheckpoint(_taskId, _cursorState) {
    throw new Error('Not implemented');
  }

  /**
   * Load a previously saved checkpoint.
   * @param {string} _taskId - Unique task identifier
   * @returns {Promise<string|null>} Cursor state or null if no checkpoint exists
   */
  async loadCheckpoint(_taskId) {
    throw new Error('Not implemented');
  }
}

module.exports = DocumentRewriteStore;

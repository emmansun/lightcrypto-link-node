'use strict';

/**
 * VaultStore — abstract base class defining the contract for all vault storage adapters.
 *
 * All methods are async (return Promises).
 * Subclasses MUST override every method; the base implementations throw 'Not implemented'.
 */
class VaultStore {
  /**
   * Persist a VaultDocument (upsert semantics).
   * @param {Object} doc - VaultDocument plain object
   * @returns {Promise<void>}
   */
  async save(doc) {
    throw new Error('Not implemented');
  }

  /**
   * Load a VaultDocument by namespace.
   * @param {string} namespace - Canonical namespace string (e.g., 'lcl-dek-User')
   * @returns {Promise<Object|null>} VaultDocument or null if not found
   */
  async load(namespace) {
    throw new Error('Not implemented');
  }

  /**
   * Check whether a vault document exists for the given namespace.
   * @param {string} namespace
   * @returns {Promise<boolean>}
   */
  async exists(namespace) {
    throw new Error('Not implemented');
  }

  /**
   * Rotate (CAS update) a vault document with optimistic locking.
   *
   * The adapter MUST verify that the stored document's version equals `doc.v - 1`
   * before persisting. If the version does not match, throw OptimisticLockError.
   *
   * @param {Object} doc - Updated VaultDocument with incremented version
   * @returns {Promise<Object>} The persisted VaultDocument
   * @throws {OptimisticLockError} On version mismatch
   */
  async rotate(doc) {
    throw new Error('Not implemented');
  }

  /**
   * Load all VaultDocuments in the store.
   * @returns {Promise<Object[]>} Array of VaultDocuments
   */
  async loadAll() {
    throw new Error('Not implemented');
  }
}

module.exports = VaultStore;

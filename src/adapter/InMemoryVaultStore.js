'use strict';

const VaultStore = require('../spi/VaultStore');
const OptimisticLockError = require('../spi/OptimisticLockError');

/**
 * Deep copy a value using structured clone (Node 17+) or JSON round-trip fallback.
 * Handles Buffer instances correctly.
 *
 * @param {*} value - Value to deep copy
 * @returns {*} Deep copy of the value
 */
function deepCopy(value) {
  if (value === null || value === undefined) return value;

  // Use structuredClone if available (Node 17+)
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  // Fallback: JSON round-trip with Buffer handling
  return JSON.parse(JSON.stringify(value, (key, val) => {
    if (Buffer.isBuffer(val)) {
      return { type: 'Buffer', data: [...val] };
    }
    return val;
  }), (key, val) => {
    if (val && val.type === 'Buffer' && Array.isArray(val.data)) {
      return Buffer.from(val.data);
    }
    return val;
  });
}

/**
 * InMemoryVaultStore — Map-based VaultStore implementation for testing and development.
 *
 * Stores documents in memory with deep copy semantics to prevent external mutation.
 */
class InMemoryVaultStore extends VaultStore {
  constructor() {
    super();
    /** @type {Map<string, Object>} */
    this._store = new Map();
  }

  /**
   * Persist a VaultDocument (upsert semantics).
   * Stores a deep copy to prevent external mutation.
   *
   * @param {Object} doc - VaultDocument plain object
   * @returns {Promise<void>}
   */
  async save(doc) {
    const copy = deepCopy(doc);
    this._store.set(doc.id, copy);
  }

  /**
   * Load a VaultDocument by namespace.
   * Returns a deep copy to prevent external mutation.
   *
   * @param {string} namespace - The vault document id
   * @returns {Promise<Object|null>}
   */
  async load(namespace) {
    const doc = this._store.get(namespace);
    if (!doc) return null;
    return deepCopy(doc);
  }

  /**
   * Check whether a vault document exists.
   *
   * @param {string} namespace
   * @returns {Promise<boolean>}
   */
  async exists(namespace) {
    return this._store.has(namespace);
  }

  /**
   * Rotate (CAS update) with optimistic locking.
   *
   * Verifies stored document's version equals doc.v - 1 before replacing.
   *
   * @param {Object} doc - Updated VaultDocument with incremented version
   * @returns {Promise<Object>} The persisted document (deep copy)
   * @throws {OptimisticLockError} On version mismatch
   */
  async rotate(doc) {
    const stored = this._store.get(doc.id);
    const storedVersion = stored ? stored.v : 0;
    const expectedVersion = doc.v - 1;

    if (storedVersion !== expectedVersion) {
      throw new OptimisticLockError(doc.id, expectedVersion, storedVersion);
    }

    const copy = deepCopy(doc);
    this._store.set(doc.id, copy);
    return deepCopy(copy);
  }

  /**
   * Load all VaultDocuments.
   * Returns deep copies.
   *
   * @returns {Promise<Object[]>}
   */
  async loadAll() {
    const results = [];
    for (const doc of this._store.values()) {
      results.push(deepCopy(doc));
    }
    return results;
  }

  /**
   * Clear all stored documents.
   * Utility method specific to InMemoryVaultStore (not part of VaultStore interface).
   */
  clear() {
    this._store.clear();
  }
}

module.exports = InMemoryVaultStore;

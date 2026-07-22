'use strict';

/**
 * OptimisticLockError — thrown when a rotate() operation fails due to version mismatch.
 *
 * Contains namespace and expected/actual version information for debugging.
 */
class OptimisticLockError extends Error {
  /**
   * @param {string} namespace - The vault namespace (e.g., 'lcl-dek-User')
   * @param {number} expected - The expected stored version (doc.v - 1)
   * @param {number} actual - The actual stored version
   */
  constructor(namespace, expected, actual) {
    super(`Optimistic lock failed for namespace '${namespace}': expected version ${expected}, but found ${actual}. Another rotation may be in progress.`);
    this.name = 'OptimisticLockError';
    this.namespace = namespace;
    this.expected = expected;
    this.actual = actual;

    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, OptimisticLockError);
    }
  }
}

module.exports = OptimisticLockError;

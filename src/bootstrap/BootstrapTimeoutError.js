'use strict';

/**
 * Error thrown when bootstrap total timeout is exceeded.
 */
class BootstrapTimeoutError extends Error {
  /**
   * @param {string} phaseName - The phase that was about to execute
   * @param {number} timeoutMs - The configured timeout
   */
  constructor(phaseName, timeoutMs) {
    super(`Bootstrap timeout exceeded (${timeoutMs}ms) before phase: ${phaseName}`);
    this.name = 'BootstrapTimeoutError';
    this.phaseName = phaseName;
  }
}

module.exports = BootstrapTimeoutError;

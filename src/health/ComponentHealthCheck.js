'use strict';

/**
 * Abstract base class for component-level health checks.
 * Subclasses MUST override check() and return a LclHealthStatus value.
 * Aligned with Java ComponentHealthCheck functional interface.
 *
 * @example
 * class VaultHealthCheck extends ComponentHealthCheck {
 *   check() {
 *     return this._vaultStore.isReachable()
 *       ? LclHealthStatus.READY
 *       : LclHealthStatus.FAILED;
 *   }
 * }
 */
class ComponentHealthCheck {
  /**
   * Perform a health check and return the component's current status.
   * @returns {string} A LclHealthStatus value (READY, STARTING, DEGRADED, FAILED)
   * @throws {Error} If not overridden by subclass
   */
  check() {
    throw new Error('Not implemented');
  }
}

module.exports = ComponentHealthCheck;

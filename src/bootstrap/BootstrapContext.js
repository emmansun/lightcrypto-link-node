'use strict';

/**
 * Immutable context carrying dependencies required by bootstrap phases.
 */
class BootstrapContext {
  /**
   * @param {Object} options
   * @param {Object} options.cmkProvider - CmkProvider instance (required)
   * @param {Object} [options.vaultStore] - VaultStore instance (optional)
   * @param {boolean} [options.strictMode=true] - Whether RECOVERABLE failures escalate to FATAL
   * @param {number} [options.bootstrapTimeoutMs=15000] - Total timeout in milliseconds
   * @param {Function} [options.onEvent] - Callback (eventName, detail) for event notification
   */
  constructor(options) {
    if (!options || !options.cmkProvider) {
      throw new Error('BootstrapContext requires cmkProvider');
    }

    this._cmkProvider = options.cmkProvider;
    this._vaultStore = options.vaultStore || null;
    this._strictMode = options.strictMode !== undefined ? options.strictMode : true;
    this._bootstrapTimeoutMs = options.bootstrapTimeoutMs !== undefined ? options.bootstrapTimeoutMs : 15000;
    this._onEvent = options.onEvent || (() => {});

    Object.freeze(this);
  }

  get cmkProvider() { return this._cmkProvider; }
  get vaultStore() { return this._vaultStore; }
  get strictMode() { return this._strictMode; }
  get bootstrapTimeoutMs() { return this._bootstrapTimeoutMs; }
  get onEvent() { return this._onEvent; }
}

module.exports = BootstrapContext;

'use strict';

const NoOpEventBus = require('../event/NoOpEventBus');
const EventBus = require('../event/EventBus');

/**
 * Adapter that wraps a legacy onEvent(name, detail) callback as an EventBus.
 * @private
 */
class CallbackEventBus extends EventBus {
  /**
   * @param {Function} callback - (eventName, detail) => void
   */
  constructor(callback) {
    super();
    this._callback = callback;
  }

  /** @override */
  emit(event) {
    try {
      this._callback(event.event, {
        tier: event.tier,
        result: event.result,
        namespace: event.namespace,
        algorithm: event.algorithm,
        dekVersion: event.dekVersion,
        durationMicros: event.durationMicros,
        errorType: event.errorType,
        attributes: event.attributes
      });
    } catch (_err) {
      // EventBus contract: never throw to caller
    }
  }
}

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
   * @param {EventBus} [options.eventBus] - EventBus instance for structured event notification
   * @param {Function} [options.onEvent] - @deprecated Callback (eventName, detail) for event notification (use eventBus instead)
   */
  constructor(options) {
    if (!options || !options.cmkProvider) {
      throw new Error('BootstrapContext requires cmkProvider');
    }

    this._cmkProvider = options.cmkProvider;
    this._vaultStore = options.vaultStore || null;
    this._strictMode = options.strictMode !== undefined ? options.strictMode : true;
    this._bootstrapTimeoutMs = options.bootstrapTimeoutMs !== undefined ? options.bootstrapTimeoutMs : 15000;

    // EventBus resolution: eventBus > onEvent adapter > NoOpEventBus
    if (options.eventBus) {
      this._eventBus = options.eventBus;
    } else if (options.onEvent) {
      this._eventBus = new CallbackEventBus(options.onEvent);
    } else {
      this._eventBus = NoOpEventBus.INSTANCE;
    }

    // Preserve backward-compatible onEvent accessor
    this._onEvent = options.onEvent || (() => {});

    Object.freeze(this);
  }

  get cmkProvider() { return this._cmkProvider; }
  get vaultStore() { return this._vaultStore; }
  get strictMode() { return this._strictMode; }
  get bootstrapTimeoutMs() { return this._bootstrapTimeoutMs; }
  get eventBus() { return this._eventBus; }
  get onEvent() { return this._onEvent; }
}

module.exports = BootstrapContext;

'use strict';

const EventBus = require('./EventBus');

/**
 * EventBus implementation that delegates to multiple buses in order
 * with failure isolation. A single delegate throwing does not prevent
 * remaining delegates from receiving the event.
 * Aligned with Java lcl-core CompositeEventBus.
 */
class CompositeEventBus extends EventBus {
  /**
   * @param {EventBus[]} delegates - Array of EventBus implementations
   */
  constructor(delegates) {
    super();
    this._delegates = Array.isArray(delegates) ? delegates.slice() : [];
    Object.freeze(this._delegates);
  }

  /** @override */
  emit(event) {
    for (const delegate of this._delegates) {
      try {
        delegate.emit(event);
      } catch (err) {
        console.warn(
          `[CompositeEventBus] delegate ${delegate.constructor.name} threw: ${err.message}`
        );
      }
    }
  }

  get delegates() { return this._delegates; }
}

module.exports = CompositeEventBus;

'use strict';

const EventBus = require('./EventBus');

/**
 * Singleton EventBus implementation that silently discards all events.
 * Used as the default when no EventBus is configured.
 */
class NoOpEventBus extends EventBus {
  /** @override */
  emit(_event) {
    // Intentionally empty — zero overhead
  }
}

/** Singleton instance */
NoOpEventBus.INSTANCE = new NoOpEventBus();

Object.freeze(NoOpEventBus.INSTANCE);

module.exports = NoOpEventBus;

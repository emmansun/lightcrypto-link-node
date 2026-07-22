'use strict';

/**
 * Abstract base class for event bus implementations.
 * Subclasses MUST override emit(event).
 * Implementations MUST NOT throw exceptions to the caller.
 * Aligned with Java lcl-core EventBus SPI.
 */
class EventBus {
  /**
   * Emit a structured LCL event.
   * @param {LclEvent} event - The event to emit
   * @throws {Error} If not overridden by subclass
   */
  emit(_event) {
    throw new Error('Not implemented');
  }
}

module.exports = EventBus;

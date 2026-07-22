'use strict';

const MAX_EVENT_NAME_LENGTH = 96;

/**
 * Immutable structured event model for LCL observability.
 * Constructed via the Builder pattern.
 * Aligned with Java lcl-core LclEvent.
 */
class LclEvent {
  /**
   * @param {Object} fields - Pre-validated fields from Builder
   * @private — use LclEvent.builder()
   */
  constructor(fields) {
    this._event = fields.event;
    this._tier = fields.tier;
    this._timestamp = fields.timestamp;
    this._durationMicros = fields.durationMicros;
    this._result = fields.result;
    this._namespace = fields.namespace;
    this._algorithm = fields.algorithm;
    this._dekVersion = fields.dekVersion;
    this._errorType = fields.errorType;
    this._attributes = Object.freeze(new Map(fields.attributes));

    Object.freeze(this);
  }

  get event() { return this._event; }
  get tier() { return this._tier; }
  get timestamp() { return this._timestamp; }
  get durationMicros() { return this._durationMicros; }
  get result() { return this._result; }
  get namespace() { return this._namespace; }
  get algorithm() { return this._algorithm; }
  get dekVersion() { return this._dekVersion; }
  get errorType() { return this._errorType; }
  get attributes() { return this._attributes; }

  /**
   * @returns {Builder} A new Builder instance
   */
  static builder() {
    return new Builder();
  }
}

/**
 * Builder for constructing immutable LclEvent instances.
 */
class Builder {
  constructor() {
    this._event = null;
    this._tier = null;
    this._timestamp = null;
    this._durationMicros = -1;
    this._result = null;
    this._namespace = null;
    this._algorithm = null;
    this._dekVersion = -1;
    this._errorType = null;
    this._attributes = new Map();
  }

  /** @param {string} event - Event name (e.g., 'lcl.bootstrap.started') */
  event(event) { this._event = event; return this; }

  /** @param {string} tier - EventTier value (L1/L2/L3) */
  tier(tier) { this._tier = tier; return this; }

  /** @param {Date} timestamp - When the event occurred */
  timestamp(timestamp) { this._timestamp = timestamp; return this; }

  /** @param {number} durationMicros - Operation duration in microseconds */
  durationMicros(durationMicros) { this._durationMicros = durationMicros; return this; }

  /** @param {string} result - Outcome (e.g., 'success', 'failed', 'started') */
  result(result) { this._result = result; return this; }

  /** @param {string} namespace - LCL namespace */
  namespace(namespace) { this._namespace = namespace; return this; }

  /** @param {string} algorithm - Algorithm identifier */
  algorithm(algorithm) { this._algorithm = algorithm; return this; }

  /** @param {number} dekVersion - DEK version */
  dekVersion(dekVersion) { this._dekVersion = dekVersion; return this; }

  /** @param {string} errorType - Error classification */
  errorType(errorType) { this._errorType = errorType; return this; }

  /** @param {Map<string,string>} attributes - Additional key-value pairs */
  attributes(attributes) { this._attributes = attributes; return this; }

  /**
   * Validate and build an immutable LclEvent.
   * @returns {LclEvent}
   * @throws {Error} If required fields are missing or event name exceeds 96 chars
   */
  build() {
    if (!this._event) {
      throw new Error('LclEvent requires event');
    }
    if (!this._tier) {
      throw new Error('LclEvent requires tier');
    }
    if (!this._result) {
      throw new Error('LclEvent requires result');
    }
    if (this._event.length > MAX_EVENT_NAME_LENGTH) {
      throw new Error(`LclEvent event name must not exceed ${MAX_EVENT_NAME_LENGTH} characters (got ${this._event.length})`);
    }

    return new LclEvent({
      event: this._event,
      tier: this._tier,
      timestamp: this._timestamp || new Date(),
      durationMicros: this._durationMicros,
      result: this._result,
      namespace: this._namespace,
      algorithm: this._algorithm,
      dekVersion: this._dekVersion,
      errorType: this._errorType,
      attributes: this._attributes
    });
  }
}

module.exports = LclEvent;

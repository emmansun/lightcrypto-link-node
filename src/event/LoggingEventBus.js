'use strict';

const EventBus = require('./EventBus');
const EventTier = require('./EventTier');

/**
 * EventBus implementation that formats LclEvent as structured JSON
 * and outputs via a configurable logger function.
 *
 * Log level mapping (aligned with Java Slf4jEventBus):
 * - L1 (Diagnostic) → debug
 * - L2 (Operational) → info
 * - L3 (Audit) → info
 *
 * @example
 * // Default: console-based output
 * const bus = new LoggingEventBus();
 *
 * // Custom logger (e.g., pino, winston)
 * const bus = new LoggingEventBus({
 *   logger: { debug: (msg) => pino.debug(msg), info: (msg) => pino.info(msg) }
 * });
 */
class LoggingEventBus extends EventBus {
  /**
   * @param {Object} [options]
   * @param {Object} [options.logger] - Logger with debug(msg) and info(msg) methods.
   *   Defaults to console (debug → console.debug, info → console.info).
   * @param {string} [options.prefix='[LCL]'] - Prefix prepended to each log line.
   */
  constructor(options = {}) {
    super();
    const logger = options.logger || console;
    this._debug = (logger.debug || logger.info || console.info).bind(logger);
    this._info = (logger.info || console.info).bind(logger);
    this._prefix = options.prefix !== undefined ? options.prefix : '[LCL]';
  }

  /**
   * Emit a structured LclEvent as JSON.
   * @param {import('./LclEvent')} event
   */
  emit(event) {
    const json = this._toJson(event);
    const line = this._prefix ? `${this._prefix} ${json}` : json;

    if (event.tier === EventTier.L1) {
      this._debug(line);
    } else {
      this._info(line);
    }
  }

  /**
   * Format LclEvent as a JSON string. Only includes non-null/non-default fields.
   * @param {import('./LclEvent')} event
   * @returns {string}
   * @private
   */
  _toJson(event) {
    const obj = {
      event: event.event,
      tier: event.tier,
      timestamp: event.timestamp ? event.timestamp.toISOString() : new Date().toISOString(),
      result: event.result
    };

    if (event.durationMicros >= 0) {
      obj.durationMicros = event.durationMicros;
    }
    if (event.namespace) {
      obj.namespace = event.namespace;
    }
    if (event.algorithm) {
      obj.algorithm = event.algorithm;
    }
    if (event.dekVersion >= 0) {
      obj.dekVersion = event.dekVersion;
    }
    if (event.errorType) {
      obj.errorType = event.errorType;
    }
    if (event.attributes && event.attributes.size > 0) {
      const attrs = {};
      for (const [k, v] of event.attributes) {
        attrs[k] = v;
      }
      obj.attributes = attrs;
    }

    return JSON.stringify(obj);
  }
}

module.exports = LoggingEventBus;

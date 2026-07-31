'use strict';

/**
 * Four-state health model for LCL components.
 * Overall health is computed as the worst state across all registered components.
 * Aligned with Java LclHealthStatus enum.
 */
const LclHealthStatus = Object.freeze({
  /** Initialization in progress. */
  STARTING: 'STARTING',
  /** Fully operational. */
  READY: 'READY',
  /** One or more non-critical components unavailable. */
  DEGRADED: 'DEGRADED',
  /** Fatal error — crypto operations cannot proceed. */
  FAILED: 'FAILED'
});

const SEVERITY = Object.freeze({
  READY: 0,
  STARTING: 1,
  DEGRADED: 2,
  FAILED: 3
});

/**
 * Returns the worse of two statuses.
 * Severity order: FAILED > DEGRADED > STARTING > READY.
 * @param {string} a - LclHealthStatus value
 * @param {string} b - LclHealthStatus value
 * @returns {string} The worse status
 */
function worst(a, b) {
  return (SEVERITY[a] ?? 0) >= (SEVERITY[b] ?? 0) ? a : b;
}

module.exports = { LclHealthStatus, worst };

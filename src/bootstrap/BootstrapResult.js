'use strict';

/**
 * Result of a single bootstrap phase check.
 */
class PhaseResult {
  /**
   * @param {string} name - Phase name
   * @param {boolean} success - Whether the phase passed
   * @param {number} durationMs - Execution time in milliseconds
   * @param {string|null} [error] - Error message on failure
   */
  constructor(name, success, durationMs, error = null) {
    this.name = name;
    this.success = success;
    this.durationMs = durationMs;
    this.error = error;
  }

  static success(name, durationMs) {
    return new PhaseResult(name, true, durationMs, null);
  }

  static failure(name, durationMs, error) {
    return new PhaseResult(name, false, durationMs, error);
  }
}

/**
 * Aggregated result of all bootstrap phases.
 */
class BootstrapResult {
  /**
   * @param {string} status - 'READY' | 'FAILED' | 'DEGRADED'
   * @param {PhaseResult[]} phaseResults
   * @param {number} durationMs
   * @param {string|null} [failedPhase]
   * @param {string|null} [errorDetails]
   */
  constructor(status, phaseResults, durationMs, failedPhase = null, errorDetails = null) {
    this.status = status;
    this.phaseResults = phaseResults;
    this.durationMs = durationMs;
    this.failedPhase = failedPhase;
    this.errorDetails = errorDetails;
    this.timestamp = new Date();
  }

  static ready(phaseResults, durationMs) {
    return new BootstrapResult('READY', phaseResults, durationMs, null, null);
  }

  static failed(phaseResults, durationMs, failedPhase, errorDetails) {
    return new BootstrapResult('FAILED', phaseResults, durationMs, failedPhase, errorDetails);
  }

  static degraded(phaseResults, durationMs) {
    return new BootstrapResult('DEGRADED', phaseResults, durationMs, null, null);
  }
}

module.exports = { PhaseResult, BootstrapResult };

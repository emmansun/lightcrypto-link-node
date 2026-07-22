'use strict';

const { BootstrapResult } = require('./BootstrapResult');
const BootstrapTimeoutError = require('./BootstrapTimeoutError');

const MAX_RETRIES = 3;
const BACKOFF_MS = [100, 200, 400];

/**
 * BootstrapEngine — executes bootstrap phases sequentially with
 * failure classification (FATAL/RECOVERABLE/ADVISORY), timeout, and retry.
 */
class BootstrapEngine {
  /**
   * Run all phases sequentially and return an aggregated BootstrapResult.
   * @param {BootstrapContext} context
   * @param {Array<{name: string, check: {check: Function}, failureClass: string}>} phases
   * @returns {Promise<BootstrapResult>}
   */
  async run(context, phases) {
    const startTime = Date.now();
    const phaseResults = [];
    let degraded = false;

    context.onEvent('lcl.bootstrap.started', { phaseCount: phases.length });

    for (const phase of phases) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= context.bootstrapTimeoutMs) {
        context.onEvent('lcl.bootstrap.timeout', { phase: phase.name, elapsedMs: elapsed });
        throw new BootstrapTimeoutError(phase.name, context.bootstrapTimeoutMs);
      }

      const phaseName = phase.name;
      const failureClass = phase.failureClass || 'FATAL';
      context.onEvent(`lcl.bootstrap.${phaseName}.started`, { failureClass });

      const phaseStart = Date.now();
      let result = await this._executeCheck(phase, context);
      let durationMs = Date.now() - phaseStart;

      if (result.success) {
        phaseResults.push(result);
        context.onEvent(`lcl.bootstrap.${phaseName}.completed`, { durationMs });
        continue;
      }

      // Phase failed — handle by failure class
      if (failureClass === 'FATAL') {
        phaseResults.push(result);
        context.onEvent(`lcl.bootstrap.${phaseName}.failed`, { error: result.error, durationMs });
        const totalDuration = Date.now() - startTime;
        return BootstrapResult.failed(phaseResults, totalDuration, phaseName, result.error);
      }

      if (failureClass === 'RECOVERABLE') {
        result = await this._retryPhase(phase, context, phaseStart);
        durationMs = Date.now() - phaseStart;

        if (result.success) {
          phaseResults.push(result);
          context.onEvent(`lcl.bootstrap.${phaseName}.completed`, { durationMs, retried: true });
          continue;
        }

        // Retries exhausted
        if (context.strictMode) {
          phaseResults.push(result);
          context.onEvent(`lcl.bootstrap.${phaseName}.failed`, { error: result.error, durationMs });
          const totalDuration = Date.now() - startTime;
          return BootstrapResult.failed(phaseResults, totalDuration, phaseName, result.error);
        }

        // Tolerant mode: mark degraded, continue
        phaseResults.push(result);
        degraded = true;
        context.onEvent(`lcl.bootstrap.${phaseName}.degraded`, { error: result.error, durationMs });
        continue;
      }

      if (failureClass === 'ADVISORY') {
        phaseResults.push(result);
        context.onEvent(`lcl.bootstrap.${phaseName}.failed`, { error: result.error, advisory: true, durationMs });
        continue;
      }
    }

    const totalDuration = Date.now() - startTime;
    context.onEvent('lcl.bootstrap.ready', { durationMs: totalDuration, degraded });

    if (degraded) {
      return BootstrapResult.degraded(phaseResults, totalDuration);
    }
    return BootstrapResult.ready(phaseResults, totalDuration);
  }

  /**
   * Execute a single check, returning a PhaseResult.
   * @private
   */
  async _executeCheck(phase, context) {
    try {
      const result = await phase.check.check(context);
      return result;
    } catch (err) {
      const { PhaseResult } = require('./BootstrapResult');
      return PhaseResult.failure(phase.name, 0, err.message);
    }
  }

  /**
   * Retry a RECOVERABLE phase up to MAX_RETRIES times with exponential backoff.
   * @private
   */
  async _retryPhase(phase, context, _phaseStart) {
    let lastResult;
    for (let i = 0; i < MAX_RETRIES; i++) {
      await this._sleep(BACKOFF_MS[i]);
      lastResult = await this._executeCheck(phase, context);
      if (lastResult.success) return lastResult;
    }
    return lastResult;
  }

  /**
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = BootstrapEngine;

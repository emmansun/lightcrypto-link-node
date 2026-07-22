'use strict';

const { BootstrapResult } = require('./BootstrapResult');
const BootstrapTimeoutError = require('./BootstrapTimeoutError');
const LclEvent = require('../event/LclEvent');
const EventTier = require('../event/EventTier');

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

    this._emit(context, 'lcl.bootstrap.started', 'started');

    for (const phase of phases) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= context.bootstrapTimeoutMs) {
        this._emit(context, 'lcl.bootstrap.timeout', 'failed', { durationMicros: elapsed * 1000 });
        throw new BootstrapTimeoutError(phase.name, context.bootstrapTimeoutMs);
      }

      const phaseName = phase.name;
      const failureClass = phase.failureClass || 'FATAL';
      this._emit(context, `lcl.bootstrap.${phaseName}.started`, 'started');

      const phaseStart = Date.now();
      let result = await this._executeCheck(phase, context);
      let durationMs = Date.now() - phaseStart;

      if (result.success) {
        phaseResults.push(result);
        this._emit(context, `lcl.bootstrap.${phaseName}.completed`, 'success', { durationMicros: durationMs * 1000 });
        continue;
      }

      // Phase failed — handle by failure class
      if (failureClass === 'FATAL') {
        phaseResults.push(result);
        this._emit(context, `lcl.bootstrap.${phaseName}.failed`, 'failed', { durationMicros: durationMs * 1000, errorType: result.error });
        const totalDuration = Date.now() - startTime;
        return BootstrapResult.failed(phaseResults, totalDuration, phaseName, result.error);
      }

      if (failureClass === 'RECOVERABLE') {
        result = await this._retryPhase(phase, context, phaseStart);
        durationMs = Date.now() - phaseStart;

        if (result.success) {
          phaseResults.push(result);
          this._emit(context, `lcl.bootstrap.${phaseName}.completed`, 'success', { durationMicros: durationMs * 1000 });
          continue;
        }

        // Retries exhausted
        if (context.strictMode) {
          phaseResults.push(result);
          this._emit(context, `lcl.bootstrap.${phaseName}.failed`, 'failed', { durationMicros: durationMs * 1000, errorType: result.error });
          const totalDuration = Date.now() - startTime;
          return BootstrapResult.failed(phaseResults, totalDuration, phaseName, result.error);
        }

        // Tolerant mode: mark degraded, continue
        phaseResults.push(result);
        degraded = true;
        this._emit(context, `lcl.bootstrap.${phaseName}.degraded`, 'degraded', { durationMicros: durationMs * 1000, errorType: result.error });
        continue;
      }

      if (failureClass === 'ADVISORY') {
        phaseResults.push(result);
        this._emit(context, `lcl.bootstrap.${phaseName}.failed`, 'failed', { durationMicros: durationMs * 1000, errorType: result.error });
        continue;
      }
    }

    const totalDuration = Date.now() - startTime;
    this._emit(context, 'lcl.bootstrap.ready', degraded ? 'degraded' : 'success', { durationMicros: totalDuration * 1000 });

    if (degraded) {
      return BootstrapResult.degraded(phaseResults, totalDuration);
    }
    return BootstrapResult.ready(phaseResults, totalDuration);
  }

  /**
   * Construct and emit a structured LclEvent via context.eventBus.
   * @private
   */
  _emit(context, eventName, result, opts = {}) {
    const builder = LclEvent.builder()
      .event(eventName)
      .tier(EventTier.L2)
      .result(result);

    if (opts.durationMicros !== undefined) {
      builder.durationMicros(opts.durationMicros);
    }
    if (opts.errorType !== undefined) {
      builder.errorType(opts.errorType);
    }

    try {
      context.eventBus.emit(builder.build());
    } catch (_err) {
      // EventBus contract: never propagate to caller
    }
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

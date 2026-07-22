'use strict';

const BootstrapEngine = require('../../../src/bootstrap/BootstrapEngine');
const BootstrapContext = require('../../../src/bootstrap/BootstrapContext');
const { PhaseResult } = require('../../../src/bootstrap/BootstrapResult');
const BootstrapTimeoutError = require('../../../src/bootstrap/BootstrapTimeoutError');
const EventBus = require('../../../src/event/EventBus');

function mockCheck(result) {
  return { check: async () => result };
}

function successCheck(name, ms = 1) {
  return { check: async () => PhaseResult.success(name, ms) };
}

function failCheck(name, error = 'fail', ms = 1) {
  return { check: async () => PhaseResult.failure(name, ms, error) };
}

function retryThenSucceed(name, failTimes, ms = 1) {
  let callCount = 0;
  return {
    check: async () => {
      callCount++;
      if (callCount <= failTimes) return PhaseResult.failure(name, ms, 'transient');
      return PhaseResult.success(name, ms);
    }
  };
}

/**
 * Mock EventBus that collects emitted events for assertion.
 */
class CollectingEventBus extends EventBus {
  constructor() {
    super();
    this.events = [];
  }
  emit(event) {
    this.events.push(event);
  }
}

describe('BootstrapEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new BootstrapEngine();
  });

  test('all phases pass → READY', async () => {
    const ctx = new BootstrapContext({ cmkProvider: { getProviderId: () => 'test' } });
    const phases = [
      { name: 'P1', check: successCheck('P1'), failureClass: 'FATAL' },
      { name: 'P2', check: successCheck('P2'), failureClass: 'FATAL' }
    ];
    const result = await engine.run(ctx, phases);
    expect(result.status).toBe('READY');
    expect(result.phaseResults).toHaveLength(2);
    expect(result.failedPhase).toBeNull();
  });

  test('FATAL failure → FAILED', async () => {
    const ctx = new BootstrapContext({ cmkProvider: { getProviderId: () => 'test' } });
    const phases = [
      { name: 'P1', check: failCheck('P1', 'fatal error'), failureClass: 'FATAL' },
      { name: 'P2', check: successCheck('P2'), failureClass: 'FATAL' }
    ];
    const result = await engine.run(ctx, phases);
    expect(result.status).toBe('FAILED');
    expect(result.failedPhase).toBe('P1');
    expect(result.errorDetails).toBe('fatal error');
    expect(result.phaseResults).toHaveLength(1); // P2 not executed
  });

  test('RECOVERABLE retry succeeds', async () => {
    const ctx = new BootstrapContext({ cmkProvider: { getProviderId: () => 'test' } });
    const phases = [
      { name: 'P1', check: retryThenSucceed('P1', 1), failureClass: 'RECOVERABLE' }
    ];
    const result = await engine.run(ctx, phases);
    expect(result.status).toBe('READY');
    expect(result.phaseResults[0].success).toBe(true);
  });

  test('RECOVERABLE retries exhausted strict → FAILED', async () => {
    const ctx = new BootstrapContext({ cmkProvider: { getProviderId: () => 'test' }, strictMode: true });
    const phases = [
      { name: 'P1', check: failCheck('P1', 'perm fail'), failureClass: 'RECOVERABLE' }
    ];
    const result = await engine.run(ctx, phases);
    expect(result.status).toBe('FAILED');
    expect(result.failedPhase).toBe('P1');
  });

  test('RECOVERABLE retries exhausted tolerant → DEGRADED', async () => {
    const ctx = new BootstrapContext({ cmkProvider: { getProviderId: () => 'test' }, strictMode: false });
    const phases = [
      { name: 'P1', check: failCheck('P1', 'perm fail'), failureClass: 'RECOVERABLE' },
      { name: 'P2', check: successCheck('P2'), failureClass: 'FATAL' }
    ];
    const result = await engine.run(ctx, phases);
    expect(result.status).toBe('DEGRADED');
    expect(result.phaseResults).toHaveLength(2);
  });

  test('ADVISORY failure continues', async () => {
    const ctx = new BootstrapContext({ cmkProvider: { getProviderId: () => 'test' } });
    const phases = [
      { name: 'P1', check: failCheck('P1', 'warning'), failureClass: 'ADVISORY' },
      { name: 'P2', check: successCheck('P2'), failureClass: 'FATAL' }
    ];
    const result = await engine.run(ctx, phases);
    expect(result.status).toBe('READY');
    expect(result.phaseResults).toHaveLength(2);
    expect(result.phaseResults[0].success).toBe(false);
    expect(result.phaseResults[1].success).toBe(true);
  });

  test('timeout → BootstrapTimeoutError', async () => {
    const ctx = new BootstrapContext({
      cmkProvider: { getProviderId: () => 'test' },
      bootstrapTimeoutMs: 1
    });
    // Delay so timeout triggers
    const slowCheck = { check: async () => { await new Promise(r => setTimeout(r, 10)); return PhaseResult.success('P1', 10); } };
    const phases = [
      { name: 'P1', check: slowCheck, failureClass: 'FATAL' },
      { name: 'P2', check: successCheck('P2'), failureClass: 'FATAL' }
    ];
    await expect(engine.run(ctx, phases)).rejects.toThrow(BootstrapTimeoutError);
  });

  test('emits structured events via EventBus', async () => {
    const bus = new CollectingEventBus();
    const ctx = new BootstrapContext({
      cmkProvider: { getProviderId: () => 'test' },
      eventBus: bus
    });
    const phases = [
      { name: 'P1', check: successCheck('P1'), failureClass: 'FATAL' }
    ];
    await engine.run(ctx, phases);
    const eventNames = bus.events.map(e => e.event);
    expect(eventNames).toContain('lcl.bootstrap.started');
    expect(eventNames).toContain('lcl.bootstrap.P1.started');
    expect(eventNames).toContain('lcl.bootstrap.P1.completed');
    expect(eventNames).toContain('lcl.bootstrap.ready');
    // Verify structured fields
    const started = bus.events.find(e => e.event === 'lcl.bootstrap.started');
    expect(started.result).toBe('started');
    expect(started.tier).toBe('L2');
  });

  test('check throws error → treated as failure', async () => {
    const ctx = new BootstrapContext({ cmkProvider: { getProviderId: () => 'test' } });
    const throwingCheck = { check: async () => { throw new Error('boom'); } };
    const phases = [
      { name: 'P1', check: throwingCheck, failureClass: 'FATAL' }
    ];
    const result = await engine.run(ctx, phases);
    expect(result.status).toBe('FAILED');
    expect(result.errorDetails).toBe('boom');
  });
});

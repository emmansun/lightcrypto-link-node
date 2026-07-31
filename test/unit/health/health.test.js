'use strict';

const { LclHealthStatus, worst } = require('../../../src/health/LclHealthStatus');
const ComponentHealthCheck = require('../../../src/health/ComponentHealthCheck');
const LclHealthCollector = require('../../../src/health/LclHealthCollector');

describe('LclHealthStatus', () => {
  test('has four states', () => {
    expect(LclHealthStatus.STARTING).toBe('STARTING');
    expect(LclHealthStatus.READY).toBe('READY');
    expect(LclHealthStatus.DEGRADED).toBe('DEGRADED');
    expect(LclHealthStatus.FAILED).toBe('FAILED');
  });

  test('is frozen', () => {
    expect(Object.isFrozen(LclHealthStatus)).toBe(true);
  });
});

describe('worst()', () => {
  test('FAILED dominates all', () => {
    expect(worst(LclHealthStatus.FAILED, LclHealthStatus.READY)).toBe('FAILED');
    expect(worst(LclHealthStatus.READY, LclHealthStatus.FAILED)).toBe('FAILED');
    expect(worst(LclHealthStatus.FAILED, LclHealthStatus.DEGRADED)).toBe('FAILED');
  });

  test('DEGRADED dominates STARTING and READY', () => {
    expect(worst(LclHealthStatus.DEGRADED, LclHealthStatus.READY)).toBe('DEGRADED');
    expect(worst(LclHealthStatus.STARTING, LclHealthStatus.DEGRADED)).toBe('DEGRADED');
  });

  test('STARTING dominates READY', () => {
    expect(worst(LclHealthStatus.STARTING, LclHealthStatus.READY)).toBe('STARTING');
    expect(worst(LclHealthStatus.READY, LclHealthStatus.STARTING)).toBe('STARTING');
  });

  test('same status returns itself', () => {
    expect(worst(LclHealthStatus.READY, LclHealthStatus.READY)).toBe('READY');
    expect(worst(LclHealthStatus.FAILED, LclHealthStatus.FAILED)).toBe('FAILED');
  });
});

describe('ComponentHealthCheck', () => {
  test('throws Not implemented when not overridden', () => {
    const check = new ComponentHealthCheck();
    expect(() => check.check()).toThrow('Not implemented');
  });

  test('can be subclassed', () => {
    class ReadyCheck extends ComponentHealthCheck {
      check() { return LclHealthStatus.READY; }
    }
    expect(new ReadyCheck().check()).toBe('READY');
  });
});

describe('LclHealthCollector', () => {
  function makeCheck(status) {
    return { check: () => status };
  }

  test('returns READY when no checks registered', () => {
    const collector = new LclHealthCollector({});
    const { overall, details } = collector.collect();
    expect(overall).toBe('READY');
    expect(details.overall).toBe('READY');
    expect(details.sdkVersion).toBeDefined();
  });

  test('returns READY when all checks are READY', () => {
    const collector = new LclHealthCollector({
      vault: makeCheck(LclHealthStatus.READY),
      kms: makeCheck(LclHealthStatus.READY)
    });
    const { overall, details } = collector.collect();
    expect(overall).toBe('READY');
    expect(details.vault).toBe('READY');
    expect(details.kms).toBe('READY');
  });

  test('returns worst status across checks', () => {
    const collector = new LclHealthCollector({
      vault: makeCheck(LclHealthStatus.READY),
      kms: makeCheck(LclHealthStatus.DEGRADED)
    });
    const { overall } = collector.collect();
    expect(overall).toBe('DEGRADED');
  });

  test('FAILED check makes overall FAILED', () => {
    const collector = new LclHealthCollector({
      vault: makeCheck(LclHealthStatus.READY),
      kms: makeCheck(LclHealthStatus.FAILED)
    });
    const { overall, details } = collector.collect();
    expect(overall).toBe('FAILED');
    expect(details.kms).toBe('FAILED');
  });

  test('exception in check() treated as FAILED', () => {
    const throwingCheck = { check: () => { throw new Error('connection refused'); } };
    const collector = new LclHealthCollector({
      vault: makeCheck(LclHealthStatus.READY),
      kms: throwingCheck
    });
    const { overall, details } = collector.collect();
    expect(overall).toBe('FAILED');
    expect(details.kms).toBe('FAILED');
  });

  test('includes sdkVersion in details', () => {
    const collector = new LclHealthCollector({});
    const { details } = collector.collect();
    expect(details.sdkVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('handles null checks gracefully', () => {
    const collector = new LclHealthCollector(null);
    const { overall } = collector.collect();
    expect(overall).toBe('READY');
  });
});

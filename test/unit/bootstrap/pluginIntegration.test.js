'use strict';

const { BootstrapEngine } = require('../../../src/bootstrap');
const BootstrapContext = require('../../../src/bootstrap/BootstrapContext');
const { PhaseResult } = require('../../../src/bootstrap/BootstrapResult');
const { createDefaultPhases } = require('../../../src/bootstrap');
const NoOpEventBus = require('../../../src/event/NoOpEventBus');
const EventBus = require('../../../src/event/EventBus');

describe('Bootstrap plugin integration', () => {
  test('bootstrap with passing checks → READY', async () => {
    const ctx = new BootstrapContext({
      cmkProvider: { getProviderId: () => 'test', getPublicReference: () => 'ref' }
    });
    const engine = new BootstrapEngine();
    const phases = [
      { name: 'P1', check: { check: async () => PhaseResult.success('P1', 1) }, failureClass: 'FATAL' },
      { name: 'P2', check: { check: async () => PhaseResult.success('P2', 1) }, failureClass: 'FATAL' }
    ];
    const result = await engine.run(ctx, phases);
    expect(result.status).toBe('READY');
  });

  test('bootstrap with FATAL failure → FAILED', async () => {
    const ctx = new BootstrapContext({
      cmkProvider: { getProviderId: () => 'test' }
    });
    const engine = new BootstrapEngine();
    const phases = [
      { name: 'P1', check: { check: async () => PhaseResult.failure('P1', 1, 'config invalid') }, failureClass: 'FATAL' }
    ];
    const result = await engine.run(ctx, phases);
    expect(result.status).toBe('FAILED');
    expect(result.failedPhase).toBe('P1');
  });

  test('createDefaultPhases returns 4 phases', () => {
    const phases = createDefaultPhases();
    expect(phases).toHaveLength(4);
    expect(phases[0].name).toBe('BOOT-1 Config');
    expect(phases[0].failureClass).toBe('FATAL');
    expect(phases[1].name).toBe('BOOT-2 KMS');
    expect(phases[1].failureClass).toBe('RECOVERABLE');
    expect(phases[2].name).toBe('BOOT-3 Vault');
    expect(phases[2].failureClass).toBe('RECOVERABLE');
    expect(phases[3].name).toBe('BOOT-4 KAT');
    expect(phases[3].failureClass).toBe('FATAL');
  });

  test('BootstrapContext missing cmkProvider → throws', () => {
    expect(() => new BootstrapContext({})).toThrow('BootstrapContext requires cmkProvider');
    expect(() => new BootstrapContext()).toThrow('BootstrapContext requires cmkProvider');
  });

  test('BootstrapContext defaults', () => {
    const ctx = new BootstrapContext({ cmkProvider: { getProviderId: () => 'test' } });
    expect(ctx.strictMode).toBe(true);
    expect(ctx.bootstrapTimeoutMs).toBe(15000);
    expect(ctx.vaultStore).toBeNull();
    expect(typeof ctx.onEvent).toBe('function');
    expect(ctx.eventBus).toBe(NoOpEventBus.INSTANCE);
  });

  test('BootstrapContext custom config', () => {
    const mockVault = { exists: async () => true };
    const onEvent = jest.fn();
    const ctx = new BootstrapContext({
      cmkProvider: { getProviderId: () => 'test' },
      vaultStore: mockVault,
      strictMode: false,
      bootstrapTimeoutMs: 5000,
      onEvent
    });
    expect(ctx.vaultStore).toBe(mockVault);
    expect(ctx.strictMode).toBe(false);
    expect(ctx.bootstrapTimeoutMs).toBe(5000);
    ctx.onEvent('test', {});
    expect(onEvent).toHaveBeenCalledWith('test', {});
  });

  test('BootstrapContext is frozen', () => {
    const ctx = new BootstrapContext({ cmkProvider: { getProviderId: () => 'test' } });
    expect(Object.isFrozen(ctx)).toBe(true);
  });

  test('BootstrapContext with eventBus option', () => {
    class TestBus extends EventBus {
      constructor() { super(); this.events = []; }
      emit(e) { this.events.push(e); }
    }
    const bus = new TestBus();
    const ctx = new BootstrapContext({
      cmkProvider: { getProviderId: () => 'test' },
      eventBus: bus
    });
    expect(ctx.eventBus).toBe(bus);
  });

  test('BootstrapContext onEvent wraps as CallbackEventBus', async () => {
    const events = [];
    const ctx = new BootstrapContext({
      cmkProvider: { getProviderId: () => 'test' },
      onEvent: (name, _detail) => events.push(name)
    });
    // eventBus should be a wrapper, not NoOp
    expect(ctx.eventBus).not.toBe(NoOpEventBus.INSTANCE);
    // Emit through eventBus and verify callback is invoked
    const LclEvent = require('../../../src/event/LclEvent');
    const EventTier = require('../../../src/event/EventTier');
    const event = LclEvent.builder().event('lcl.test').tier(EventTier.L1).result('ok').build();
    ctx.eventBus.emit(event);
    expect(events).toContain('lcl.test');
  });
});

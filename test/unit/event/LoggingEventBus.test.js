'use strict';

const LoggingEventBus = require('../../../src/event/LoggingEventBus');
const LclEvent = require('../../../src/event/LclEvent');
const EventTier = require('../../../src/event/EventTier');

describe('LoggingEventBus', () => {
  let messages;
  let bus;

  beforeEach(() => {
    messages = { debug: [], info: [] };
    const logger = {
      debug: (msg) => messages.debug.push(msg),
      info: (msg) => messages.info.push(msg)
    };
    bus = new LoggingEventBus({ logger });
  });

  function buildEvent(overrides = {}) {
    const builder = LclEvent.builder()
      .event(overrides.event || 'lcl.test.event')
      .tier(overrides.tier || EventTier.L2)
      .result(overrides.result || 'success');

    if (overrides.namespace) builder.namespace(overrides.namespace);
    if (overrides.durationMicros !== undefined) builder.durationMicros(overrides.durationMicros);
    if (overrides.algorithm) builder.algorithm(overrides.algorithm);
    if (overrides.dekVersion !== undefined) builder.dekVersion(overrides.dekVersion);
    if (overrides.errorType) builder.errorType(overrides.errorType);
    if (overrides.attributes) builder.attributes(overrides.attributes);

    return builder.build();
  }

  describe('log level mapping', () => {
    test('L1 events go to debug', () => {
      bus.emit(buildEvent({ tier: EventTier.L1 }));
      expect(messages.debug).toHaveLength(1);
      expect(messages.info).toHaveLength(0);
    });

    test('L2 events go to info', () => {
      bus.emit(buildEvent({ tier: EventTier.L2 }));
      expect(messages.info).toHaveLength(1);
      expect(messages.debug).toHaveLength(0);
    });

    test('L3 events go to info', () => {
      bus.emit(buildEvent({ tier: EventTier.L3 }));
      expect(messages.info).toHaveLength(1);
      expect(messages.debug).toHaveLength(0);
    });
  });

  describe('JSON structure', () => {
    test('includes required fields', () => {
      bus.emit(buildEvent({ event: 'lcl.rotation.execute.completed', namespace: 'ns1' }));
      const parsed = JSON.parse(messages.info[0].replace('[LCL] ', ''));
      expect(parsed.event).toBe('lcl.rotation.execute.completed');
      expect(parsed.tier).toBe('L2');
      expect(parsed.result).toBe('success');
      expect(parsed.namespace).toBe('ns1');
      expect(parsed.timestamp).toBeDefined();
    });

    test('includes optional fields when present', () => {
      bus.emit(buildEvent({
        durationMicros: 1234,
        algorithm: 'AES_256_GCM',
        dekVersion: 3,
        errorType: 'KeyResolutionError',
        attributes: new Map([['kid', 'v3-abc12345']])
      }));
      const parsed = JSON.parse(messages.info[0].replace('[LCL] ', ''));
      expect(parsed.durationMicros).toBe(1234);
      expect(parsed.algorithm).toBe('AES_256_GCM');
      expect(parsed.dekVersion).toBe(3);
      expect(parsed.errorType).toBe('KeyResolutionError');
      expect(parsed.attributes).toEqual({ kid: 'v3-abc12345' });
    });

    test('omits optional fields when absent', () => {
      bus.emit(buildEvent());
      const parsed = JSON.parse(messages.info[0].replace('[LCL] ', ''));
      expect(parsed.namespace).toBeUndefined();
      expect(parsed.algorithm).toBeUndefined();
      expect(parsed.errorType).toBeUndefined();
      expect(parsed.attributes).toBeUndefined();
      expect(parsed.durationMicros).toBeUndefined();
      expect(parsed.dekVersion).toBeUndefined();
    });
  });

  describe('prefix', () => {
    test('default prefix is [LCL]', () => {
      bus.emit(buildEvent());
      expect(messages.info[0]).toMatch(/^\[LCL] \{/);
    });

    test('custom prefix', () => {
      const customBus = new LoggingEventBus({
        logger: { info: (msg) => messages.info.push(msg) },
        prefix: '[CRYPTO]'
      });
      customBus.emit(buildEvent());
      expect(messages.info[0]).toMatch(/^\[CRYPTO] \{/);
    });

    test('empty prefix omits prefix', () => {
      const noPrefixBus = new LoggingEventBus({
        logger: { info: (msg) => messages.info.push(msg) },
        prefix: ''
      });
      noPrefixBus.emit(buildEvent());
      expect(messages.info[0]).toMatch(/^\{/);
    });
  });

  describe('constructor defaults', () => {
    test('works with no options (uses console)', () => {
      const defaultBus = new LoggingEventBus();
      expect(defaultBus).toBeInstanceOf(LoggingEventBus);
    });
  });
});

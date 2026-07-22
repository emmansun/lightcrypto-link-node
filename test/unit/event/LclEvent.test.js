'use strict';

const LclEvent = require('../../../src/event/LclEvent');
const EventTier = require('../../../src/event/EventTier');

describe('LclEvent', () => {
  test('Builder builds valid event with all fields', () => {
    const ts = new Date('2026-01-01T00:00:00Z');
    const attrs = new Map([['key1', 'val1']]);
    const event = LclEvent.builder()
      .event('lcl.bootstrap.started')
      .tier(EventTier.L2)
      .result('success')
      .timestamp(ts)
      .durationMicros(1500)
      .namespace('default.default.User#phone')
      .algorithm('AES_256_GCM')
      .dekVersion(3)
      .errorType('TimeoutError')
      .attributes(attrs)
      .build();

    expect(event.event).toBe('lcl.bootstrap.started');
    expect(event.tier).toBe('L2');
    expect(event.result).toBe('success');
    expect(event.timestamp).toBe(ts);
    expect(event.durationMicros).toBe(1500);
    expect(event.namespace).toBe('default.default.User#phone');
    expect(event.algorithm).toBe('AES_256_GCM');
    expect(event.dekVersion).toBe(3);
    expect(event.errorType).toBe('TimeoutError');
    expect(event.attributes.get('key1')).toBe('val1');
  });

  test('Builder defaults: timestamp=now, durationMicros=-1, dekVersion=-1, attributes=empty', () => {
    const event = LclEvent.builder()
      .event('lcl.test')
      .tier(EventTier.L1)
      .result('ok')
      .build();

    expect(event.timestamp).toBeInstanceOf(Date);
    expect(event.durationMicros).toBe(-1);
    expect(event.dekVersion).toBe(-1);
    expect(event.attributes.size).toBe(0);
    expect(event.namespace).toBeNull();
    expect(event.algorithm).toBeNull();
    expect(event.errorType).toBeNull();
  });

  test('missing event → throws', () => {
    expect(() => LclEvent.builder().tier(EventTier.L1).result('ok').build())
      .toThrow('LclEvent requires event');
  });

  test('missing tier → throws', () => {
    expect(() => LclEvent.builder().event('lcl.test').result('ok').build())
      .toThrow('LclEvent requires tier');
  });

  test('missing result → throws', () => {
    expect(() => LclEvent.builder().event('lcl.test').tier(EventTier.L1).build())
      .toThrow('LclEvent requires result');
  });

  test('event name exceeding 96 chars → throws', () => {
    const longName = 'a'.repeat(97);
    expect(() => LclEvent.builder().event(longName).tier(EventTier.L1).result('ok').build())
      .toThrow('must not exceed 96 characters');
  });

  test('event name exactly 96 chars → succeeds', () => {
    const name = 'a'.repeat(96);
    const event = LclEvent.builder().event(name).tier(EventTier.L1).result('ok').build();
    expect(event.event).toBe(name);
  });

  test('instance is frozen (Object.isFrozen)', () => {
    const event = LclEvent.builder().event('lcl.test').tier(EventTier.L2).result('ok').build();
    expect(Object.isFrozen(event)).toBe(true);
  });

  test('attributes Map is frozen (immutable)', () => {
    const attrs = new Map([['k', 'v']]);
    const event = LclEvent.builder().event('lcl.test').tier(EventTier.L1).result('ok').attributes(attrs).build();
    expect(Object.isFrozen(event.attributes)).toBe(true);
    // Frozen Map: cannot add/delete own properties
    expect(() => { Object.defineProperty(event.attributes, 'x', { value: 1 }); }).toThrow();
  });
});

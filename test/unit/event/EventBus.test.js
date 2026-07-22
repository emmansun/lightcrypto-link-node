'use strict';

const EventBus = require('../../../src/event/EventBus');
const NoOpEventBus = require('../../../src/event/NoOpEventBus');
const CompositeEventBus = require('../../../src/event/CompositeEventBus');
const LclEvent = require('../../../src/event/LclEvent');
const EventTier = require('../../../src/event/EventTier');

function makeEvent(name) {
  return LclEvent.builder()
    .event(name || 'lcl.test')
    .tier(EventTier.L1)
    .result('ok')
    .build();
}

describe('EventBus', () => {
  test('base class emit() throws "Not implemented"', () => {
    const bus = new EventBus();
    expect(() => bus.emit(makeEvent())).toThrow('Not implemented');
  });
});

describe('NoOpEventBus', () => {
  test('INSTANCE is a singleton', () => {
    expect(NoOpEventBus.INSTANCE).toBeInstanceOf(NoOpEventBus);
    expect(NoOpEventBus.INSTANCE).toBeInstanceOf(EventBus);
    // Same reference every time
    expect(NoOpEventBus.INSTANCE).toBe(NoOpEventBus.INSTANCE);
  });

  test('INSTANCE is frozen', () => {
    expect(Object.isFrozen(NoOpEventBus.INSTANCE)).toBe(true);
  });

  test('emit() is a no-op (does not throw)', () => {
    expect(() => NoOpEventBus.INSTANCE.emit(makeEvent())).not.toThrow();
  });
});

describe('CompositeEventBus', () => {
  test('all delegates receive event in order', () => {
    const order = [];
    const bus1 = { emit: () => order.push('bus1') };
    const bus2 = { emit: () => order.push('bus2') };
    const bus3 = { emit: () => order.push('bus3') };

    const composite = new CompositeEventBus([bus1, bus2, bus3]);
    composite.emit(makeEvent());

    expect(order).toEqual(['bus1', 'bus2', 'bus3']);
  });

  test('delegate failure isolation — remaining delegates still receive', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const order = [];
    const bus1 = { emit: () => order.push('bus1') };
    const throwingBus = { emit: () => { throw new Error('boom'); } };
    const bus3 = { emit: () => order.push('bus3') };

    const composite = new CompositeEventBus([bus1, throwingBus, bus3]);
    expect(() => composite.emit(makeEvent())).not.toThrow();

    expect(order).toEqual(['bus1', 'bus3']);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('empty delegates → emit is a no-op', () => {
    const composite = new CompositeEventBus([]);
    expect(() => composite.emit(makeEvent())).not.toThrow();
  });

  test('no argument → empty delegates', () => {
    const composite = new CompositeEventBus();
    expect(() => composite.emit(makeEvent())).not.toThrow();
    expect(composite.delegates).toEqual([]);
  });

  test('delegates array is frozen', () => {
    const composite = new CompositeEventBus([{ emit: () => {} }]);
    expect(Object.isFrozen(composite.delegates)).toBe(true);
  });
});

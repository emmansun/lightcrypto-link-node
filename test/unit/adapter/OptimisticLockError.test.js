'use strict';

const OptimisticLockError = require('../../../src/adapter/OptimisticLockError');

describe('OptimisticLockError (unit)', () => {
  test('is an instance of Error', () => {
    const err = new OptimisticLockError('lcl-dek-User', 1, 2);
    expect(err).toBeInstanceOf(Error);
  });

  test('has name OptimisticLockError', () => {
    const err = new OptimisticLockError('lcl-dek-User', 1, 2);
    expect(err.name).toBe('OptimisticLockError');
  });

  test('includes namespace in message', () => {
    const err = new OptimisticLockError('lcl-dek-User', 1, 2);
    expect(err.message).toContain('lcl-dek-User');
  });

  test('includes expected version in message', () => {
    const err = new OptimisticLockError('lcl-dek-User', 5, 3);
    expect(err.message).toContain('5');
  });

  test('includes actual version in message', () => {
    const err = new OptimisticLockError('lcl-dek-User', 5, 3);
    expect(err.message).toContain('3');
  });

  test('stores namespace property', () => {
    const err = new OptimisticLockError('lcl-dek-Order', 2, 4);
    expect(err.namespace).toBe('lcl-dek-Order');
  });

  test('stores expected property', () => {
    const err = new OptimisticLockError('lcl-dek-Order', 2, 4);
    expect(err.expected).toBe(2);
  });

  test('stores actual property', () => {
    const err = new OptimisticLockError('lcl-dek-Order', 2, 4);
    expect(err.actual).toBe(4);
  });

  test('has a stack trace', () => {
    const err = new OptimisticLockError('lcl-dek-User', 1, 2);
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('OptimisticLockError');
  });

  test('can be caught as Error', () => {
    try {
      throw new OptimisticLockError('lcl-dek-User', 1, 2);
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e).toBeInstanceOf(OptimisticLockError);
    }
  });
});

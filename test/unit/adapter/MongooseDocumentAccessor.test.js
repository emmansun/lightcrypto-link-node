'use strict';

const MongooseDocumentAccessor = require('../../../src/adapter/MongooseDocumentAccessor');

describe('MongooseDocumentAccessor', () => {
  let accessor;

  beforeEach(() => {
    accessor = new MongooseDocumentAccessor();
  });

  describe('getField', () => {
    test('returns field value', () => {
      expect(accessor.getField({ name: 'Alice' }, 'name')).toBe('Alice');
    });

    test('returns undefined for missing field', () => {
      expect(accessor.getField({ name: 'Alice' }, 'age')).toBeUndefined();
    });

    test('returns undefined for null doc', () => {
      expect(accessor.getField(null, 'name')).toBeUndefined();
    });
  });

  describe('setField', () => {
    test('sets field in-place', () => {
      const doc = { name: 'Alice' };
      accessor.setField(doc, 'name', 'Bob');
      expect(doc.name).toBe('Bob');
    });

    test('adds new field', () => {
      const doc = {};
      accessor.setField(doc, 'age', 30);
      expect(doc.age).toBe(30);
    });

    test('no-op on null doc', () => {
      expect(() => accessor.setField(null, 'name', 'Bob')).not.toThrow();
    });
  });

  describe('isDocumentLike', () => {
    test('returns true for plain object', () => {
      expect(accessor.isDocumentLike({ a: 1 })).toBe(true);
    });

    test('returns true for empty object', () => {
      expect(accessor.isDocumentLike({})).toBe(true);
    });

    test('returns false for null', () => {
      expect(accessor.isDocumentLike(null)).toBe(false);
    });

    test('returns false for undefined', () => {
      expect(accessor.isDocumentLike(undefined)).toBe(false);
    });

    test('returns false for Array', () => {
      expect(accessor.isDocumentLike([1, 2])).toBe(false);
    });

    test('returns false for Buffer', () => {
      expect(accessor.isDocumentLike(Buffer.from('abc'))).toBe(false);
    });

    test('returns false for Date', () => {
      expect(accessor.isDocumentLike(new Date())).toBe(false);
    });

    test('returns false for string', () => {
      expect(accessor.isDocumentLike('hello')).toBe(false);
    });

    test('returns false for number', () => {
      expect(accessor.isDocumentLike(42)).toBe(false);
    });

    test('returns false for ObjectId-like', () => {
      expect(accessor.isDocumentLike({ _bsontype: 'ObjectId' })).toBe(false);
    });
  });

  describe('asList', () => {
    test('returns array for array', () => {
      const arr = [1, 2, 3];
      expect(accessor.asList(arr)).toBe(arr);
    });

    test('returns null for non-array', () => {
      expect(accessor.asList({ a: 1 })).toBeNull();
    });

    test('returns null for null', () => {
      expect(accessor.asList(null)).toBeNull();
    });

    test('returns empty array for empty array', () => {
      expect(accessor.asList([])).toEqual([]);
    });
  });

  describe('asMap', () => {
    test('returns entries for plain object', () => {
      const entries = accessor.asMap({ a: 1, b: 2 });
      expect(entries).toEqual([['a', 1], ['b', 2]]);
    });

    test('returns empty entries for empty object', () => {
      expect(accessor.asMap({})).toEqual([]);
    });

    test('returns null for array', () => {
      expect(accessor.asMap([1, 2])).toBeNull();
    });

    test('returns null for null', () => {
      expect(accessor.asMap(null)).toBeNull();
    });

    test('returns null for string', () => {
      expect(accessor.asMap('hello')).toBeNull();
    });
  });
});

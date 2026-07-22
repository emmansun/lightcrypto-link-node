'use strict';

const BsonStructuredValueCodec = require('../../../src/adapter/BsonStructuredValueCodec');

describe('BsonStructuredValueCodec', () => {
  let codec;

  beforeEach(() => {
    codec = new BsonStructuredValueCodec();
  });

  describe('DOC encode/decode round-trip', () => {
    test('simple object', () => {
      const obj = { name: 'Alice', age: 30 };
      const encoded = codec.encode(obj, 'DOC');
      expect(Buffer.isBuffer(encoded)).toBe(true);
      const decoded = codec.decode(encoded, 'DOC');
      expect(decoded).toEqual(obj);
    });

    test('nested object', () => {
      const obj = { address: { city: 'Shanghai' }, tags: ['a', 'b'] };
      const encoded = codec.encode(obj, 'DOC');
      const decoded = codec.decode(encoded, 'DOC');
      expect(decoded).toEqual(obj);
    });

    test('empty object', () => {
      const obj = {};
      const encoded = codec.encode(obj, 'DOC');
      const decoded = codec.decode(encoded, 'DOC');
      expect(decoded).toEqual(obj);
    });
  });

  describe('MAP encode/decode round-trip', () => {
    test('simple map', () => {
      const map = { key1: 'value1', key2: 42 };
      const encoded = codec.encode(map, 'MAP');
      expect(Buffer.isBuffer(encoded)).toBe(true);
      const decoded = codec.decode(encoded, 'MAP');
      expect(decoded).toEqual(map);
    });
  });

  describe('COL encode/decode round-trip', () => {
    test('simple array', () => {
      const arr = ['a', 'b', 'c'];
      const encoded = codec.encode(arr, 'COL');
      expect(Buffer.isBuffer(encoded)).toBe(true);
      const decoded = codec.decode(encoded, 'COL');
      expect(decoded).toEqual(arr);
    });

    test('array of numbers', () => {
      const arr = [1, 2, 3];
      const encoded = codec.encode(arr, 'COL');
      const decoded = codec.decode(encoded, 'COL');
      expect(decoded).toEqual(arr);
    });

    test('empty array', () => {
      const arr = [];
      const encoded = codec.encode(arr, 'COL');
      const decoded = codec.decode(encoded, 'COL');
      expect(decoded).toEqual(arr);
    });

    test('array of objects', () => {
      const arr = [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 2 }];
      const encoded = codec.encode(arr, 'COL');
      const decoded = codec.decode(encoded, 'COL');
      expect(decoded).toEqual(arr);
    });
  });

  describe('COL wrapper format', () => {
    test('COL wraps as { _v: arr }', () => {
      const arr = ['x', 'y'];
      const encoded = codec.encode(arr, 'COL');
      // Decode as DOC to see the wrapper
      const wrapper = codec.decode(encoded, 'DOC');
      expect(wrapper).toHaveProperty('_v');
      expect(wrapper._v).toEqual(arr);
    });
  });

  describe('invalid typeMarker', () => {
    test('encode throws for unsupported typeMarker', () => {
      expect(() => codec.encode({}, 'INVALID')).toThrow('Unsupported typeMarker');
    });

    test('decode throws for unsupported typeMarker', () => {
      expect(() => codec.decode(Buffer.alloc(0), 'INVALID')).toThrow('Unsupported typeMarker');
    });
  });
});

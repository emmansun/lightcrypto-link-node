'use strict';

const BsonCodec = require('../../../src/crypto/BsonCodec');

describe('BsonCodec', () => {
  let codec;

  beforeEach(() => {
    codec = new BsonCodec();
  });

  describe('encodeDocument / decodeDocument round-trip', () => {
    test('simple object', () => {
      const obj = { name: 'Alice', age: 30 };
      const encoded = codec.encodeDocument(obj);
      expect(Buffer.isBuffer(encoded)).toBe(true);
      const decoded = codec.decodeDocument(encoded);
      expect(decoded).toEqual(obj);
    });

    test('nested object', () => {
      const obj = { address: { city: 'Shanghai', street: '123 Main' }, tags: ['a', 'b'] };
      const encoded = codec.encodeDocument(obj);
      const decoded = codec.decodeDocument(encoded);
      expect(decoded).toEqual(obj);
    });

    test('empty object', () => {
      const obj = {};
      const encoded = codec.encodeDocument(obj);
      const decoded = codec.decodeDocument(encoded);
      expect(decoded).toEqual(obj);
    });

    test('mixed types', () => {
      const obj = { str: 'hello', num: 42, bool: true, nil: null, arr: [1, 2, 3] };
      const encoded = codec.encodeDocument(obj);
      const decoded = codec.decodeDocument(encoded);
      expect(decoded).toEqual(obj);
    });

    test('encoded output is a Buffer', () => {
      const encoded = codec.encodeDocument({ x: 1 });
      expect(Buffer.isBuffer(encoded)).toBe(true);
    });
  });

  describe('encodeCollection / decodeCollection round-trip', () => {
    test('simple array', () => {
      const arr = ['a', 'b', 'c'];
      const encoded = codec.encodeCollection(arr);
      expect(Buffer.isBuffer(encoded)).toBe(true);
      const decoded = codec.decodeCollection(encoded);
      expect(decoded).toEqual(arr);
    });

    test('array of numbers', () => {
      const arr = [1, 2, 3];
      const encoded = codec.encodeCollection(arr);
      const decoded = codec.decodeCollection(encoded);
      expect(decoded).toEqual(arr);
    });

    test('empty array', () => {
      const arr = [];
      const encoded = codec.encodeCollection(arr);
      const decoded = codec.decodeCollection(encoded);
      expect(decoded).toEqual(arr);
    });

    test('array of objects', () => {
      const arr = [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 2 }];
      const encoded = codec.encodeCollection(arr);
      const decoded = codec.decodeCollection(encoded);
      expect(decoded).toEqual(arr);
    });

    test('encoded output is a Buffer', () => {
      const encoded = codec.encodeCollection([1, 2]);
      expect(Buffer.isBuffer(encoded)).toBe(true);
    });
  });

  describe('collection wrapper format', () => {
    test('encodeCollection wraps as { _v: arr }', () => {
      const arr = ['x', 'y'];
      const encoded = codec.encodeCollection(arr);
      // Decode as document to see the wrapper
      const wrapper = codec.decodeDocument(encoded);
      expect(wrapper).toHaveProperty('_v');
      expect(wrapper._v).toEqual(arr);
    });
  });
});

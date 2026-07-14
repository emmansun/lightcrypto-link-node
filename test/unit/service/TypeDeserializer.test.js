'use strict';

const TypeDeserializer = require('../../../src/service/TypeDeserializer');

describe('TypeDeserializer', () => {
  let deserializer;

  beforeEach(() => {
    deserializer = new TypeDeserializer();
  });

  test('STR: returns string', () => {
    expect(deserializer.deserialize('STR', 'hello')).toBe('hello');
    expect(deserializer.deserialize('STR', '')).toBe('');
  });

  test('INT: parses as integer', () => {
    expect(deserializer.deserialize('INT', '42')).toBe(42);
    expect(deserializer.deserialize('INT', '-100')).toBe(-100);
    expect(deserializer.deserialize('INT', '0')).toBe(0);
  });

  test('LONG: parses as number with warning for unsafe values', () => {
    expect(deserializer.deserialize('LONG', '12345')).toBe(12345);
    // Large values trigger warning but still return Number
    const result = deserializer.deserialize('LONG', '9007199254740993');
    expect(typeof result).toBe('number');
  });

  test('SHORT: parses as integer', () => {
    expect(deserializer.deserialize('SHORT', '100')).toBe(100);
  });

  test('BYTE: parses as integer', () => {
    expect(deserializer.deserialize('BYTE', '127')).toBe(127);
  });

  test('FLOAT: parses as float', () => {
    expect(deserializer.deserialize('FLOAT', '3.14')).toBeCloseTo(3.14);
  });

  test('DOUBLE: parses as float', () => {
    expect(deserializer.deserialize('DOUBLE', '2.718281828')).toBeCloseTo(2.718281828);
  });

  test('DEC: converts to Decimal128 or string', () => {
    const result = deserializer.deserialize('DEC', '123.456');
    // Should return Decimal128 if bson is available, else string
    expect(result).toBeDefined();
  });

  test('BOOL: parses "true"/"false"', () => {
    expect(deserializer.deserialize('BOOL', 'true')).toBe(true);
    expect(deserializer.deserialize('BOOL', 'false')).toBe(false);
  });

  test('LDATE: parses YYYY-MM-DD as UTC midnight Date', () => {
    const result = deserializer.deserialize('LDATE', '1996-05-15');
    expect(result).toBeInstanceOf(Date);
    expect(result.getUTCFullYear()).toBe(1996);
    expect(result.getUTCMonth()).toBe(4); // May = 4 (0-indexed)
    expect(result.getUTCDate()).toBe(15);
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
  });

  test('LDT: parses YYYY-MM-DDTHH:mm:ss as Date', () => {
    const result = deserializer.deserialize('LDT', '1996-05-15T14:30:45');
    expect(result).toBeInstanceOf(Date);
    expect(result.getUTCFullYear()).toBe(1996);
    expect(result.getUTCMonth()).toBe(4);
    expect(result.getUTCDate()).toBe(15);
    expect(result.getUTCHours()).toBe(14);
    expect(result.getUTCMinutes()).toBe(30);
    expect(result.getUTCSeconds()).toBe(45);
  });

  test('BYTES: returns Buffer from base64', () => {
    const b64 = Buffer.from([1, 2, 3]).toString('base64');
    const result = deserializer.deserialize('BYTES', b64);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result[0]).toBe(1);
    expect(result[1]).toBe(2);
    expect(result[2]).toBe(3);
  });

  test('ENUM: returns string (enum name)', () => {
    expect(deserializer.deserialize('ENUM:com.example.Status', 'ACTIVE')).toBe('ACTIVE');
  });

  test('unknown type marker returns string as-is', () => {
    expect(deserializer.deserialize('UNKNOWN', 'value')).toBe('value');
  });

  describe('round-trip with TypeSerializer', () => {
    const TypeSerializer = require('../../../src/service/TypeSerializer');
    let serializer;

    beforeEach(() => {
      serializer = new TypeSerializer();
    });

    test('String round-trip', () => {
      const original = 'hello world';
      const serialized = serializer.serializeToString(original);
      const deserialized = deserializer.deserialize('STR', serialized);
      expect(deserialized).toBe(original);
    });

    test('Integer round-trip', () => {
      const original = 42;
      const serialized = serializer.serializeToString(original);
      const deserialized = deserializer.deserialize('INT', serialized);
      expect(deserialized).toBe(original);
    });

    test('Boolean round-trip', () => {
      expect(deserializer.deserialize('BOOL', serializer.serializeToString(true))).toBe(true);
      expect(deserializer.deserialize('BOOL', serializer.serializeToString(false))).toBe(false);
    });

    test('LocalDate round-trip', () => {
      const original = new Date(Date.UTC(1996, 4, 15));
      const serialized = serializer.serializeToString(original);
      const deserialized = deserializer.deserialize('LDATE', serialized);
      expect(deserialized.getTime()).toBe(original.getTime());
    });

    test('LocalDateTime round-trip', () => {
      const original = new Date(Date.UTC(1996, 4, 15, 14, 30, 45));
      const serialized = serializer.serializeToString(original);
      const deserialized = deserializer.deserialize('LDT', serialized);
      expect(deserialized.getTime()).toBe(original.getTime());
    });

    test('Negative numbers round-trip', () => {
      const serialized = serializer.serializeToString(-123);
      const deserialized = deserializer.deserialize('INT', serialized);
      expect(deserialized).toBe(-123);
    });
  });
});

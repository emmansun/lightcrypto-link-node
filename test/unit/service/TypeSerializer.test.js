'use strict';

const TypeSerializer = require('../../../src/service/TypeSerializer');

describe('TypeSerializer', () => {
  let serializer;

  beforeEach(() => {
    serializer = new TypeSerializer();
  });

  describe('serializeToString', () => {
    test('String: raw UTF-8', () => {
      expect(serializer.serializeToString('hello')).toBe('hello');
      expect(serializer.serializeToString('你好')).toBe('你好');
    });

    test('Integer: toString()', () => {
      expect(serializer.serializeToString(123)).toBe('123');
      expect(serializer.serializeToString(-456)).toBe('-456');
      expect(serializer.serializeToString(0)).toBe('0');
    });

    test('Float/Double: toString()', () => {
      expect(serializer.serializeToString(3.14)).toBe('3.14');
      expect(serializer.serializeToString(-0.5)).toBe('-0.5');
    });

    test('Boolean: "true" or "false"', () => {
      expect(serializer.serializeToString(true)).toBe('true');
      expect(serializer.serializeToString(false)).toBe('false');
    });

    test('Buffer: Base64 encoding', () => {
      const buf = Buffer.from([0x01, 0x02, 0x03]);
      expect(serializer.serializeToString(buf)).toBe(buf.toString('base64'));
    });

    test('Date (LocalDate): YYYY-MM-DD format', () => {
      const date = new Date(Date.UTC(1996, 4, 15)); // May 15, 1996
      expect(serializer.serializeToString(date)).toBe('1996-05-15');
    });

    test('Date (LocalDateTime): YYYY-MM-DDTHH:mm:ss format', () => {
      const date = new Date(Date.UTC(1996, 4, 15, 14, 30, 0));
      expect(serializer.serializeToString(date)).toBe('1996-05-15T14:30:00.000');
    });

    test('Date (LocalDateTime): YYYY-MM-DDTHH:mm:ss.SSS format', () => {
      const date = new Date(Date.UTC(1996, 4, 15, 14, 30, 0, 500));
      expect(serializer.serializeToString(date)).toBe('1996-05-15T14:30:00.500');
    });

    test('null/undefined throws', () => {
      expect(() => serializer.serializeToString(null)).toThrow();
      expect(() => serializer.serializeToString(undefined)).toThrow();
    });

    test('serialization determinism: same input always produces same output', () => {
      const values = ['hello', 123, true, false, 3.14];
      for (const val of values) {
        expect(serializer.serializeToString(val)).toBe(serializer.serializeToString(val));
      }
    });
  });

  describe('serialize (Uint8Array)', () => {
    test('returns Uint8Array from UTF-8 string', () => {
      const buf = serializer.serialize('hello');
      expect(buf).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(buf)).toBe('hello');
    });
  });

  describe('resolveTypeMarker', () => {
    test('String → STR', () => {
      expect(serializer.resolveTypeMarker('hello')).toBe('STR');
    });

    test('Integer → INT', () => {
      expect(serializer.resolveTypeMarker(42)).toBe('INT');
      expect(serializer.resolveTypeMarker(-100)).toBe('INT');
    });

    test('Large integer → LONG', () => {
      expect(serializer.resolveTypeMarker(2147483648)).toBe('LONG');
    });

    test('Float → DOUBLE', () => {
      expect(serializer.resolveTypeMarker(3.14)).toBe('DOUBLE');
    });

    test('Boolean → BOOL', () => {
      expect(serializer.resolveTypeMarker(true)).toBe('BOOL');
      expect(serializer.resolveTypeMarker(false)).toBe('BOOL');
    });

    test('Buffer → BYTES', () => {
      expect(serializer.resolveTypeMarker(Buffer.from([1]))).toBe('BYTES');
    });

    test('Date (no time) → LDATE', () => {
      expect(serializer.resolveTypeMarker(new Date(Date.UTC(2024, 0, 1)))).toBe('LDATE');
    });

    test('Date (with time) → LDT', () => {
      expect(serializer.resolveTypeMarker(new Date(Date.UTC(2024, 0, 1, 12, 0, 0)))).toBe('LDT');
    });

    test('Mongoose type hint overrides', () => {
      expect(serializer.resolveTypeMarker(null, 'String')).toBe('STR');
      expect(serializer.resolveTypeMarker(null, 'Boolean')).toBe('BOOL');
      expect(serializer.resolveTypeMarker(null, 'Decimal128')).toBe('DEC');
      expect(serializer.resolveTypeMarker(null, 'Long')).toBe('LONG');
    });
  });
});

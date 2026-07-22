'use strict';

const MongooseStorageAdapter = require('../../../src/adapter/MongooseStorageAdapter');

describe('MongooseStorageAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new MongooseStorageAdapter();
  });

  describe('buildEncryptedPayload', () => {
    test('builds payload without blindIndex', () => {
      const payload = adapter.buildEncryptedPayload('blob123', 'STR');
      expect(payload).toEqual({ c: 'blob123', _e: 1, _t: 'STR' });
      expect(payload).not.toHaveProperty('b');
    });

    test('builds payload with blindIndex', () => {
      const payload = adapter.buildEncryptedPayload('blob123', 'STR', 'bi456');
      expect(payload).toEqual({ c: 'blob123', _e: 1, _t: 'STR', b: 'bi456' });
    });

    test('omits blindIndex when null', () => {
      const payload = adapter.buildEncryptedPayload('blob123', 'DOC', null);
      expect(payload).toEqual({ c: 'blob123', _e: 1, _t: 'DOC' });
      expect(payload).not.toHaveProperty('b');
    });
  });

  describe('extractBlob', () => {
    test('extracts blob from valid payload', () => {
      expect(adapter.extractBlob({ c: 'blob123', _e: 1, _t: 'STR' })).toBe('blob123');
    });

    test('returns null for null payload', () => {
      expect(adapter.extractBlob(null)).toBeNull();
    });

    test('returns null for non-object', () => {
      expect(adapter.extractBlob('string')).toBeNull();
    });

    test('returns null when c is missing', () => {
      expect(adapter.extractBlob({ _e: 1, _t: 'STR' })).toBeNull();
    });
  });

  describe('extractTypeMarker', () => {
    test('extracts type marker from valid payload', () => {
      expect(adapter.extractTypeMarker({ c: 'blob', _e: 1, _t: 'DOC' })).toBe('DOC');
    });

    test('returns null for null payload', () => {
      expect(adapter.extractTypeMarker(null)).toBeNull();
    });

    test('returns null when _t is missing', () => {
      expect(adapter.extractTypeMarker({ c: 'blob', _e: 1 })).toBeNull();
    });
  });

  describe('extractBlindIndex', () => {
    test('extracts blind index when present', () => {
      expect(adapter.extractBlindIndex({ c: 'blob', _e: 1, _t: 'STR', b: 'bi' })).toBe('bi');
    });

    test('returns null when b is absent', () => {
      expect(adapter.extractBlindIndex({ c: 'blob', _e: 1, _t: 'STR' })).toBeNull();
    });

    test('returns null for null payload', () => {
      expect(adapter.extractBlindIndex(null)).toBeNull();
    });
  });

  describe('isEncryptedPayload', () => {
    test('returns true for valid encrypted payload', () => {
      expect(adapter.isEncryptedPayload({ _e: 1, _t: 'STR', c: 'blob' })).toBe(true);
    });

    test('returns false for null', () => {
      expect(adapter.isEncryptedPayload(null)).toBe(false);
    });

    test('returns false for non-object', () => {
      expect(adapter.isEncryptedPayload('string')).toBe(false);
    });

    test('returns false when _e is not 1', () => {
      expect(adapter.isEncryptedPayload({ _e: 0, _t: 'STR' })).toBe(false);
    });

    test('returns false when _e is undefined', () => {
      expect(adapter.isEncryptedPayload({ _t: 'STR' })).toBe(false);
    });
  });

  describe('round-trip', () => {
    test('build then extract', () => {
      const payload = adapter.buildEncryptedPayload('cipher', 'INT', 'blind');
      expect(adapter.extractBlob(payload)).toBe('cipher');
      expect(adapter.extractTypeMarker(payload)).toBe('INT');
      expect(adapter.extractBlindIndex(payload)).toBe('blind');
      expect(adapter.isEncryptedPayload(payload)).toBe(true);
    });

    test('build without blindIndex then extract', () => {
      const payload = adapter.buildEncryptedPayload('cipher', 'COL');
      expect(adapter.extractBlob(payload)).toBe('cipher');
      expect(adapter.extractTypeMarker(payload)).toBe('COL');
      expect(adapter.extractBlindIndex(payload)).toBeNull();
      expect(adapter.isEncryptedPayload(payload)).toBe(true);
    });
  });
});

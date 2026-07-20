'use strict';

const { LclAlgorithms } = require('../../../src/provider/LclAlgorithms');

describe('LclAlgorithms', () => {
  test('contains all expected algorithm identifiers', () => {
    expect(LclAlgorithms.AES_256_GCM).toBe('AES-256-GCM');
    expect(LclAlgorithms.SM4_GCM).toBe('SM4-GCM');
    expect(LclAlgorithms.SM4_CBC).toBe('SM4-CBC');
    expect(LclAlgorithms.RSA_OAEP_256).toBe('RSA-OAEP-256');
    expect(LclAlgorithms.KMS_DATA_KEY).toBe('KMS-DATA-KEY');
  });

  test('is frozen (immutable)', () => {
    expect(Object.isFrozen(LclAlgorithms)).toBe(true);
  });

  test('cannot add new properties', () => {
    expect(() => {
      LclAlgorithms.NEW_ALGO = 'NEW-ALGO';
    }).toThrow();
    expect(LclAlgorithms.NEW_ALGO).toBeUndefined();
  });

  test('cannot modify existing properties', () => {
    expect(() => {
      LclAlgorithms.AES_256_GCM = 'MODIFIED';
    }).toThrow();
    expect(LclAlgorithms.AES_256_GCM).toBe('AES-256-GCM');
  });

  test('has exactly 5 algorithm entries', () => {
    expect(Object.keys(LclAlgorithms).length).toBe(5);
  });
});

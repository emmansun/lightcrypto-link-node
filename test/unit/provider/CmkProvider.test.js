'use strict';

const CmkProvider = require('../../../src/provider/CmkProvider');

describe('CmkProvider (base class)', () => {
  let provider;

  beforeEach(() => {
    provider = new CmkProvider();
  });

  test('getProviderId throws "must be implemented"', () => {
    expect(() => provider.getProviderId()).toThrow('getProviderId() must be implemented by subclass');
  });

  test('getPublicReference throws "must be implemented"', () => {
    expect(() => provider.getPublicReference()).toThrow('getPublicReference() must be implemented by subclass');
  });

  test('supportsAlgorithm returns false by default', () => {
    expect(provider.supportsAlgorithm('AES-256-GCM')).toBe(false);
    expect(provider.supportsAlgorithm('SM4-CBC')).toBe(false);
  });

  test('mapAlgorithm returns original algorithm by default', () => {
    expect(provider.mapAlgorithm('AES-256-GCM')).toBe('AES-256-GCM');
    expect(provider.mapAlgorithm('SM4-CBC')).toBe('SM4-CBC');
  });

  test('getCmkVersion returns null by default', () => {
    expect(provider.getCmkVersion()).toBeNull();
  });

  test('_ensureResolved resolves without error', async () => {
    await expect(provider._ensureResolved()).resolves.toBeUndefined();
  });

  test('wrap throws "must be implemented"', async () => {
    await expect(provider.wrap(Buffer.alloc(32))).rejects.toThrow('wrap() must be implemented by subclass');
  });

  test('unwrap throws "must be implemented"', async () => {
    await expect(provider.unwrap({ ciphertext: Buffer.alloc(32), algorithm: 'AES-256-GCM' }))
      .rejects.toThrow('unwrap() must be implemented by subclass');
  });
});

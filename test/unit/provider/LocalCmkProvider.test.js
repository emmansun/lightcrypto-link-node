'use strict';

const crypto = require('crypto');
const LocalCmkProvider = require('../../../src/provider/LocalCmkProvider');

describe('LocalCmkProvider', () => {
  let cmkHex;

  beforeEach(() => {
    cmkHex = crypto.randomBytes(32).toString('hex');
  });

  test('constructor accepts 64-char hex string', () => {
    expect(() => new LocalCmkProvider(cmkHex)).not.toThrow();
  });

  test('constructor accepts 32-byte Buffer', () => {
    expect(() => new LocalCmkProvider(crypto.randomBytes(32))).not.toThrow();
  });

  test('constructor rejects invalid hex string', () => {
    expect(() => new LocalCmkProvider('short')).toThrow('64 hex characters');
    expect(() => new LocalCmkProvider('zz'.repeat(32))).toThrow('64 hex characters');
  });

  test('constructor rejects wrong-size Buffer', () => {
    expect(() => new LocalCmkProvider(Buffer.alloc(16))).toThrow('32 bytes');
  });

  test('getProviderId returns "local-symmetric"', () => {
    const provider = new LocalCmkProvider(cmkHex);
    expect(provider.getProviderId()).toBe('local-symmetric');
  });

  test('getPublicReference returns format "local-cmk-sha256:{8 hex chars}"', () => {
    const provider = new LocalCmkProvider(cmkHex);
    const ref = provider.getPublicReference();
    expect(ref).toMatch(/^local-cmk-sha256:[0-9a-f]{8}$/);
  });

  test('wrap/unwrap round-trip', async () => {
    const provider = new LocalCmkProvider(cmkHex);
    const plaintextKey = crypto.randomBytes(32);

    const wrapped = await provider.wrap(plaintextKey);
    expect(wrapped.ciphertext).toBeInstanceOf(Buffer);
    expect(wrapped.algorithm).toBe('AES-256-GCM');
    expect(wrapped.metadata).toEqual({});

    const unwrapped = await provider.unwrap(wrapped);
    expect(unwrapped.equals(plaintextKey)).toBe(true);
  });

  test('wrap output format: [IV (12B)] || [ciphertext + Auth Tag (16B)]', async () => {
    const provider = new LocalCmkProvider(cmkHex);
    const key = crypto.randomBytes(32);
    const wrapped = await provider.wrap(key);

    // 12 (IV) + 32 (key) + 16 (tag) = 60
    expect(wrapped.ciphertext.length).toBe(60);
  });

  test('wrap produces different ciphertext each time', async () => {
    const provider = new LocalCmkProvider(cmkHex);
    const key = crypto.randomBytes(32);
    const wrapped1 = await provider.wrap(key);
    const wrapped2 = await provider.wrap(key);
    expect(wrapped1.ciphertext.equals(wrapped2.ciphertext)).toBe(false);
  });

  test('unwrap fails with wrong CMK', async () => {
    const provider1 = new LocalCmkProvider(cmkHex);
    const provider2 = new LocalCmkProvider(crypto.randomBytes(32).toString('hex'));
    const key = crypto.randomBytes(32);

    const wrapped = await provider1.wrap(key);
    await expect(provider2.unwrap(wrapped)).rejects.toThrow();
  });
});

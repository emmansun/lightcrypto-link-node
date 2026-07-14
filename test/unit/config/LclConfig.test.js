'use strict';

const LclConfig = require('../../../src/config/LclConfig');

describe('LclConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Clear LCL env vars
    delete process.env.LCL_CMK_KEY;
    delete process.env.LCL_MONGODB_URI;
    delete process.env.LCL_ALGORITHM;
    delete process.env.LCL_CACHE_TTL;
    delete process.env.LCL_CMK_PROVIDER;
    delete process.env.LCL_AWS_SECRET_ID;
    delete process.env.LCL_AZURE_SECRET_URL;
    delete process.env.LCL_VAULT_ADDR;
    delete process.env.LCL_VAULT_TOKEN;
    delete process.env.NODE_ENV;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('loads defaults when no sources configured', async () => {
    const config = new LclConfig();
    await config.load();

    expect(config.algorithm).toBe('AES_256_GCM');
    expect(config.cacheTtl).toBe(3600000);
    expect(config.keyVaultCollection).toBe('__lcl_keyvault');
    expect(config.cmkProvider).toBe('local-symmetric');
  });

  test('environment variables override defaults', async () => {
    const cmkHex = 'a'.repeat(64);
    process.env.LCL_CMK_KEY = cmkHex;
    process.env.LCL_ALGORITHM = 'AES_256_CBC';
    process.env.LCL_CACHE_TTL = '7200000';

    const config = new LclConfig();
    await config.load();

    expect(config.cmkKey).toBe(cmkHex);
    expect(config.algorithm).toBe('AES_256_CBC');
    expect(config.cacheTtl).toBe(7200000);
  });

  test('validation rejects invalid CMK hex', async () => {
    process.env.LCL_CMK_KEY = 'invalid';

    const config = new LclConfig();
    await expect(config.load()).rejects.toThrow('64 hex characters');
  });

  test('validation rejects unsupported algorithm', async () => {
    process.env.LCL_ALGORITHM = 'INVALID_ALGO';

    const config = new LclConfig();
    await expect(config.load()).rejects.toThrow('Unsupported algorithm');
  });

  test('validation rejects SM4_GCM', async () => {
    process.env.LCL_ALGORITHM = 'SM4_GCM';

    const config = new LclConfig();
    await expect(config.load()).rejects.toThrow('SM4_GCM is not yet supported');
  });

  test('reload detects CMK change', async () => {
    const cmk1 = 'a'.repeat(64);
    const cmk2 = 'b'.repeat(64);
    process.env.LCL_CMK_KEY = cmk1;

    const config = new LclConfig();
    await config.load();
    expect(config.cmkKey).toBe(cmk1);

    process.env.LCL_CMK_KEY = cmk2;
    const result = await config.reload();
    expect(result.cmkChanged).toBe(true);
    expect(config.cmkKey).toBe(cmk2);
  });

  test('mongodbUri loaded from env', async () => {
    process.env.LCL_MONGODB_URI = 'mongodb://localhost:27017/test';

    const config = new LclConfig();
    await config.load();
    expect(config.mongodbUri).toBe('mongodb://localhost:27017/test');
  });
});

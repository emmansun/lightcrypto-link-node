'use strict';

const ConfigValidationCheck = require('../../../src/bootstrap/ConfigValidationCheck');
const KmsReachabilityCheck = require('../../../src/bootstrap/KmsReachabilityCheck');
const VaultReachabilityCheck = require('../../../src/bootstrap/VaultReachabilityCheck');
const BootstrapContext = require('../../../src/bootstrap/BootstrapContext');

describe('ConfigValidationCheck', () => {
  test('valid provider → success', async () => {
    const ctx = new BootstrapContext({ cmkProvider: { getProviderId: () => 'local-symmetric' } });
    const check = new ConfigValidationCheck();
    const result = await check.check(ctx);
    expect(result.success).toBe(true);
    expect(result.name).toBe('BOOT-1 Config');
  });

  test('invalid getProviderId → failure', async () => {
    const ctx = new BootstrapContext({ cmkProvider: { getProviderId: () => '' } });
    const check = new ConfigValidationCheck();
    const result = await check.check(ctx);
    expect(result.success).toBe(false);
  });

  test('getProviderId throws → failure', async () => {
    const ctx = new BootstrapContext({ cmkProvider: { getProviderId: () => { throw new Error('nope'); } } });
    const check = new ConfigValidationCheck();
    const result = await check.check(ctx);
    expect(result.success).toBe(false);
    expect(result.error).toBe('nope');
  });
});

describe('KmsReachabilityCheck', () => {
  test('reachable → success', async () => {
    const ctx = new BootstrapContext({ cmkProvider: { getProviderId: () => 'test', getPublicReference: () => 'ref-123' } });
    const check = new KmsReachabilityCheck();
    const result = await check.check(ctx);
    expect(result.success).toBe(true);
    expect(result.name).toBe('BOOT-2 KMS');
  });

  test('unreachable → failure', async () => {
    const ctx = new BootstrapContext({ cmkProvider: { getProviderId: () => 'test', getPublicReference: () => { throw new Error('timeout'); } } });
    const check = new KmsReachabilityCheck();
    const result = await check.check(ctx);
    expect(result.success).toBe(false);
    expect(result.error).toBe('timeout');
  });

  test('no getPublicReference → success with note', async () => {
    const ctx = new BootstrapContext({ cmkProvider: { getProviderId: () => 'test' } });
    const check = new KmsReachabilityCheck();
    const result = await check.check(ctx);
    expect(result.success).toBe(true);
    expect(result.note).toBe('skipped: no getPublicReference');
  });
});

describe('VaultReachabilityCheck', () => {
  test('reachable → success', async () => {
    const ctx = new BootstrapContext({
      cmkProvider: { getProviderId: () => 'test' },
      vaultStore: { exists: async () => false }
    });
    const check = new VaultReachabilityCheck();
    const result = await check.check(ctx);
    expect(result.success).toBe(true);
    expect(result.name).toBe('BOOT-3 Vault');
  });

  test('unreachable → failure', async () => {
    const ctx = new BootstrapContext({
      cmkProvider: { getProviderId: () => 'test' },
      vaultStore: { exists: async () => { throw new Error('connection refused'); } }
    });
    const check = new VaultReachabilityCheck();
    const result = await check.check(ctx);
    expect(result.success).toBe(false);
    expect(result.error).toBe('connection refused');
  });

  test('no vaultStore → success with note', async () => {
    const ctx = new BootstrapContext({ cmkProvider: { getProviderId: () => 'test' } });
    const check = new VaultReachabilityCheck();
    const result = await check.check(ctx);
    expect(result.success).toBe(true);
    expect(result.note).toBe('skipped: no vaultStore');
  });
});

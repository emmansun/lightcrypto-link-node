'use strict';

const KatRunner = require('../../../src/bootstrap/KatRunner');
const BootstrapContext = require('../../../src/bootstrap/BootstrapContext');

describe('KatRunner', () => {
  let runner;
  let ctx;

  beforeEach(() => {
    runner = new KatRunner();
    ctx = new BootstrapContext({ cmkProvider: { getProviderId: () => 'test' } });
  });

  test('all KATs pass', async () => {
    const result = await runner.check(ctx);
    expect(result.success).toBe(true);
    expect(result.name).toBe('BOOT-4 KAT');
    expect(result.error).toBeNull();
  });

  test('getLastResults returns map after run', async () => {
    await runner.check(ctx);
    const results = runner.getLastResults();
    expect(results.size).toBeGreaterThan(0);
    expect(results.get('aes-256-gcm')).toBeDefined();
    expect(results.get('aes-256-gcm').passed).toBe(true);
    expect(results.get('blind-index')).toBeDefined();
    expect(results.get('blind-index').passed).toBe(true);
    expect(results.get('kcv')).toBeDefined();
    expect(results.get('kcv').passed).toBe(true);
  });

  test('durationMs is populated', async () => {
    const result = await runner.check(ctx);
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

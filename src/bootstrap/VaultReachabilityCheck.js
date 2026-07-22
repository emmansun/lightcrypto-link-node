'use strict';

const { PhaseResult } = require('./BootstrapResult');

/**
 * Verifies VaultStore reachability via exists() probe.
 */
class VaultReachabilityCheck {
  async check(context) {
    const start = Date.now();

    if (!context.vaultStore) {
      const result = PhaseResult.success('BOOT-3 Vault', Date.now() - start);
      result.note = 'skipped: no vaultStore';
      return result;
    }

    try {
      await context.vaultStore.exists('__lcl_bootstrap_probe');
      return PhaseResult.success('BOOT-3 Vault', Date.now() - start);
    } catch (err) {
      return PhaseResult.failure('BOOT-3 Vault', Date.now() - start, err.message);
    }
  }
}

module.exports = VaultReachabilityCheck;

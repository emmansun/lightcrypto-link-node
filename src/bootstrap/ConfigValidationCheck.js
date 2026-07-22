'use strict';

const { PhaseResult } = require('./BootstrapResult');

/**
 * Validates that cmkProvider is present and getProviderId() works.
 */
class ConfigValidationCheck {
  async check(context) {
    const start = Date.now();
    try {
      if (!context.cmkProvider) {
        return PhaseResult.failure('BOOT-1 Config', Date.now() - start, 'cmkProvider is required');
      }
      const providerId = context.cmkProvider.getProviderId();
      if (!providerId || typeof providerId !== 'string' || providerId.trim() === '') {
        return PhaseResult.failure('BOOT-1 Config', Date.now() - start, 'cmkProvider.getProviderId() returned empty or invalid value');
      }
      return PhaseResult.success('BOOT-1 Config', Date.now() - start);
    } catch (err) {
      return PhaseResult.failure('BOOT-1 Config', Date.now() - start, err.message);
    }
  }
}

module.exports = ConfigValidationCheck;

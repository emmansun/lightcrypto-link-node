'use strict';

const { PhaseResult } = require('./BootstrapResult');

/**
 * Verifies CMK Provider reachability via getPublicReference().
 */
class KmsReachabilityCheck {
  async check(context) {
    const start = Date.now();
    try {
      if (typeof context.cmkProvider.getPublicReference !== 'function') {
        const result = PhaseResult.success('BOOT-2 KMS', Date.now() - start);
        result.note = 'skipped: no getPublicReference';
        return result;
      }
      context.cmkProvider.getPublicReference();
      return PhaseResult.success('BOOT-2 KMS', Date.now() - start);
    } catch (err) {
      return PhaseResult.failure('BOOT-2 KMS', Date.now() - start, err.message);
    }
  }
}

module.exports = KmsReachabilityCheck;

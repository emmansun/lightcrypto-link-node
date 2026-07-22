'use strict';

const BootstrapEngine = require('./BootstrapEngine');
const BootstrapContext = require('./BootstrapContext');
const { BootstrapResult, PhaseResult } = require('./BootstrapResult');
const BootstrapTimeoutError = require('./BootstrapTimeoutError');
const KatRunner = require('./KatRunner');
const KatVectorLoader = require('./KatVectorLoader');
const ConfigValidationCheck = require('./ConfigValidationCheck');
const KmsReachabilityCheck = require('./KmsReachabilityCheck');
const VaultReachabilityCheck = require('./VaultReachabilityCheck');

/**
 * Factory function returning the standard bootstrap phases in order.
 * @returns {Array<{name: string, check: Object, failureClass: string}>}
 */
function createDefaultPhases() {
  return [
    { name: 'BOOT-1 Config', check: new ConfigValidationCheck(), failureClass: 'FATAL' },
    { name: 'BOOT-2 KMS', check: new KmsReachabilityCheck(), failureClass: 'RECOVERABLE' },
    { name: 'BOOT-3 Vault', check: new VaultReachabilityCheck(), failureClass: 'RECOVERABLE' },
    { name: 'BOOT-4 KAT', check: new KatRunner(), failureClass: 'FATAL' }
  ];
}

module.exports = {
  BootstrapEngine,
  BootstrapContext,
  BootstrapResult,
  PhaseResult,
  BootstrapTimeoutError,
  KatRunner,
  KatVectorLoader,
  ConfigValidationCheck,
  KmsReachabilityCheck,
  VaultReachabilityCheck,
  createDefaultPhases
};

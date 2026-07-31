'use strict';

const { LclHealthStatus, worst } = require('./LclHealthStatus');

const SDK_VERSION = require('../../package.json').version;

/**
 * Composes ComponentHealthCheck results into overall status and details map.
 * Pure logic class with no framework dependencies — usable in Express, Fastify,
 * or raw HTTP health endpoints for k8s readiness/liveness probes.
 * Aligned with Java LclHealthCollector.
 *
 * @example
 * const collector = new LclHealthCollector({
 *   vault: new VaultHealthCheck(vaultStore),
 *   kms: new KmsHealthCheck(cmkProvider)
 * });
 * const { overall, details } = collector.collect();
 * // → { overall: 'READY', details: { vault: 'READY', kms: 'READY', overall: 'READY', sdkVersion: '1.3.0' } }
 */
class LclHealthCollector {
  /**
   * @param {Object<string, import('./ComponentHealthCheck')>} checks - Named health checks
   */
  constructor(checks) {
    this._checks = checks || {};
  }

  /**
   * Collect health status from all registered checks.
   * @returns {{ overall: string, details: Object<string, string> }}
   */
  collect() {
    let overall = LclHealthStatus.READY;
    const details = {};

    for (const [name, check] of Object.entries(this._checks)) {
      let status;
      try {
        status = check.check();
      } catch (_e) {
        status = LclHealthStatus.FAILED;
      }
      details[name] = status;
      overall = worst(overall, status);
    }

    details.overall = overall;
    details.sdkVersion = SDK_VERSION;

    return { overall, details };
  }
}

module.exports = LclHealthCollector;

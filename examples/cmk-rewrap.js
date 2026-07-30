'use strict';

/**
 * Cross-CMK Provider Re-Wrap Example:
 * Demonstrates migrating vault key wrapping from LOCAL to a (simulated) cloud provider
 * with dry-run validation and live migration modes, using InMemoryVaultStore.
 *
 * Usage: node examples/cmk-rewrap.js
 */

const crypto = require('crypto');
const { KeyVaultService, LocalCmkProvider, InMemoryVaultStore } = require('../src');
const CmkProvider = require('../src/provider/CmkProvider');

/**
 * Simulated cloud KMS provider for demonstration purposes.
 * In production, replace with AzureKmsProvider or AlibabaKmsProvider.
 */
class SimulatedCloudKmsProvider extends CmkProvider {
  constructor(keyId) {
    super();
    this._key = crypto.randomBytes(32);
    this._keyId = keyId;
  }

  getProviderId() {
    return 'simulated-cloud-kms';
  }

  getPublicReference() {
    return `simulated-cloud-kms:${this._keyId}`;
  }

  async wrap(plaintextKey) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this._key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintextKey), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      ciphertext: Buffer.concat([iv, encrypted, tag]),
      algorithm: 'AES-256-GCM',
      metadata: { cmkVersion: 'sim-v1' }
    };
  }

  async unwrap(wrappedKey) {
    const data = wrappedKey.ciphertext;
    const iv = data.subarray(0, 12);
    const tag = data.subarray(data.length - 16);
    const ciphertext = data.subarray(12, data.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this._key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}

async function main() {
  console.log('=== Cross-CMK Provider Re-Wrap Demo ===\n');

  // 1. Setup: LOCAL provider + InMemoryVaultStore
  const localCmk = new LocalCmkProvider('a'.repeat(64));
  const vaultStore = new InMemoryVaultStore();

  // EventBus for observability
  const events = [];
  const eventBus = {
    emit(event) {
      events.push(event);
      console.log(`   [EVENT] ${event.event} | result=${event.result} | ns=${event.namespace || 'batch'}`);
    }
  };

  const keyVaultService = new KeyVaultService({
    vaultStore,
    cmkProvider: localCmk,
    eventBus
  });

  // 2. Initialize vaults for multiple namespaces
  console.log('1. Initializing vaults with LOCAL provider...');
  const namespaces = [
    'default.default.User#phone',
    'default.default.User#email',
    'default.default.Order#ssn'
  ];
  for (const ns of namespaces) {
    await keyVaultService.ensureVaultInitialized(ns);
    console.log(`   Initialized: ${ns}`);
  }

  // 3. Define target provider (simulated cloud KMS)
  const cloudProvider = new SimulatedCloudKmsProvider('prod-key-2026');
  console.log(`\n2. Target provider: ${cloudProvider.getProviderId()} (${cloudProvider.getPublicReference()})`);

  // 4. Dry-run: validate without mutation
  console.log('\n3. DRY-RUN mode — validating re-wrap feasibility...');
  const dryRunResults = await keyVaultService.rewrapAllVaults(cloudProvider, { dryRun: true });
  for (const r of dryRunResults) {
    console.log(`   [${r.dryRun ? 'DRY-RUN' : 'LIVE'}] ${r.namespace}: success=${r.success}, keys=${r.keyCount}, skipped=${r.skipped}`);
  }

  // Verify vaults are unchanged after dry-run
  const unchangedDoc = await vaultStore.load(namespaces[0]);
  console.log(`\n   Verification: vault version still ${unchangedDoc.v}, provider still "${unchangedDoc.cmk.provider}"`);

  // 5. Live migration
  console.log('\n4. LIVE mode — performing re-wrap...');
  const liveResults = await keyVaultService.rewrapAllVaults(cloudProvider);
  for (const r of liveResults) {
    const durationMs = (r.durationMicros / 1000).toFixed(2);
    console.log(`   [LIVE] ${r.namespace}: success=${r.success}, keys=${r.keyCount}, duration=${durationMs}ms`);
  }

  // 6. Verify migration
  console.log('\n5. Post-migration verification:');
  for (const ns of namespaces) {
    const doc = await vaultStore.load(ns);
    console.log(`   ${ns}: provider="${doc.cmk.provider}", ref="${doc.cmk.id}", version=${doc.v}`);
  }

  // 7. Same-provider no-op demonstration
  console.log('\n6. Same-provider no-op test (re-wrap to same provider):');
  const noopResult = await keyVaultService.rewrapVault(namespaces[0], cloudProvider);
  console.log(`   Result: skipped=${noopResult.skipped} (expected: true)`);

  // Summary
  console.log('\n=== Migration complete ===');
  console.log(`   Total events emitted: ${events.length}`);
  console.log('   Business data remains untouched — only vault wrapping layer changed.');
}

main().catch(console.error);

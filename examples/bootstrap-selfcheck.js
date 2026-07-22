'use strict';

/**
 * Bootstrap Self-Check Example:
 * Demonstrates fail-fast startup verification with structured EventBus events.
 *
 * Bootstrap phases:
 *   BOOT-1 Config Validation (FATAL)       — verifies CMK provider
 *   BOOT-2 KMS Reachability  (RECOVERABLE) — probes KMS via getPublicReference()
 *   BOOT-3 Vault Reachability(RECOVERABLE) — probes VaultStore via exists()
 *   BOOT-4 KAT Verification  (FATAL)       — encrypt/decrypt/blind-index golden vectors
 *
 * This example uses a custom EventBus to log all bootstrap events.
 */

const mongoose = require('mongoose');
const {
  lclCryptoPlugin,
  KeyVaultService,
  LocalCmkProvider,
  prepareEncryptedSchema,
  MongoVaultStore,
  EventBus,
  EventTier
} = require('../src');

// ─── Custom EventBus to observe bootstrap events ──────────────────────

class ConsoleEventBus extends EventBus {
  constructor() {
    super();
    this.events = [];
  }

  emit(event) {
    this.events.push(event);
    const duration = event.durationMicros > 0
      ? ` (${(event.durationMicros / 1000).toFixed(1)}ms)`
      : '';
    const error = event.errorType ? ` [error: ${event.errorType}]` : '';
    const icon = event.result === 'success' ? '✓'
      : event.result === 'failed' ? '✗'
        : event.result === 'degraded' ? '⚠' : '•';
    console.log(`  ${icon} [${event.tier}] ${event.event} → ${event.result}${duration}${error}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  const mongodbUri = process.env.LCL_MONGODB_URI || 'mongodb://localhost:27017/lightcrypto-demo';
  const cmkHex = 'a'.repeat(64); // Demo CMK (use real CMK in production)

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Bootstrap Self-Check + EventBus Example        ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log();

  // 1. Connect to MongoDB
  await mongoose.connect(mongodbUri);
  console.log(`Connected to: ${mongodbUri}\n`);

  // 2. Setup providers
  const cmkProvider = new LocalCmkProvider(cmkHex);
  const vaultStore = new MongoVaultStore(
    mongoose.connection.getClient().db(mongoose.connection.name)
  );

  // 3. Create custom EventBus for observability
  const eventBus = new ConsoleEventBus();

  // 4. Define a schema with encrypted fields
  const userSchema = new mongoose.Schema(prepareEncryptedSchema({
    name: { type: String, required: true },
    phone: { type: String, encrypt: true, blindIndex: true },
    email: { type: String }
  }));

  // 5. Register plugin with bootstrap enabled
  console.log('Running bootstrap self-check...\n');

  userSchema.plugin(lclCryptoPlugin, {
    cmkProvider,
    vaultStore,
    entityName: 'BootstrapUser',
    bootstrap: {
      strictMode: true,      // RECOVERABLE failures → FATAL
      timeoutMs: 15000,      // total timeout
      eventBus              // structured event bus
    }
  });

  const User = mongoose.model('BootstrapUser', userSchema);

  // 6. Trigger the bootstrap (runs on first save)
  const user = new User({ name: 'Test', phone: '13800138000', email: 'test@example.com' });
  await user.save();
  console.log('\nBootstrap passed! User saved successfully.\n');

  // 7. Verify encryption works after bootstrap
  const found = await User.findById(user._id);
  console.log(`Retrieved: name=${found.name}, phone=${found.phone}`);

  // 8. Print event summary
  console.log(`\nEvent Summary: ${eventBus.events.length} events emitted`);
  const eventNames = eventBus.events.map(e => e.event);
  console.log('  Events:', eventNames.join(', '));

  // 9. Demonstrate tolerant mode
  console.log('\n--- Tolerant Mode Demo (strictMode: false) ---\n');
  const eventBus2 = new ConsoleEventBus();

  // Create a vault store that will fail exists() to simulate Vault unreachable
  const failingVaultStore = {
    exists: async () => { throw new Error('Simulated vault unreachable'); },
    save: async () => {},
    load: async () => null,
    loadByVersion: async () => null,
    rotateKeys: async () => {}
  };

  const tolerantSchema = new mongoose.Schema(prepareEncryptedSchema({
    name: String,
    phone: { type: String, encrypt: true }
  }));

  tolerantSchema.plugin(lclCryptoPlugin, {
    cmkProvider,
    vaultStore: failingVaultStore,
    entityName: 'TolerantUser',
    bootstrap: {
      strictMode: false,     // RECOVERABLE failures → DEGRADED (not fatal)
      timeoutMs: 5000,
      eventBus: eventBus2
    }
  });

  const TolerantUser = mongoose.model('TolerantUser', tolerantSchema);

  try {
    const tu = new TolerantUser({ name: 'Tolerant', phone: '13900139000' });
    await tu.save();
  } catch (err) {
    // Expected: encryption will fail because vault is unreachable
    console.log(`\n  Expected error after degraded bootstrap: ${err.message}`);
  }

  console.log(`\n  Tolerant mode events: ${eventBus2.events.length} events emitted`);

  // Cleanup
  await User.deleteMany({});
  try { await mongoose.connection.dropDatabase(); } catch (_) { /* may lack permission */ }
  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(console.error);

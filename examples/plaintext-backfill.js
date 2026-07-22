'use strict';

/**
 * Plaintext Backfill Runner
 *
 * Migrates existing plaintext MongoDB documents to encrypted format by
 * re-saving them through the normal Mongoose encryption write path.
 *
 * Modeled after Java's UserPlaintextBackfillRunner:
 * - Dry-run mode to estimate candidate volume
 * - Batch size control
 * - Cursor-based pagination by _id (resume-safe)
 * - Progress reporting per batch
 *
 * Usage:
 *   node examples/plaintext-backfill.js [--dry-run] [--batch-size=500] [--start-after-id=<ObjectId>]
 *
 * Environment:
 *   MONGODB_URI    - MongoDB connection string (default: mongodb://localhost:27017/lightcrypto-demo)
 *   CMK_KEY        - 64-char hex CMK key (default: 'a' x 64 for demo)
 *   ENTITY_NAME    - Entity name for key vault (default: 'User')
 *   COLLECTION     - Collection name (default: 'users')
 *   ENCRYPTED_FIELDS - Comma-separated encrypted field names (default: 'phone,ssn')
 *   BLIND_INDEX_FIELDS - Comma-separated fields with blindIndex (default: 'phone')
 */

const mongoose = require('mongoose');
const {
  lclCryptoPlugin,
  KeyVaultService,
  LocalCmkProvider,
  prepareEncryptedSchema,
  MongoVaultStore
} = require('../src');

// ─── Parse CLI arguments ────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    dryRun: false,
    batchSize: 500,
    startAfterId: null
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg.startsWith('--batch-size=')) {
      opts.batchSize = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--start-after-id=')) {
      opts.startAfterId = arg.split('=')[1];
    }
  }

  return opts;
}

// ─── Parse environment variables ────────────────────────────────────

function parseEnv() {
  return {
    mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/lightcrypto-demo',
    cmkKey: process.env.CMK_KEY || 'a'.repeat(64),
    entityName: process.env.ENTITY_NAME || 'User',
    collection: process.env.COLLECTION || 'users',
    encryptedFields: (process.env.ENCRYPTED_FIELDS || 'phone,ssn').split(',').map(s => s.trim()),
    blindIndexFields: (process.env.BLIND_INDEX_FIELDS || 'phone').split(',').map(s => s.trim())
  };
}

// ─── Detect plaintext candidates ───────────────────────────────────

/**
 * Check if a raw document has any encrypted field still in plaintext.
 * A field is plaintext if it exists but is NOT an encrypted sub-document
 * (i.e., missing _e marker).
 *
 * @param {Object} rawDoc - Raw MongoDB document
 * @param {string[]} encryptedFields - Field names that should be encrypted
 * @returns {boolean} True if document needs backfill
 */
function isPlaintextCandidate(rawDoc, encryptedFields) {
  for (const fieldName of encryptedFields) {
    const value = rawDoc[fieldName];
    if (value === null || value === undefined) continue;

    // If it's NOT an encrypted sub-document, it's plaintext
    if (typeof value !== 'object' || value._e !== 1) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a document is missing blind index data on fields that require it.
 *
 * @param {Object} rawDoc - Raw MongoDB document
 * @param {string[]} blindIndexFields - Field names that should have blind index
 * @returns {boolean} True if document is missing blind index
 */
function isMissingBlindIndex(rawDoc, blindIndexFields) {
  for (const fieldName of blindIndexFields) {
    const value = rawDoc[fieldName];
    if (value && typeof value === 'object' && value._e === 1 && !value.b) {
      return true;
    }
  }
  return false;
}

// ─── Build dynamic schema ──────────────────────────────────────────

function buildSchema(env) {
  const definition = {};

  for (const fieldName of env.encryptedFields) {
    const hasBlindIndex = env.blindIndexFields.includes(fieldName);
    definition[fieldName] = {
      type: String,
      encrypt: true,
      blindIndex: hasBlindIndex
    };
  }

  // Add a catch-all for other fields (non-encrypted)
  // Using schemaless approach: the schema only defines encrypted fields
  return prepareEncryptedSchema(definition);
}

// ─── Main backfill runner ───────────────────────────────────────────

async function runBackfill(opts, env) {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   LightCrypto-Link Plaintext Backfill Runner     ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log();
  console.log('Configuration:');
  console.log(`  Mode:           ${opts.dryRun ? 'DRY-RUN (no writes)' : 'WRITE (encrypting documents)'}`);
  console.log(`  Batch size:     ${opts.batchSize}`);
  console.log(`  Entity:         ${env.entityName}`);
  console.log(`  Collection:     ${env.collection}`);
  console.log(`  Encrypted:      ${env.encryptedFields.join(', ')}`);
  console.log(`  Blind index:    ${env.blindIndexFields.join(', ')}`);
  console.log(`  Start after ID: ${opts.startAfterId || '(from beginning)'}`);
  console.log();

  // 1. Connect to MongoDB
  await mongoose.connect(env.mongodbUri);
  console.log(`Connected to: ${env.mongodbUri}`);

  // 2. Setup crypto services
  const cmkProvider = new LocalCmkProvider(env.cmkKey);
  const keyVaultService = new KeyVaultService({
    vaultStore: new MongoVaultStore(mongoose.connection.getClient().db(mongoose.connection.name)),
    cmkProvider,
    cacheTtl: 60000
  });

  // 3. Build and register schema
  const schemaDef = buildSchema(env);
  const schema = new mongoose.Schema(schemaDef, { strict: false, collection: env.collection });

  schema.plugin(lclCryptoPlugin, {
    keyVaultService,
    entityName: env.entityName
  });

  const Model = mongoose.model(env.entityName, schema);

  // 4. Estimate total candidates (dry-run scan)
  const totalDocs = await Model.collection.countDocuments({});
  console.log(`\nTotal documents in collection: ${totalDocs}`);

  // 5. Paginate by _id in ascending order
  let lastId = opts.startAfterId ? new mongoose.Types.ObjectId(opts.startAfterId) : null;
  let processed = 0;
  let candidates = 0;
  let migrated = 0;
  let batchNum = 0;
  const startTime = Date.now();

  while (true) {
    // Build query for next page
    const query = {};
    if (lastId) {
      query._id = { $gt: lastId };
    }

    // Fetch next batch from raw collection (bypasses Mongoose hooks)
    const batch = await Model.collection
      .find(query)
      .sort({ _id: 1 })
      .limit(opts.batchSize)
      .toArray();

    if (batch.length === 0) break;

    batchNum++;
    let batchCandidates = 0;
    let batchMigrated = 0;

    for (const rawDoc of batch) {
      processed++;
      const needsBackfill = isPlaintextCandidate(rawDoc, env.encryptedFields);
      const needsBlindIndex = isMissingBlindIndex(rawDoc, env.blindIndexFields);

      if (!needsBackfill && !needsBlindIndex) continue;

      batchCandidates++;
      candidates++;

      if (!opts.dryRun) {
        // Load through Mongoose (triggers post-find decryption)
        // then save (triggers pre-save encryption)
        try {
          const doc = await Model.findById(rawDoc._id);
          if (doc) {
            await doc.save();
            batchMigrated++;
            migrated++;
          }
        } catch (err) {
          console.error(`  ✗ Error migrating ${rawDoc._id}: ${err.message}`);
        }
      }
    }

    // Update cursor
    lastId = batch[batch.length - 1]._id;

    // Progress report
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const pct = totalDocs > 0 ? ((processed / totalDocs) * 100).toFixed(1) : '?';
    console.log(
      `  Batch ${batchNum}: processed ${processed}/${totalDocs} (${pct}%), ` +
      `candidates: ${batchCandidates}, ` +
      (opts.dryRun ? '' : `migrated: ${batchMigrated}, `) +
      `cursor: ${lastId} [${elapsed}s]`
    );

    // Stop if we got fewer results than batch size (last page)
    if (batch.length < opts.batchSize) break;
  }

  // 6. Summary
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log();
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Total processed:   ${processed}`);
  console.log(`  Candidates found:  ${candidates}`);
  if (!opts.dryRun) {
    console.log(`  Migrated:          ${migrated}`);
  }
  console.log(`  Time:              ${totalTime}s`);
  console.log(`  Last cursor:       ${lastId || '(none)'}`);
  console.log('═══════════════════════════════════════════════════');

  if (opts.dryRun && candidates > 0) {
    console.log();
    console.log('To run actual migration:');
    console.log(`  node examples/plaintext-backfill.js --batch-size=${opts.batchSize}`);
  }

  if (!opts.dryRun && candidates > 0) {
    console.log();
    console.log('Migration complete. Verify with:');
    console.log(`  db.${env.collection}.findOne()  // should show encrypted sub-documents`);
  }

  // 7. Cleanup
  keyVaultService.flushCache();
  await mongoose.disconnect();
}

// ─── Entry point ────────────────────────────────────────────────────

const opts = parseArgs();
const env = parseEnv();

runBackfill(opts, env).catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});

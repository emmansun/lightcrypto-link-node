'use strict';

/**
 * Programmatic Encryption Example:
 * Demonstrates encryptValue, decryptValue, and decryptDocument
 * for use outside the Mongoose plugin (raw driver, aggregation pipelines, etc.)
 */

const mongoose = require('mongoose');
const {
  KeyVaultService,
  LocalCmkProvider,
  ProgrammaticCryptoService,
  LclConfig
} = require('../src');

async function main() {
  // 1. Load configuration
  const config = new LclConfig();
  await config.load();

  const cmkProvider = new LocalCmkProvider(config.cmkKey || 'a'.repeat(64));

  // 2. Connect to MongoDB
  await mongoose.connect(config.mongodbUri || 'mongodb://localhost:27017/lightcrypto-demo');

  // 3. Create KeyVaultService
  const keyVaultService = new KeyVaultService({
    connection: mongoose.connection,
    cmkProvider,
    cacheTtl: config.cacheTtl
  });

  // 4. Create ProgrammaticCryptoService
  const programmatic = new ProgrammaticCryptoService({
    keyVaultService,
    algorithm: 'AES_256_GCM'
  });

  // ─── encryptValue / decryptValue ───────────────────────────────────────────

  // Encrypt a scalar value
  const phoneEncrypted = await programmatic.encryptValue('13800138000', 'User');
  console.log('Encrypted sub-document:', {
    _e: phoneEncrypted._e,
    _k: phoneEncrypted._k,
    _a: phoneEncrypted._a,
    _t: phoneEncrypted._t,
    c: `<Buffer ${phoneEncrypted.c.length} bytes>`
  });

  // Decrypt it back
  const phoneDecrypted = await programmatic.decryptValue(phoneEncrypted);
  console.log('Decrypted phone:', phoneDecrypted); // '13800138000'

  // ─── encryptValue with different types ─────────────────────────────────────

  const ageEncrypted = await programmatic.encryptValue(42, 'User');
  console.log('Age type marker:', ageEncrypted._t); // 'INT'

  const activeEncrypted = await programmatic.encryptValue(true, 'User');
  console.log('Active type marker:', activeEncrypted._t); // 'BOOL'

  // ─── decryptDocument on raw MongoDB results ────────────────────────────────

  // Insert encrypted data using the raw driver
  const phoneSubDoc = await programmatic.encryptValue('13900139000', 'User');
  const ssnSubDoc = await programmatic.encryptValue('123-45-6789', 'User');

  await mongoose.connection.collection('contacts').insertOne({
    name: 'Alice',
    phone: phoneSubDoc,
    ssn: ssnSubDoc
  });

  // Read back via raw driver (bypasses Mongoose hooks)
  const rawDoc = await mongoose.connection.collection('contacts').findOne({ name: 'Alice' });
  console.log('\nRaw document phone (encrypted):', rawDoc.phone._e === 1 ? 'yes' : 'no');

  // Decrypt the document in-place
  await programmatic.decryptDocument(rawDoc, 'User', ['phone', 'ssn']);
  console.log('After decryptDocument:');
  console.log('  phone:', rawDoc.phone); // '13900139000'
  console.log('  ssn:', rawDoc.ssn);     // '123-45-6789'
  console.log('  name:', rawDoc.name);   // 'Alice' (unchanged)

  // ─── decryptDocument on aggregation pipeline results ──────────────────────

  const result = await mongoose.connection.collection('contacts').aggregate([
    { $match: { name: 'Alice' } },
    { $project: { name: 1, phone: 1, ssn: 1 } }
  ]).toArray();

  for (const doc of result) {
    await programmatic.decryptDocument(doc, 'User', ['phone', 'ssn']);
  }
  console.log('\nAggregation result decrypted:');
  console.log('  phone:', result[0].phone); // '13900139000'

  // ─── Clean up ──────────────────────────────────────────────────────────────

  await mongoose.connection.collection('contacts').deleteMany({});
  keyVaultService.flushCache();
  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(console.error);

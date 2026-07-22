'use strict';

/**
 * Key Rotation Example: Demonstrating per-field DEK rotation and backward compatibility
 */

const mongoose = require('mongoose');
const { KeyVaultService, LocalCmkProvider, FieldCryptoService, MongoVaultStore } = require('../src');
const Namespace = require('../src/namespace/Namespace');

async function main() {
  // Setup
  const cmkHex = 'a'.repeat(64); // Demo CMK (use real CMK in production)
  const cmkProvider = new LocalCmkProvider(cmkHex);
  const fieldService = new FieldCryptoService();

  await mongoose.connect(process.env.LCL_MONGODB_URI || 'mongodb://localhost:27017/lightcrypto-rotation-demo');

  const keyVaultService = new KeyVaultService({
    vaultStore: new MongoVaultStore(mongoose.connection.getClient().db(mongoose.connection.name)),
    cmkProvider,
    cacheTtl: 3600000
  });

  // Per-field vault: each field has its own namespace and DEK
  const namespace = 'User#phone';
  const ns = Namespace.parse(namespace);
  const canonicalNs = ns.canonical();

  // 1. Initialize vault (version 1) — per-field
  console.log('=== Key Rotation Demo (per-field vault) ===\n');
  console.log('1. Initializing vault for namespace:', canonicalNs);
  await keyVaultService.ensureVaultInitialized(canonicalNs);
  const v1Kid = await keyVaultService.getActiveKid(canonicalNs);
  const v1Dek = await keyVaultService.getDek(v1Kid);
  const v1HmacKey = await keyVaultService.getHmacKey(v1Kid);
  const v1DekVersion = await keyVaultService.getActiveDekVersion(canonicalNs);
  console.log('   Active KID:', v1Kid, '| DEK version:', v1DekVersion);

  // 2. Encrypt data with version 1
  console.log('\n2. Encrypting data with v1...');
  const phone = '13800138000';
  const encryptedV1 = fieldService.encryptField(
    phone, 'phone', v1Dek, v1HmacKey, v1Kid, 'AES_256_GCM',
    { blindIndex: true, namespace: ns, dekVersion: v1DekVersion }
  );
  console.log('   Encrypted with KID:', encryptedV1._k);

  // 3. Rotate the DEK for this field's namespace
  console.log('\n3. Rotating DEK for namespace:', canonicalNs);
  await keyVaultService.rotateDek(canonicalNs);
  keyVaultService.flushCache();
  const v2Kid = await keyVaultService.getActiveKid(canonicalNs);
  const v2Dek = await keyVaultService.getDek(v2Kid);
  const v2HmacKey = await keyVaultService.getHmacKey(v2Kid);
  const v2DekVersion = await keyVaultService.getActiveDekVersion(canonicalNs);
  console.log('   New Active KID:', v2Kid, '| DEK version:', v2DekVersion);

  // 4. Encrypt new data with version 2
  console.log('\n4. Encrypting data with v2...');
  const phone2 = '13800138001';
  const encryptedV2 = fieldService.encryptField(
    phone2, 'phone', v2Dek, v2HmacKey, v2Kid, 'AES_256_GCM',
    { blindIndex: true, namespace: ns, dekVersion: v2DekVersion }
  );
  console.log('   Encrypted with KID:', encryptedV2._k);

  // 5. Decrypt old data with old KID (backward compatibility via kid-only lookup)
  console.log('\n5. Decrypting v1 data (backward compatibility)...');
  const oldDek = await keyVaultService.getDek(encryptedV1._k);
  const oldHmacKey = await keyVaultService.getHmacKey(encryptedV1._k);
  const decryptedV1 = fieldService.decryptField(encryptedV1, oldDek, oldHmacKey, 'AES_256_GCM');
  console.log('   v1 decrypted:', decryptedV1);

  // 6. Decrypt new data with new KID
  console.log('\n6. Decrypting v2 data...');
  const decryptedV2 = fieldService.decryptField(encryptedV2, v2Dek, v2HmacKey, 'AES_256_GCM');
  console.log('   v2 decrypted:', decryptedV2);

  console.log('\n=== Rotation complete: both versions work ===');

  // Cleanup
  keyVaultService.flushCache();
  try { await mongoose.connection.dropDatabase(); } catch (_) { /* may lack dropDatabase permission */ }
  await mongoose.disconnect();
}

main().catch(console.error);

'use strict';

/**
 * Key Rotation Example: Demonstrating DEK rotation and backward compatibility
 */

const mongoose = require('mongoose');
const { KeyVaultService, LocalCmkProvider, FieldCryptoService } = require('../src');

async function main() {
  // Setup
  const cmkHex = 'a'.repeat(64); // Demo CMK (use real CMK in production)
  const cmkProvider = new LocalCmkProvider(cmkHex);
  const fieldService = new FieldCryptoService();

  await mongoose.connect('mongodb://localhost:27017/lightcrypto-rotation-demo');

  const keyVaultService = new KeyVaultService({
    connection: mongoose.connection,
    cmkProvider,
    cacheTtl: 3600000
  });

  const entityName = 'User';

  // 1. Initialize vault (version 1)
  console.log('=== Key Rotation Demo ===\n');
  console.log('1. Initializing vault...');
  const v1Entry = await keyVaultService.ensureVaultInitialized(entityName);
  console.log('   Active KID:', v1Entry.activeKid);

  // 2. Encrypt data with version 1
  console.log('\n2. Encrypting data with v1...');
  const phone = '13800138000';
  const encryptedV1 = fieldService.encryptField(
    phone, 'phone', v1Entry.dek, v1Entry.hmacKey, v1Entry.activeKid, 'AES_256_GCM',
    { blindIndex: true }
  );
  console.log('   Encrypted with KID:', encryptedV1._k);

  // 3. Rotate the DEK
  console.log('\n3. Rotating DEK...');
  const v2Entry = await keyVaultService.rotateDek(entityName);
  console.log('   New Active KID:', v2Entry.activeKid);

  // 4. Encrypt new data with version 2
  console.log('\n4. Encrypting data with v2...');
  const phone2 = '13800138001';
  const encryptedV2 = fieldService.encryptField(
    phone2, 'phone', v2Entry.dek, v2Entry.hmacKey, v2Entry.activeKid, 'AES_256_GCM',
    { blindIndex: true }
  );
  console.log('   Encrypted with KID:', encryptedV2._k);

  // 5. Decrypt old data with old KID (backward compatibility)
  console.log('\n5. Decrypting v1 data (backward compatibility)...');
  const oldDek = await keyVaultService.getDek(entityName, encryptedV1._k);
  const oldHmacKey = await keyVaultService.getHmacKey(entityName, encryptedV1._k);
  const decryptedV1 = fieldService.decryptField(encryptedV1, oldDek, oldHmacKey, 'AES_256_GCM');
  console.log('   v1 decrypted:', decryptedV1);

  // 6. Decrypt new data with new KID
  console.log('\n6. Decrypting v2 data...');
  const decryptedV2 = fieldService.decryptField(encryptedV2, v2Entry.dek, v2Entry.hmacKey, 'AES_256_GCM');
  console.log('   v2 decrypted:', decryptedV2);

  console.log('\n=== Rotation complete: both versions work ===');

  // Cleanup
  keyVaultService.flushCache();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

main().catch(console.error);

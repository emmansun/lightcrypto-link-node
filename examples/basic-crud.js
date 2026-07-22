'use strict';

/**
 * Basic CRUD Example: User schema with phone/ssn encryption and blind index query
 */

const mongoose = require('mongoose');
const { lclCryptoPlugin, KeyVaultService, LocalCmkProvider, LclConfig, prepareEncryptedSchema, MongoVaultStore } = require('../src');

async function main() {
  // 1. Load configuration
  const config = new LclConfig();
  await config.load();

  // Or configure directly:
  // const cmkProvider = new LocalCmkProvider('your-64-char-hex-cmk-key-here...');
  const cmkProvider = new LocalCmkProvider(config.cmkKey || 'a'.repeat(64));

  // 2. Connect to MongoDB
  await mongoose.connect(config.mongodbUri || 'mongodb://localhost:27017/lightcrypto-demo');

  // 3. Create KeyVaultService
  const keyVaultService = new KeyVaultService({
    vaultStore: new MongoVaultStore(mongoose.connection.getClient().db(mongoose.connection.name)),
    cmkProvider,
    cacheTtl: config.cacheTtl
  });

  // 4. Define schema with encrypted fields (Mongoose 9: use prepareEncryptedSchema)
  const userSchema = new mongoose.Schema(prepareEncryptedSchema({
    name: { type: String, required: true },
    phone: { type: String, encrypt: true, blindIndex: true },
    ssn: { type: String, encrypt: true },
    email: { type: String }
  }));

  // 5. Register the crypto plugin
  userSchema.plugin(lclCryptoPlugin, {
    keyVaultService,
    entityName: 'User',
    algorithm: config.algorithm
  });

  const User = mongoose.model('User', userSchema);

  // 6. Create a user (phone and ssn are automatically encrypted)
  const user = new User({
    name: 'John Doe',
    phone: '13800138000',
    ssn: '123-45-6789',
    email: 'john@example.com'
  });
  await user.save();
  console.log('User saved (encrypted):', user._id);

  // 7. Retrieve the user (phone and ssn are automatically decrypted)
  const found = await User.findById(user._id);
  console.log('User retrieved (decrypted):');
  console.log('  phone:', found.phone); // '13800138000'
  console.log('  ssn:', found.ssn);     // '123-45-6789'

  // 8. Query by blind index (exact match on encrypted field)
  const result = await User.findOne({ phone: '13800138000' });
  console.log('Found by blind index:', result ? result.name : 'not found');

  // 9. Clean up
  await User.deleteMany({});
  keyVaultService.flushCache();
  await mongoose.disconnect();
}

main().catch(console.error);

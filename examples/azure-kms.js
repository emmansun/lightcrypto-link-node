'use strict';

/**
 * Azure Key Vault KMS Example
 *
 * Demonstrates two modes:
 * 1. **Local wrap mode** (recommended): Uses RSA public key for local encryption.
 *    - Faster, cheaper (no KMS call for wrap)
 *    - Requires publicKeyPem from Azure Key Vault
 * 2. **Remote mode**: Both wrap and unwrap call Azure Key Vault.
 *
 * cmkVersion: The key version string. If not provided, the latest version
 * is resolved lazily via KeyClient.getKey(keyName).
 *
 * Prerequisites:
 *   npm install @azure/keyvault-keys @azure/identity
 *   Set environment variables:
 *     AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
 *     LCL_AZURE_KEY_NAME=your-key-name
 *     LCL_AZURE_VAULT_URL=https://your-vault.vault.azure.net
 *     LCL_AZURE_CMK_VERSION (optional, latest resolved if omitted)
 *     LCL_AZURE_PUBLIC_KEY_PEM (optional, for local wrap)
 */

const mongoose = require('mongoose');
const { AzureKmsProvider, KeyVaultService, lclCryptoPlugin, prepareEncryptedSchema } = require('../src');

async function main() {
  // 1. Configure Azure Key Vault provider (LOCAL WRAP MODE - recommended)
  const azureProvider = new AzureKmsProvider({
    keyName: process.env.LCL_AZURE_KEY_NAME || 'your-key-name',
    vaultUrl: process.env.LCL_AZURE_VAULT_URL || 'https://your-vault.vault.azure.net',
    cmkVersion: process.env.LCL_AZURE_CMK_VERSION || null,  // Optional: latest resolved if omitted
    publicKeyPem: process.env.LCL_AZURE_PUBLIC_KEY_PEM || null  // Optional: RSA public key for local wrap
    // credential: new DefaultAzureCredential()  // optional, uses DefaultAzureCredential by default
  });

  console.log('Provider ID:', azureProvider.getProviderId());  // 'azure-keyvault'
  console.log('Public Reference:', azureProvider.getPublicReference());  // key name

  // 2. Connect to MongoDB
  await mongoose.connect(process.env.LCL_MONGODB_URI || 'mongodb://localhost:27017/lightcrypto-azure-demo');

  // 3. Create KeyVaultService with Azure provider
  const keyVaultService = new KeyVaultService({
    connection: mongoose.connection,
    cmkProvider: azureProvider,
    cacheTtl: 3600000
  });

  // 4. Define schema (Mongoose 9: use prepareEncryptedSchema)
  const userSchema = new mongoose.Schema(prepareEncryptedSchema({
    name: String,
    phone: { type: String, encrypt: true, blindIndex: true }
  }));

  userSchema.plugin(lclCryptoPlugin, {
    keyVaultService,
    entityName: 'User',
    algorithm: 'AES_256_GCM'
  });

  const User = mongoose.model('User', userSchema);

  // 5. Use normally - encryption/decryption is transparent
  const user = new User({ name: 'Alice', phone: '13800138000' });
  await user.save();
  console.log('Saved with Azure Key Vault CMK');

  const found = await User.findOne({ phone: '13800138000' });
  console.log('Found:', found?.name, found?.phone);

  keyVaultService.flushCache();
  await mongoose.disconnect();
}

main().catch(console.error);

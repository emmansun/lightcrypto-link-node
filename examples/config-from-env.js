'use strict';

/**
 * Configuration from Environment Variables and Secret Managers Example
 *
 * Demonstrates multiple configuration sources:
 *   1. Environment variables (highest priority)
 *   2. Secret managers (Kubernetes, AWS, Azure, HashiCorp)
 *   3. Configuration files (config/lcl.json, .env)
 *   4. Application defaults
 */

const { LclConfig, LocalCmkProvider, KeyVaultService } = require('../src');

async function main() {
  console.log('=== Configuration Management Demo ===\n');

  // Method 1: Load from all sources automatically
  console.log('1. Auto-loading configuration...');
  const config = new LclConfig();

  try {
    await config.load();
    console.log('   Algorithm:', config.algorithm);
    console.log('   Cache TTL:', config.cacheTtl, 'ms');
    console.log('   Key Vault Collection:', config.keyVaultCollection);
    console.log('   CMK Provider:', config.cmkProvider);
    console.log('   CMK Key:', config.cmkKey ? '****' : '(not set)');
    console.log('   MongoDB URI:', config.mongodbUri ? '****' : '(not set)');
  } catch (e) {
    console.log('   Config load note:', e.message);
  }

  // Method 2: Environment variables only
  console.log('\n2. Environment variables example:');
  console.log('   LCL_CMK_KEY=<64 hex chars>');
  console.log('   LCL_MONGODB_URI=mongodb://localhost:27017/mydb');
  console.log('   LCL_ALGORITHM=AES_256_GCM');
  console.log('   LCL_CACHE_TTL=3600000');
  console.log('   LCL_CMK_PROVIDER=local-symmetric');

  // Method 3: Secret manager integration
  console.log('\n3. Secret manager integration:');
  console.log('   AWS:     LCL_AWS_SECRET_ID=my-secret-id');
  console.log('   Azure:   LCL_AZURE_SECRET_URL=https://vault.vault.azure.net/');
  console.log('   Vault:   LCL_VAULT_ADDR=http://vault:8200 + LCL_VAULT_TOKEN=...');
  console.log('   K8s:     Secrets mounted at /var/run/secrets/lightcrypto-link/');

  // Method 4: Runtime reload
  console.log('\n4. Runtime configuration reload:');
  console.log('   const result = await config.reload();');
  console.log('   if (result.cmkChanged) keyVaultService.flushCache();');

  // Method 5: JSON config file (config/lcl.json)
  console.log('\n5. JSON config file format (config/lcl.json):');
  console.log(JSON.stringify({
    lcl: {
      crypto: { cmk: '<64 hex chars>', algorithm: 'AES_256_GCM' },
      mongodb: { uri: 'mongodb://localhost:27017/mydb' },
      cmk: { provider: 'local-symmetric' }
    }
  }, null, 2));
}

main().catch(console.error);

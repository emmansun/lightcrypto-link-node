'use strict';

/**
 * Integration test: AzureKmsProvider + Mongoose Plugin
 *
 * Based on examples/azure-kms.js
 *
 * Required environment variables:
 *   AZURE_TENANT_ID
 *   AZURE_CLIENT_ID
 *   AZURE_CLIENT_SECRET
 *   LCL_AZURE_KEY_NAME
 *   LCL_AZURE_VAULT_URL       (e.g. https://your-vault.vault.azure.net)
 *
 * Optional:
 *   LCL_AZURE_CMK_VERSION      (auto-resolved if omitted)
 *   LCL_AZURE_PUBLIC_KEY_PEM   (auto-resolved if omitted)
 *   LCL_AZURE_ALGORITHM        (default: RSA-OAEP-256)
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  AzureKmsProvider,
  KeyVaultService,
  lclCryptoPlugin,
  prepareEncryptedSchema
} = require('../../src');

const HAS_AZURE_CREDS =
  process.env.AZURE_TENANT_ID &&
  process.env.AZURE_CLIENT_ID &&
  process.env.AZURE_CLIENT_SECRET &&
  process.env.LCL_AZURE_KEY_NAME &&
  process.env.LCL_AZURE_VAULT_URL;

const describeOrSkip = HAS_AZURE_CREDS ? describe : describe.skip;

describeOrSkip('Integration: AzureKmsProvider + Mongoose Plugin', () => {
  let mongoServer;
  let connection;
  let keyVaultService;
  let provider;

  const vaultUrl = process.env.LCL_AZURE_VAULT_URL;
  const keyName = process.env.LCL_AZURE_KEY_NAME;
  const algorithm = process.env.LCL_AZURE_ALGORITHM || 'RSA-OAEP-256';

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    connection = await mongoose.createConnection(uri).asPromise();

    provider = new AzureKmsProvider({
      keyName,
      vaultUrl,
      cmkVersion: process.env.LCL_AZURE_CMK_VERSION || null,
      publicKeyPem: process.env.LCL_AZURE_PUBLIC_KEY_PEM || null,
      algorithm
    });

    console.log(`\n  Azure KV: vaultUrl=${vaultUrl}, keyName=${keyName}, algorithm=${algorithm}`);

    keyVaultService = new KeyVaultService({
      connection,
      cmkProvider: provider,
      cacheTtl: 60000
    });
  });

  afterAll(async () => {
    if (keyVaultService) keyVaultService.flushCache();
    if (connection) await connection.close();
    if (mongoServer) await mongoServer.stop();
  });

  describe('Provider metadata', () => {
    test('getProviderId returns azure-keyvault', () => {
      expect(provider.getProviderId()).toBe('azure-keyvault');
    });

    test('getPublicReference returns keyName', () => {
      expect(provider.getPublicReference()).toBe(keyName);
    });
  });

  describe('Wrap + Unwrap round-trip', () => {
    test('wraps and unwraps a 32-byte key', async () => {
      const plaintextKey = crypto.randomBytes(32);
      const wrapped = await provider.wrap(plaintextKey);

      expect(wrapped.ciphertext).toBeInstanceOf(Buffer);
      expect(wrapped.ciphertext.length).toBeGreaterThan(0);
      expect(wrapped.algorithm).toBe(algorithm);
      expect(wrapped.metadata).toHaveProperty('keyName', keyName);
      expect(wrapped.metadata).toHaveProperty('cmkVersion');
      console.log(`  wrap: algorithm=${wrapped.algorithm}, cmkVersion=${wrapped.metadata.cmkVersion}, localWrap=${wrapped.metadata.localWrap}`);

      const unwrapped = await provider.unwrap(wrapped);
      expect(unwrapped).toEqual(plaintextKey);
    }, 30000);
  });

  describe('Auto-resolution', () => {
    test('auto-resolves cmkVersion and publicKeyPem when not configured', async () => {
      const autoProvider = new AzureKmsProvider({
        keyName,
        vaultUrl,
        algorithm
        // cmkVersion and publicKeyPem intentionally omitted
      });

      expect(autoProvider.getCmkVersion()).toBeNull();

      const wrapped = await autoProvider.wrap(crypto.randomBytes(32));

      // Both cmkVersion and publicKeyPem should be auto-resolved
      expect(autoProvider.getCmkVersion()).toBeTruthy();
      expect(wrapped.metadata.cmkVersion).toBeTruthy();
      expect(wrapped.metadata.localWrap).toBe(true);
      console.log(`  auto-resolved cmkVersion: ${autoProvider.getCmkVersion()}, localWrap=${wrapped.metadata.localWrap}`);

      // Unwrap should work
      const unwrapped = await autoProvider.unwrap(wrapped);
      expect(unwrapped).toBeInstanceOf(Buffer);
      expect(unwrapped.length).toBe(32);
    }, 30000);
  });

  describe('Mongoose Plugin integration', () => {
    let UserModel;

    beforeAll(() => {
      const userSchema = new mongoose.Schema(prepareEncryptedSchema({
        name: String,
        phone: { type: String, encrypt: true, blindIndex: true },
        ssn: { type: String, encrypt: true }
      }));

      userSchema.plugin(lclCryptoPlugin, {
        keyVaultService,
        entityName: 'User',
        algorithm: 'AES_256_GCM'
      });

      UserModel = connection.model('User', userSchema);
    });

    beforeEach(async () => {
      await UserModel.deleteMany({});
    });

    test('saves and retrieves encrypted data', async () => {
      const user = new UserModel({
        name: 'Alice',
        phone: '13800138000',
        ssn: '123-45-6789'
      });
      await user.save();

      // Verify raw document has encrypted structure
      const raw = await UserModel.collection.findOne({ _id: user._id });
      expect(raw.phone).toHaveProperty('_e', 1);
      expect(raw.phone).toHaveProperty('_a', 'AES_256_GCM');
      expect(raw.phone).toHaveProperty('b'); // blind index
      expect(raw.ssn).toHaveProperty('_e', 1);
      expect(raw.ssn).not.toHaveProperty('b'); // no blind index

      // Retrieve and decrypt
      const found = await UserModel.findOne({ _id: user._id });
      expect(found.name).toBe('Alice');
      expect(found.phone).toBe('13800138000');
      expect(found.ssn).toBe('123-45-6789');

      console.log(`  Mongoose round-trip OK: algorithm=AES_256_GCM`);
    }, 60000);

    test('blind index query on encrypted field', async () => {
      await new UserModel({ name: 'Alice', phone: '13800138000' }).save();
      await new UserModel({ name: 'Bob', phone: '13900139000' }).save();

      const found = await UserModel.findOne({ phone: '13800138000' });
      expect(found).not.toBeNull();
      expect(found.name).toBe('Alice');
      expect(found.phone).toBe('13800138000');
    }, 60000);

    test('handles null encrypted fields', async () => {
      const user = new UserModel({ name: 'Eve' });
      await user.save();

      const found = await UserModel.findOne({ _id: user._id });
      expect(found.name).toBe('Eve');
      expect(found.phone).toBeUndefined();
      expect(found.ssn).toBeUndefined();
    }, 30000);

    test('key rotation with backward compatibility', async () => {
      // Save with original DEK
      const user1 = new UserModel({ name: 'Alice', phone: '13800138000' });
      await user1.save();

      // Rotate DEK
      await keyVaultService.rotateDek('User');
      keyVaultService.flushCache();

      // Save with new DEK
      const user2 = new UserModel({ name: 'Bob', phone: '13900139000' });
      await user2.save();

      // Both should decrypt correctly
      const found1 = await UserModel.findOne({ name: 'Alice' });
      expect(found1.phone).toBe('13800138000');

      const found2 = await UserModel.findOne({ name: 'Bob' });
      expect(found2.phone).toBe('13900139000');

      console.log('  Key rotation: both v1 and v2 decrypt OK');
    }, 90000);
  });
});

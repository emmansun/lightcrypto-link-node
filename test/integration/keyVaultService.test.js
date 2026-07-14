'use strict';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { KeyVaultService, LocalCmkProvider } = require('../../src');

describe('Integration: KeyVaultService', () => {
  let mongoServer;
  let connection;
  let keyVaultService;
  const TEST_CMK_HEX = 'b'.repeat(64);

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    connection = await mongoose.createConnection(uri).asPromise();

    const cmkProvider = new LocalCmkProvider(TEST_CMK_HEX);
    keyVaultService = new KeyVaultService({
      connection,
      cmkProvider,
      cacheTtl: 60000
    });
  });

  afterAll(async () => {
    keyVaultService.flushCache();
    await connection.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear the keyvault collection between tests
    await connection.dropCollection('__lcl_keyvault').catch(() => {});
    keyVaultService.flushCache();
  });

  describe('Vault Initialization', () => {
    test('creates vault document on first access', async () => {
      await keyVaultService.ensureVaultInitialized('User');

      const vaultDoc = await connection.collection('__lcl_keyvault').findOne({
        _id: 'lcl-dek-User'
      });

      expect(vaultDoc).not.toBeNull();
      expect(vaultDoc.status).toBe('ACTIVE');
      expect(vaultDoc.activeKid).toMatch(/^v1-[0-9a-f]{8}$/);
      expect(vaultDoc.keys).toHaveLength(1);
      expect(vaultDoc.keys[0].status).toBe('ACTIVE');
    });

    test('does not create duplicate vault on subsequent calls', async () => {
      await keyVaultService.ensureVaultInitialized('User');
      await keyVaultService.ensureVaultInitialized('User');

      const count = await connection.collection('__lcl_keyvault').countDocuments({
        _id: 'lcl-dek-User'
      });
      expect(count).toBe(1);
    });

    test('creates separate vaults per entity', async () => {
      await keyVaultService.ensureVaultInitialized('User');
      await keyVaultService.ensureVaultInitialized('Product');

      const userVault = await connection.collection('__lcl_keyvault').findOne({
        _id: 'lcl-dek-User'
      });
      const productVault = await connection.collection('__lcl_keyvault').findOne({
        _id: 'lcl-dek-Product'
      });

      expect(userVault).not.toBeNull();
      expect(productVault).not.toBeNull();
      expect(userVault.activeKid).not.toBe(productVault.activeKid);
    });
  });

  describe('DEK Caching', () => {
    test('returns same DEK from cache on subsequent calls', async () => {
      const entry1 = await keyVaultService.ensureVaultInitialized('User');
      const entry2 = await keyVaultService.ensureVaultInitialized('User');

      expect(entry1.activeKid).toBe(entry2.activeKid);
      expect(entry1.dek.equals(entry2.dek)).toBe(true);
    });

    test('flushCache forces reload from database', async () => {
      const entry1 = await keyVaultService.ensureVaultInitialized('User');
      const kid1 = entry1.activeKid;

      keyVaultService.flushCache();

      const entry2 = await keyVaultService.ensureVaultInitialized('User');
      expect(entry2.activeKid).toBe(kid1);  // Same kid, but reloaded
    });
  });

  describe('DEK Rotation', () => {
    test('rotates DEK and increments version', async () => {
      await keyVaultService.ensureVaultInitialized('User');
      const initialKid = await keyVaultService.getActiveKid('User');
      expect(initialKid).toMatch(/^v1-/);

      await keyVaultService.rotateDek('User');
      keyVaultService.flushCache();

      const newKid = await keyVaultService.getActiveKid('User');
      expect(newKid).toMatch(/^v2-/);
      expect(newKid).not.toBe(initialKid);
    });

    test('maintains access to old DEK after rotation', async () => {
      await keyVaultService.ensureVaultInitialized('User');
      const oldKid = await keyVaultService.getActiveKid('User');
      const oldDek = await keyVaultService.getDek('User', oldKid);

      await keyVaultService.rotateDek('User');
      keyVaultService.flushCache();

      // Old DEK should still be accessible
      const retrievedOldDek = await keyVaultService.getDek('User', oldKid);
      expect(retrievedOldDek.equals(oldDek)).toBe(true);
    });

    test('multiple rotations produce sequential versions', async () => {
      await keyVaultService.ensureVaultInitialized('User');

      await keyVaultService.rotateDek('User');
      keyVaultService.flushCache();
      const kid2 = await keyVaultService.getActiveKid('User');
      expect(kid2).toMatch(/^v2-/);

      await keyVaultService.rotateDek('User');
      keyVaultService.flushCache();
      const kid3 = await keyVaultService.getActiveKid('User');
      expect(kid3).toMatch(/^v3-/);

      // Verify vault has 3 key entries
      const vaultDoc = await connection.collection('__lcl_keyvault').findOne({
        _id: 'lcl-dek-User'
      });
      expect(vaultDoc.keys).toHaveLength(3);
    });
  });

  describe('KCV Verification', () => {
    test('verifies KCV on vault load', async () => {
      await keyVaultService.ensureVaultInitialized('User');
      keyVaultService.flushCache();

      // Reload should succeed (KCV matches)
      await expect(
        keyVaultService.ensureVaultInitialized('User')
      ).resolves.not.toThrow();
    });

    test('detects KCV mismatch on corrupted vault', async () => {
      await keyVaultService.ensureVaultInitialized('User');

      // Corrupt the KCV
      await connection.collection('__lcl_keyvault').updateOne(
        { _id: 'lcl-dek-User' },
        { $set: { 'keys.0.dek.kcv': 'deadbeef' } }
      );

      keyVaultService.flushCache();

      await expect(
        keyVaultService.ensureVaultInitialized('User')
      ).rejects.toThrow(/KCV/i);
    });
  });

  describe('Binding Verification', () => {
    test('verifies binding on vault load', async () => {
      await keyVaultService.ensureVaultInitialized('User');
      keyVaultService.flushCache();

      // Reload should succeed (binding matches)
      await expect(
        keyVaultService.ensureVaultInitialized('User')
      ).resolves.not.toThrow();
    });

    test('detects binding mismatch on corrupted vault', async () => {
      await keyVaultService.ensureVaultInitialized('User');

      // Corrupt the binding
      await connection.collection('__lcl_keyvault').updateOne(
        { _id: 'lcl-dek-User' },
        { $set: { 'keys.0.binding': 'invalid-binding-hash' } }
      );

      keyVaultService.flushCache();

      await expect(
        keyVaultService.ensureVaultInitialized('User')
      ).rejects.toThrow(/binding/i);
    });
  });

  describe('CMK Provider', () => {
    test('stores CMK provider and public reference in vault', async () => {
      await keyVaultService.ensureVaultInitialized('User');

      const vaultDoc = await connection.collection('__lcl_keyvault').findOne({
        _id: 'lcl-dek-User'
      });

      expect(vaultDoc.cmk.provider).toBe('local-symmetric');
      expect(vaultDoc.cmk.id).toMatch(/^local-cmk-sha256:[0-9a-f]{8}$/);
    });
  });
});

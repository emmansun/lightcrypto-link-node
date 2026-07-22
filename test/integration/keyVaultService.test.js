'use strict';

const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient } = require('mongodb');
const { KeyVaultService, LocalCmkProvider, MongoVaultStore } = require('../../src');

const NS_USER_PHONE = 'default.default.User#phone';
const NS_USER_EMAIL = 'default.default.User#email';
const NS_PRODUCT = 'default.default.Product#name';

describe('Integration: KeyVaultService', () => {
  let mongoServer;
  let client;
  let vaultStore;
  let keyVaultService;
  const TEST_CMK_HEX = 'b'.repeat(64);

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    client = new MongoClient(uri);
    await client.connect();

    const db = client.db('test_keyvault');
    vaultStore = new MongoVaultStore(db);

    const cmkProvider = new LocalCmkProvider(TEST_CMK_HEX);
    keyVaultService = new KeyVaultService({
      vaultStore,
      cmkProvider,
      cacheTtl: 60000
    });
  });

  afterAll(async () => {
    keyVaultService.flushCache();
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear the keyvault collection between tests
    await client.db('test_keyvault').collection('__lcl_keyvault').deleteMany({});
    keyVaultService.flushCache();
  });

  describe('Vault Initialization', () => {
    test('creates vault document on first access', async () => {
      await keyVaultService.ensureVaultInitialized(NS_USER_PHONE);

      const vaultDoc = await client.db('test_keyvault').collection('__lcl_keyvault').findOne({
        _id: `lcl-dek-${NS_USER_PHONE}`
      });

      expect(vaultDoc).not.toBeNull();
      expect(vaultDoc.status).toBe('ACTIVE');
      expect(vaultDoc.activeKid).toMatch(/^v1-[0-9a-f]{8}$/);
      expect(vaultDoc.keys).toHaveLength(1);
      expect(vaultDoc.keys[0].status).toBe('ACTIVE');
    });

    test('does not create duplicate vault on subsequent calls', async () => {
      await keyVaultService.ensureVaultInitialized(NS_USER_PHONE);
      await keyVaultService.ensureVaultInitialized(NS_USER_PHONE);

      const count = await client.db('test_keyvault').collection('__lcl_keyvault').countDocuments({
        _id: `lcl-dek-${NS_USER_PHONE}`
      });
      expect(count).toBe(1);
    });

    test('creates separate vaults per namespace (per-field)', async () => {
      await keyVaultService.ensureVaultInitialized(NS_USER_PHONE);
      await keyVaultService.ensureVaultInitialized(NS_USER_EMAIL);

      const phoneVault = await client.db('test_keyvault').collection('__lcl_keyvault').findOne({
        _id: `lcl-dek-${NS_USER_PHONE}`
      });
      const emailVault = await client.db('test_keyvault').collection('__lcl_keyvault').findOne({
        _id: `lcl-dek-${NS_USER_EMAIL}`
      });

      expect(phoneVault).not.toBeNull();
      expect(emailVault).not.toBeNull();
      expect(phoneVault.activeKid).not.toBe(emailVault.activeKid);
    });
  });

  describe('DEK Caching', () => {
    test('returns cached kid on subsequent calls', async () => {
      await keyVaultService.ensureVaultInitialized(NS_USER_PHONE);
      const kid1 = await keyVaultService.getActiveKid(NS_USER_PHONE);

      const kid2 = await keyVaultService.getActiveKid(NS_USER_PHONE);
      expect(kid1).toBe(kid2);
    });

    test('flushCache forces reload from database', async () => {
      await keyVaultService.ensureVaultInitialized(NS_USER_PHONE);
      const kid1 = await keyVaultService.getActiveKid(NS_USER_PHONE);

      keyVaultService.flushCache();

      const kid2 = await keyVaultService.getActiveKid(NS_USER_PHONE);
      expect(kid2).toBe(kid1);  // Same kid, but reloaded
    });
  });

  describe('DEK Rotation', () => {
    test('rotates DEK and increments version', async () => {
      await keyVaultService.ensureVaultInitialized(NS_USER_PHONE);
      const initialKid = await keyVaultService.getActiveKid(NS_USER_PHONE);
      expect(initialKid).toMatch(/^v1-/);

      await keyVaultService.rotateDek(NS_USER_PHONE);
      keyVaultService.flushCache();

      const newKid = await keyVaultService.getActiveKid(NS_USER_PHONE);
      expect(newKid).toMatch(/^v2-/);
      expect(newKid).not.toBe(initialKid);
    });

    test('maintains access to old DEK after rotation', async () => {
      await keyVaultService.ensureVaultInitialized(NS_USER_PHONE);
      const oldKid = await keyVaultService.getActiveKid(NS_USER_PHONE);
      const oldDek = Buffer.from(await keyVaultService.getDek(oldKid));

      await keyVaultService.rotateDek(NS_USER_PHONE);
      keyVaultService.flushCache();

      // Re-initialize to load rotated vault
      await keyVaultService.ensureVaultInitialized(NS_USER_PHONE);
      // Old DEK should still be accessible via kid-only lookup
      const retrievedOldDek = await keyVaultService.getDek(oldKid);
      expect(retrievedOldDek.equals(oldDek)).toBe(true);
    });

    test('multiple rotations produce sequential versions', async () => {
      await keyVaultService.ensureVaultInitialized(NS_USER_PHONE);

      await keyVaultService.rotateDek(NS_USER_PHONE);
      keyVaultService.flushCache();
      const kid2 = await keyVaultService.getActiveKid(NS_USER_PHONE);
      expect(kid2).toMatch(/^v2-/);

      await keyVaultService.rotateDek(NS_USER_PHONE);
      keyVaultService.flushCache();
      const kid3 = await keyVaultService.getActiveKid(NS_USER_PHONE);
      expect(kid3).toMatch(/^v3-/);

      // Verify vault has 3 key entries
      const vaultDoc = await client.db('test_keyvault').collection('__lcl_keyvault').findOne({
        _id: `lcl-dek-${NS_USER_PHONE}`
      });
      expect(vaultDoc.keys).toHaveLength(3);
    });

    test('rotation does not affect other namespaces', async () => {
      await keyVaultService.ensureVaultInitialized(NS_USER_PHONE);
      await keyVaultService.ensureVaultInitialized(NS_USER_EMAIL);

      const emailKidBefore = await keyVaultService.getActiveKid(NS_USER_EMAIL);

      await keyVaultService.rotateDek(NS_USER_PHONE);
      keyVaultService.flushCache();

      const emailKidAfter = await keyVaultService.getActiveKid(NS_USER_EMAIL);
      expect(emailKidAfter).toBe(emailKidBefore);
    });
  });

  describe('KCV Verification', () => {
    test('verifies KCV on vault load', async () => {
      await keyVaultService.ensureVaultInitialized(NS_USER_PHONE);
      keyVaultService.flushCache();

      // Reload should succeed (KCV matches)
      await expect(
        keyVaultService.ensureVaultInitialized(NS_USER_PHONE)
      ).resolves.not.toThrow();
    });

    test('detects KCV mismatch on corrupted vault', async () => {
      await keyVaultService.ensureVaultInitialized(NS_USER_PHONE);

      // Corrupt the KCV
      await client.db('test_keyvault').collection('__lcl_keyvault').updateOne(
        { _id: `lcl-dek-${NS_USER_PHONE}` },
        { $set: { 'keys.0.dek.kcv': 'deadbeef' } }
      );

      keyVaultService.flushCache();

      await expect(
        keyVaultService.ensureVaultInitialized(NS_USER_PHONE)
      ).rejects.toThrow(/KCV/i);
    });
  });

  describe('Binding Verification', () => {
    test('verifies binding on vault load', async () => {
      await keyVaultService.ensureVaultInitialized(NS_USER_PHONE);
      keyVaultService.flushCache();

      // Reload should succeed (binding matches)
      await expect(
        keyVaultService.ensureVaultInitialized(NS_USER_PHONE)
      ).resolves.not.toThrow();
    });

    test('detects binding mismatch on corrupted vault', async () => {
      await keyVaultService.ensureVaultInitialized(NS_USER_PHONE);

      // Corrupt the binding
      await client.db('test_keyvault').collection('__lcl_keyvault').updateOne(
        { _id: `lcl-dek-${NS_USER_PHONE}` },
        { $set: { 'keys.0.binding': 'invalid-binding-hash' } }
      );

      keyVaultService.flushCache();

      await expect(
        keyVaultService.ensureVaultInitialized(NS_USER_PHONE)
      ).rejects.toThrow(/binding/i);
    });
  });

  describe('New API: getDekByVersion / getActiveDekVersion / getActiveHmacKey', () => {
    test('getActiveDekVersion returns 1 for new vault', async () => {
      await keyVaultService.ensureVaultInitialized(NS_USER_PHONE);
      const version = await keyVaultService.getActiveDekVersion(NS_USER_PHONE);
      expect(version).toBe(1);
    });

    test('getActiveDekVersion returns 2 after rotation', async () => {
      await keyVaultService.ensureVaultInitialized(NS_USER_PHONE);
      await keyVaultService.rotateDek(NS_USER_PHONE);
      keyVaultService.flushCache();
      const version = await keyVaultService.getActiveDekVersion(NS_USER_PHONE);
      expect(version).toBe(2);
    });

    test('getDekByVersion returns correct DEK', async () => {
      await keyVaultService.ensureVaultInitialized(NS_USER_PHONE);
      const activeKid = await keyVaultService.getActiveKid(NS_USER_PHONE);
      const dekByKid = await keyVaultService.getDek(activeKid);
      const dekByVersion = await keyVaultService.getDekByVersion(NS_USER_PHONE, 1);
      expect(dekByVersion.equals(dekByKid)).toBe(true);
    });

    test('getActiveHmacKey returns HMAC key for namespace', async () => {
      await keyVaultService.ensureVaultInitialized(NS_USER_PHONE);
      const hmacKey = await keyVaultService.getActiveHmacKey(NS_USER_PHONE);
      expect(Buffer.isBuffer(hmacKey)).toBe(true);
      expect(hmacKey.length).toBe(32);
    });
  });

  describe('CMK Provider', () => {
    test('stores CMK provider and public reference in vault', async () => {
      await keyVaultService.ensureVaultInitialized(NS_USER_PHONE);

      const vaultDoc = await client.db('test_keyvault').collection('__lcl_keyvault').findOne({
        _id: `lcl-dek-${NS_USER_PHONE}`
      });

      expect(vaultDoc.cmk.provider).toBe('local-symmetric');
      expect(vaultDoc.cmk.id).toMatch(/^local-cmk-sha256:[0-9a-f]{8}$/);
    });
  });
});

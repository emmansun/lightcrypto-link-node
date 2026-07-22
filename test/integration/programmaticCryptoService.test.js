'use strict';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  KeyVaultService,
  LocalCmkProvider,
  ProgrammaticCryptoService,
  lclCryptoPlugin,
  prepareEncryptedSchema
} = require('../../src');
const Namespace = require('../../src/namespace/Namespace');

describe('Integration: ProgrammaticCryptoService', () => {
  let mongoServer;
  let connection;
  let keyVaultService;
  let programmaticService;
  const TEST_CMK_HEX = 'c'.repeat(64);

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

    programmaticService = new ProgrammaticCryptoService({
      keyVaultService,
      algorithm: 'AES_256_GCM'
    });
  });

  afterAll(async () => {
    keyVaultService.flushCache();
    await connection.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Drop all collections between tests for isolation
    const collections = await connection.db.listCollections().toArray();
    for (const col of collections) {
      await connection.dropCollection(col.name).catch(() => {});
    }
    keyVaultService.flushCache();
  });

  // ─── 3.1 Full round-trip ──────────────────────────────────────────────────
  describe('Full round-trip: programmatic encrypt → MongoDB → programmatic decrypt', () => {
    test('encrypt, save, read back, and decrypt a string value', async () => {
      const subDoc = await programmaticService.encryptValue('13800138000', 'User');

      // Save sub-document to MongoDB via raw collection
      const result = await connection.collection('users').insertOne({
        name: 'Alice',
        phone: subDoc
      });

      // Read back raw document
      const rawDoc = await connection.collection('users').findOne({ _id: result.insertedId });
      expect(rawDoc.phone._e).toBe(1);
      expect(rawDoc.phone._k).toMatch(/^v1-/);
      expect(rawDoc.phone._a).toBe('AES_256_GCM');
      expect(rawDoc.phone._t).toBe('STR');

      // Decrypt via programmatic API
      const decrypted = await programmaticService.decryptValue(rawDoc.phone, 'User');
      expect(decrypted).toBe('13800138000');
    });

    test('encrypt, save, read back, and decrypt a number value', async () => {
      const subDoc = await programmaticService.encryptValue(42, 'User');

      await connection.collection('users').insertOne({ name: 'Bob', age: subDoc });
      const rawDoc = await connection.collection('users').findOne({ name: 'Bob' });

      expect(rawDoc.age._t).toBe('INT');
      const decrypted = await programmaticService.decryptValue(rawDoc.age, 'User');
      expect(decrypted).toBe(42);
    });

    test('encrypt, save, read back, and decrypt a boolean value', async () => {
      const subDoc = await programmaticService.encryptValue(true, 'User');

      await connection.collection('users').insertOne({ name: 'Charlie', active: subDoc });
      const rawDoc = await connection.collection('users').findOne({ name: 'Charlie' });

      expect(rawDoc.active._t).toBe('BOOL');
      const decrypted = await programmaticService.decryptValue(rawDoc.active, 'User');
      expect(decrypted).toBe(true);
    });

    test('decryptDocument on raw find results', async () => {
      const phoneSubDoc = await programmaticService.encryptValue('13800138000', 'User');
      const ssnSubDoc = await programmaticService.encryptValue('123-45-6789', 'User');

      await connection.collection('users').insertOne({
        name: 'Alice',
        phone: phoneSubDoc,
        ssn: ssnSubDoc
      });

      const rawDoc = await connection.collection('users').findOne({ name: 'Alice' });
      const result = await programmaticService.decryptDocument(rawDoc, 'User', ['phone', 'ssn']);

      expect(result.phone).toBe('13800138000');
      expect(result.ssn).toBe('123-45-6789');
      expect(result.name).toBe('Alice');
    });
  });

  // ─── 3.2 Cross-compatibility: Mongoose plugin → Programmatic API ──────────
  describe('Cross-compatibility: Mongoose plugin encrypt → Programmatic API decrypt', () => {
    let UserModel;

    beforeEach(() => {
      const userSchema = new mongoose.Schema(prepareEncryptedSchema({
        name: String,
        phone: { type: String, encrypt: true },
        ssn: { type: String, encrypt: true }
      }));

      userSchema.plugin(lclCryptoPlugin, {
        keyVaultService,
        entityName: 'User',
        algorithm: 'AES_256_GCM'
      });

      // Use a unique model name per test to avoid Mongoose model overwrite warnings
      const modelName = `User_cross_${Date.now()}`;
      UserModel = connection.model(modelName, userSchema);
    });

    test('programmatic API decrypts values encrypted by Mongoose plugin', async () => {
      const user = new UserModel({ name: 'Alice', phone: '13800138000', ssn: '123-45-6789' });
      await user.save();

      // Read raw document (bypassing Mongoose post-find hooks)
      const rawDoc = await UserModel.collection.findOne({ _id: user._id });
      expect(rawDoc.phone._e).toBe(1);
      expect(rawDoc.ssn._e).toBe(1);

      // Decrypt using programmatic API (pass entityName since plugin docs lack _entity)
      const decryptedPhone = await programmaticService.decryptValue(rawDoc.phone, 'User');
      expect(decryptedPhone).toBe('13800138000');

      const decryptedSsn = await programmaticService.decryptValue(rawDoc.ssn, 'User');
      expect(decryptedSsn).toBe('123-45-6789');
    });

    test('decryptDocument works on raw documents from Mongoose collection', async () => {
      const user = new UserModel({ name: 'Bob', phone: '13900139000', ssn: '987-65-4321' });
      await user.save();

      const rawDoc = await UserModel.collection.findOne({ _id: user._id });
      const result = await programmaticService.decryptDocument(rawDoc, 'User', ['phone', 'ssn']);

      expect(result.phone).toBe('13900139000');
      expect(result.ssn).toBe('987-65-4321');
      expect(result.name).toBe('Bob');
    });
  });

  // ─── 3.3 decryptDocument on aggregation pipeline results ──────────────────
  describe('decryptDocument on aggregation pipeline results', () => {
    test('decrypts fields from aggregation output', async () => {
      // Insert encrypted documents using programmatic API
      const phone1 = await programmaticService.encryptValue('13800138000', 'User');
      const phone2 = await programmaticService.encryptValue('13900139000', 'User');

      await connection.collection('users').insertMany([
        { name: 'Alice', phone: phone1, department: 'Engineering' },
        { name: 'Bob', phone: phone2, department: 'Engineering' }
      ]);

      // Run aggregation pipeline
      const aggResults = await connection.collection('users').aggregate([
        { $match: { department: 'Engineering' } },
        { $project: { name: 1, phone: 1 } }
      ]).toArray();

      expect(aggResults).toHaveLength(2);

      // Decrypt each document from aggregation results
      for (const doc of aggResults) {
        await programmaticService.decryptDocument(doc, 'User', ['phone']);
      }

      const phones = aggResults.map(d => d.phone).sort();
      expect(phones).toEqual(['13800138000', '13900139000']);
    });

    test('handles mixed encrypted and non-encrypted documents in aggregation', async () => {
      const phone = await programmaticService.encryptValue('13800138000', 'User');

      await connection.collection('users').insertMany([
        { name: 'Alice', phone, department: 'Eng' },
        { name: 'Bob', department: 'Eng' } // No phone field
      ]);

      const aggResults = await connection.collection('users').aggregate([
        { $match: { department: 'Eng' } }
      ]).toArray();

      for (const doc of aggResults) {
        await programmaticService.decryptDocument(doc, 'User', ['phone']);
      }

      const alice = aggResults.find(d => d.name === 'Alice');
      const bob = aggResults.find(d => d.name === 'Bob');

      expect(alice.phone).toBe('13800138000');
      expect(bob.phone).toBeUndefined();
    });
  });

  // ─── 6.3–6.5 Structured Type Encryption (DOC / COL) ───────────────
  describe('Structured Type Encryption — DOC and COL', () => {
    test('encryptValue with plain object → _t: DOC, decryptValue restores object', async () => {
      const obj = { city: 'Shanghai', zip: '200000' };
      const subDoc = await programmaticService.encryptValue(obj, 'User');

      expect(subDoc._e).toBe(1);
      expect(subDoc._t).toBe('DOC');
      expect(typeof subDoc.c).toBe('string');

      const decrypted = await programmaticService.decryptValue(subDoc, 'User');
      expect(decrypted).toEqual(obj);
    });

    test('encryptValue with array → _t: COL, decryptValue restores array', async () => {
      const arr = ['a', 'b', 'c'];
      const subDoc = await programmaticService.encryptValue(arr, 'User');

      expect(subDoc._e).toBe(1);
      expect(subDoc._t).toBe('COL');
      expect(typeof subDoc.c).toBe('string');

      const decrypted = await programmaticService.decryptValue(subDoc, 'User');
      expect(decrypted).toEqual(arr);
    });

    test('decryptDocument with DOC and COL fields', async () => {
      const addressSubDoc = await programmaticService.encryptValue({ city: 'Shanghai', zip: '200000' }, 'User');
      const tagsSubDoc = await programmaticService.encryptValue(['admin', 'active'], 'User');

      await connection.collection('users').insertOne({
        name: 'Alice',
        address: addressSubDoc,
        tags: tagsSubDoc
      });

      const rawDoc = await connection.collection('users').findOne({ name: 'Alice' });
      expect(rawDoc.address._t).toBe('DOC');
      expect(rawDoc.tags._t).toBe('COL');

      const result = await programmaticService.decryptDocument(rawDoc, 'User', ['address', 'tags']);
      expect(result.address).toEqual({ city: 'Shanghai', zip: '200000' });
      expect(result.tags).toEqual(['admin', 'active']);
      expect(result.name).toBe('Alice');
    });

    test('encryptValue with empty object → _t: DOC, decryptValue restores empty object', async () => {
      const subDoc = await programmaticService.encryptValue({}, 'User');
      expect(subDoc._t).toBe('DOC');
      expect(typeof subDoc.c).toBe('string');

      const decrypted = await programmaticService.decryptValue(subDoc, 'User');
      expect(decrypted).toEqual({});
    });

    test('encryptValue with empty array → _t: COL, decryptValue restores empty array', async () => {
      const subDoc = await programmaticService.encryptValue([], 'User');
      expect(subDoc._t).toBe('COL');
      expect(typeof subDoc.c).toBe('string');

      const decrypted = await programmaticService.decryptValue(subDoc, 'User');
      expect(decrypted).toEqual([]);
    });

    test('decryptValue restores MAP sub-document to plain object', async () => {
      // Construct a MAP sub-document manually (same BSON encoding as DOC)
      const BsonCodec = require('../../src/crypto/BsonCodec');
      const CryptoCodec = require('../../src/crypto/CryptoCodec');
      const bsonCodec = new BsonCodec();
      const cryptoCodec = new CryptoCodec();

      // Get the active DEK and kid
      const vaultEntry = await programmaticService._keyVaultService.ensureVaultInitialized('User');

      const mapValue = { key1: 'value1', key2: 'value2' };
      const bsonBytes = bsonCodec.encodeDocument(mapValue);
      const ns = Namespace.parse('User#User');
      const dekVersion = vaultEntry.dekVersion || 1;
      const ciphertext = cryptoCodec.encrypt(vaultEntry.dek, bsonBytes, 'AES_256_GCM', ns, dekVersion);

      const mapSubDoc = {
        _e: 1,
        _k: vaultEntry.activeKid,
        _a: 'AES_256_GCM',
        _t: 'MAP',
        c: ciphertext,
        _entity: 'User'
      };

      const decrypted = await programmaticService.decryptValue(mapSubDoc, 'User');
      expect(decrypted).toEqual(mapValue);
    });

    test('decryptDocument with MAP field', async () => {
      const BsonCodec = require('../../src/crypto/BsonCodec');
      const CryptoCodec = require('../../src/crypto/CryptoCodec');
      const bsonCodec = new BsonCodec();
      const cryptoCodec = new CryptoCodec();

      const vaultEntry = await programmaticService._keyVaultService.ensureVaultInitialized('User');

      const mapValue = { lang: 'en', theme: 'dark' };
      const bsonBytes = bsonCodec.encodeDocument(mapValue);
      const ns2 = Namespace.parse('User#User');
      const dekVersion2 = vaultEntry.dekVersion || 1;
      const ciphertext = cryptoCodec.encrypt(vaultEntry.dek, bsonBytes, 'AES_256_GCM', ns2, dekVersion2);

      const mapSubDoc = {
        _e: 1,
        _k: vaultEntry.activeKid,
        _a: 'AES_256_GCM',
        _t: 'MAP',
        c: ciphertext,
        _entity: 'User'
      };

      await connection.collection('users').insertOne({
        name: 'Alice',
        metadata: mapSubDoc
      });

      const rawDoc = await connection.collection('users').findOne({ name: 'Alice' });
      expect(rawDoc.metadata._t).toBe('MAP');

      const result = await programmaticService.decryptDocument(rawDoc, 'User', ['metadata']);
      expect(result.metadata).toEqual(mapValue);
      expect(result.name).toBe('Alice');
    });
  });
});

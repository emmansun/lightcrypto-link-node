'use strict';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  KeyVaultService,
  LocalCmkProvider,
  MongoVaultStore,
  ProgrammaticCryptoService,
  BsonStructuredValueCodec,
  MongooseStorageAdapter,
  lclCryptoPlugin,
  prepareEncryptedSchema
} = require('../../src');
const Namespace = require('../../src/namespace/Namespace');

const NS_USER_PHONE = 'User#phone';
const NS_USER_SSN = 'User#ssn';
const NS_USER_ADDRESS = 'User#address';
const NS_USER_TAGS = 'User#tags';
const NS_USER_METADATA = 'User#metadata';

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
    const nativeClient = connection.getClient();
    const db = nativeClient.db(connection.name);
    const vaultStore = new MongoVaultStore(db);
    keyVaultService = new KeyVaultService({
      vaultStore,
      cmkProvider,
      cacheTtl: 60000
    });

    programmaticService = new ProgrammaticCryptoService({
      keyVaultService,
      storageAdapter: new MongooseStorageAdapter(),
      structuredValueCodec: new BsonStructuredValueCodec(),
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
      const subDoc = await programmaticService.encryptValue('13800138000', NS_USER_PHONE);

      // Save sub-document to MongoDB via raw collection
      const result = await connection.collection('users').insertOne({
        name: 'Alice',
        phone: subDoc
      });

      // Read back raw document
      const rawDoc = await connection.collection('users').findOne({ _id: result.insertedId });
      expect(rawDoc.phone._e).toBe(1);
      expect(rawDoc.phone._t).toBe('STR');
      // No _k, _a, _entity fields (aligned with Java)
      expect(rawDoc.phone._k).toBeUndefined();
      expect(rawDoc.phone._a).toBeUndefined();

      // Decrypt via programmatic API (no entityName needed)
      const decrypted = await programmaticService.decryptValue(rawDoc.phone);
      expect(decrypted).toBe('13800138000');
    });

    test('encrypt, save, read back, and decrypt a number value', async () => {
      const subDoc = await programmaticService.encryptValue(42, NS_USER_PHONE);

      await connection.collection('users').insertOne({ name: 'Bob', age: subDoc });
      const rawDoc = await connection.collection('users').findOne({ name: 'Bob' });

      expect(rawDoc.age._t).toBe('INT');
      const decrypted = await programmaticService.decryptValue(rawDoc.age);
      expect(decrypted).toBe(42);
    });

    test('encrypt, save, read back, and decrypt a boolean value', async () => {
      const subDoc = await programmaticService.encryptValue(true, NS_USER_PHONE);

      await connection.collection('users').insertOne({ name: 'Charlie', active: subDoc });
      const rawDoc = await connection.collection('users').findOne({ name: 'Charlie' });

      expect(rawDoc.active._t).toBe('BOOL');
      const decrypted = await programmaticService.decryptValue(rawDoc.active);
      expect(decrypted).toBe(true);
    });

    test('decryptDocument on raw find results', async () => {
      const phoneSubDoc = await programmaticService.encryptValue('13800138000', NS_USER_PHONE);
      const ssnSubDoc = await programmaticService.encryptValue('123-45-6789', NS_USER_SSN);

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

      // Decrypt using programmatic API (no entityName needed — extracted from Wire Format)
      const decryptedPhone = await programmaticService.decryptValue(rawDoc.phone);
      expect(decryptedPhone).toBe('13800138000');

      const decryptedSsn = await programmaticService.decryptValue(rawDoc.ssn);
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
      const phone1 = await programmaticService.encryptValue('13800138000', NS_USER_PHONE);
      const phone2 = await programmaticService.encryptValue('13900139000', NS_USER_PHONE);

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
      const phone = await programmaticService.encryptValue('13800138000', NS_USER_PHONE);

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
      const subDoc = await programmaticService.encryptValue(obj, NS_USER_ADDRESS);

      expect(subDoc._e).toBe(1);
      expect(subDoc._t).toBe('DOC');
      expect(typeof subDoc.c).toBe('string');

      const decrypted = await programmaticService.decryptValue(subDoc);
      expect(decrypted).toEqual(obj);
    });

    test('encryptValue with array → _t: COL, decryptValue restores array', async () => {
      const arr = ['a', 'b', 'c'];
      const subDoc = await programmaticService.encryptValue(arr, NS_USER_TAGS);

      expect(subDoc._e).toBe(1);
      expect(subDoc._t).toBe('COL');
      expect(typeof subDoc.c).toBe('string');

      const decrypted = await programmaticService.decryptValue(subDoc);
      expect(decrypted).toEqual(arr);
    });

    test('decryptDocument with DOC and COL fields', async () => {
      const addressSubDoc = await programmaticService.encryptValue({ city: 'Shanghai', zip: '200000' }, NS_USER_ADDRESS);
      const tagsSubDoc = await programmaticService.encryptValue(['admin', 'active'], NS_USER_TAGS);

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
      const subDoc = await programmaticService.encryptValue({}, NS_USER_ADDRESS);
      expect(subDoc._t).toBe('DOC');
      expect(typeof subDoc.c).toBe('string');

      const decrypted = await programmaticService.decryptValue(subDoc);
      expect(decrypted).toEqual({});
    });

    test('encryptValue with empty array → _t: COL, decryptValue restores empty array', async () => {
      const subDoc = await programmaticService.encryptValue([], NS_USER_TAGS);
      expect(subDoc._t).toBe('COL');
      expect(typeof subDoc.c).toBe('string');

      const decrypted = await programmaticService.decryptValue(subDoc);
      expect(decrypted).toEqual([]);
    });

    test('decryptValue restores MAP sub-document to plain object', async () => {
      // Construct a MAP sub-document manually (same BSON encoding as DOC)
      const BsonStructuredValueCodec = require('../../src/adapter/BsonStructuredValueCodec');
      const CryptoCodec = require('../../src/crypto/CryptoCodec');
      const bsonCodec = new BsonStructuredValueCodec();
      const cryptoCodec = new CryptoCodec();

      const canonicalNs = 'default.default.User#metadata';
      await keyVaultService.ensureVaultInitialized(canonicalNs);
      const activeKid = await keyVaultService.getActiveKid(canonicalNs);
      const dekVersion = await keyVaultService.getActiveDekVersion(canonicalNs);
      const dek = await keyVaultService.getDek(activeKid);

      const mapValue = { key1: 'value1', key2: 'value2' };
      const bsonBytes = bsonCodec.encode(mapValue, 'DOC');
      const ns = Namespace.parse(NS_USER_METADATA);
      const ciphertext = cryptoCodec.encrypt(dek, bsonBytes, 'AES_256_GCM', ns, dekVersion);

      const mapSubDoc = {
        _e: 1,
        _t: 'MAP',
        c: ciphertext
      };

      const decrypted = await programmaticService.decryptValue(mapSubDoc);
      expect(decrypted).toEqual(mapValue);
    });

    test('decryptDocument with MAP field', async () => {
      const BsonStructuredValueCodec = require('../../src/adapter/BsonStructuredValueCodec');
      const CryptoCodec = require('../../src/crypto/CryptoCodec');
      const bsonCodec = new BsonStructuredValueCodec();
      const cryptoCodec = new CryptoCodec();

      const canonicalNs = 'default.default.User#metadata';
      await keyVaultService.ensureVaultInitialized(canonicalNs);
      const activeKid = await keyVaultService.getActiveKid(canonicalNs);
      const dekVersion = await keyVaultService.getActiveDekVersion(canonicalNs);
      const dek = await keyVaultService.getDek(activeKid);

      const mapValue = { lang: 'en', theme: 'dark' };
      const bsonBytes = bsonCodec.encode(mapValue, 'DOC');
      const ns = Namespace.parse(NS_USER_METADATA);
      const ciphertext = cryptoCodec.encrypt(dek, bsonBytes, 'AES_256_GCM', ns, dekVersion);

      const mapSubDoc = {
        _e: 1,
        _t: 'MAP',
        c: ciphertext
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

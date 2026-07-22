'use strict';

const MongoVaultStore = require('../../../src/adapter/MongoVaultStore');
const OptimisticLockError = require('../../../src/spi/OptimisticLockError');

const VAULT_ID_PREFIX = 'lcl-dek-';
const NS_PHONE = 'default.default.User#phone';
const NS_ORDER = 'default.default.Order#ssn';

describe('MongoVaultStore (unit)', () => {
  let mockCollection;
  let mockDb;
  let store;

  function makeDoc(id, v = 1) {
    return {
      id,
      v,
      status: 'ACTIVE',
      activeKid: `v${v}-abcd1234`,
      keys: [{
        kid: `v${v}-abcd1234`,
        status: 'ACTIVE',
        dek: { wrapped: Buffer.from('dek-secret'), algorithm: 'AES_256_GCM', kcv: 'aa', cmkVersion: '1' },
        hmk: { wrapped: Buffer.from('hmk-secret'), algorithm: 'AES_256_GCM', kcv: 'bb', cmkVersion: '1' },
        binding: 'binding-hex',
        createdAt: new Date('2025-01-01')
      }],
      cmk: { provider: 'local', id: 'local-cmk' },
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01')
    };
  }

  beforeEach(() => {
    mockCollection = {
      replaceOne: jest.fn(),
      findOne: jest.fn(),
      countDocuments: jest.fn(),
      find: jest.fn()
    };

    mockDb = {
      collection: jest.fn().mockReturnValue(mockCollection)
    };

    store = new MongoVaultStore(mockDb);
  });

  describe('constructor', () => {
    test('uses default collection name __lcl_keyvault', () => {
      const s = new MongoVaultStore(mockDb);
      s._collection;
      expect(mockDb.collection).toHaveBeenCalledWith('__lcl_keyvault');
    });

    test('accepts custom collection name', () => {
      const s = new MongoVaultStore(mockDb, 'my_vault');
      s._collection;
      expect(mockDb.collection).toHaveBeenCalledWith('my_vault');
    });
  });

  describe('save()', () => {
    test('calls replaceOne with VAULT_ID_PREFIX prepended to _id', async () => {
      mockCollection.replaceOne.mockResolvedValue({ matchedCount: 1 });

      const doc = makeDoc(NS_PHONE);
      await store.save(doc);

      expect(mockCollection.replaceOne).toHaveBeenCalledTimes(1);
      const [filter, bsonDoc, options] = mockCollection.replaceOne.mock.calls[0];
      expect(filter).toEqual({ _id: VAULT_ID_PREFIX + NS_PHONE });
      expect(bsonDoc._id).toBe(VAULT_ID_PREFIX + NS_PHONE);
      expect(options).toEqual({ upsert: true });
    });

    test('converts id to _id with prefix in BSON document', async () => {
      mockCollection.replaceOne.mockResolvedValue({});

      const doc = makeDoc(NS_PHONE);
      await store.save(doc);

      const bsonDoc = mockCollection.replaceOne.mock.calls[0][1];
      expect(bsonDoc._id).toBe(VAULT_ID_PREFIX + NS_PHONE);
      expect(bsonDoc.id).toBeUndefined();
    });

    test('converts wrapped Buffer to Base64 string', async () => {
      mockCollection.replaceOne.mockResolvedValue({});

      const doc = makeDoc(NS_PHONE);
      await store.save(doc);

      const bsonDoc = mockCollection.replaceOne.mock.calls[0][1];
      expect(typeof bsonDoc.keys[0].dek.wrapped).toBe('string');
      expect(bsonDoc.keys[0].dek.wrapped).toBe(Buffer.from('dek-secret').toString('base64'));
    });

    test('sets updatedAt to current time', async () => {
      mockCollection.replaceOne.mockResolvedValue({});
      const before = Date.now();

      const doc = makeDoc(NS_PHONE);
      await store.save(doc);

      const bsonDoc = mockCollection.replaceOne.mock.calls[0][1];
      expect(bsonDoc.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    });
  });

  describe('load()', () => {
    test('returns null when document not found', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      const result = await store.load(NS_PHONE);
      expect(result).toBeNull();
      expect(mockCollection.findOne).toHaveBeenCalledWith({ _id: VAULT_ID_PREFIX + NS_PHONE });
    });

    test('converts BSON _id back to id (strips prefix)', async () => {
      const bsonDoc = {
        _id: VAULT_ID_PREFIX + NS_PHONE,
        v: 1,
        status: 'ACTIVE',
        activeKid: 'v1-abcd',
        keys: [{
          kid: 'v1-abcd',
          status: 'ACTIVE',
          dek: { wrapped: Buffer.from('dek-secret').toString('base64'), algorithm: 'AES_256_GCM', kcv: 'aa', cmkVersion: '1' },
          hmk: { wrapped: Buffer.from('hmk-secret').toString('base64'), algorithm: 'AES_256_GCM', kcv: 'bb', cmkVersion: '1' },
          binding: 'hex',
          createdAt: new Date()
        }],
        cmk: { provider: 'local', id: 'cmk-id' },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      mockCollection.findOne.mockResolvedValue(bsonDoc);

      const result = await store.load(NS_PHONE);
      expect(result.id).toBe(NS_PHONE);
      expect(result.v).toBe(1);
    });

    test('converts Base64 wrapped keys back to Buffer', async () => {
      const base64 = Buffer.from('dek-secret').toString('base64');
      const bsonDoc = {
        _id: VAULT_ID_PREFIX + NS_PHONE,
        v: 1,
        status: 'ACTIVE',
        activeKid: 'v1-abcd',
        keys: [{
          kid: 'v1-abcd',
          status: 'ACTIVE',
          dek: { wrapped: base64, algorithm: 'AES_256_GCM', kcv: 'aa', cmkVersion: '' },
          hmk: { wrapped: base64, algorithm: 'AES_256_GCM', kcv: 'bb', cmkVersion: '' },
          binding: 'hex',
          createdAt: new Date()
        }],
        cmk: { provider: 'local', id: 'cmk-id' },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      mockCollection.findOne.mockResolvedValue(bsonDoc);

      const result = await store.load(NS_PHONE);
      expect(Buffer.isBuffer(result.keys[0].dek.wrapped)).toBe(true);
      expect(result.keys[0].dek.wrapped.toString()).toBe('dek-secret');
    });
  });

  describe('exists()', () => {
    test('returns true when document exists', async () => {
      mockCollection.countDocuments.mockResolvedValue(1);
      const result = await store.exists(NS_PHONE);
      expect(result).toBe(true);
      expect(mockCollection.countDocuments).toHaveBeenCalledWith(
        { _id: VAULT_ID_PREFIX + NS_PHONE }, { limit: 1 }
      );
    });

    test('returns false when document does not exist', async () => {
      mockCollection.countDocuments.mockResolvedValue(0);
      const result = await store.exists(NS_PHONE);
      expect(result).toBe(false);
    });
  });

  describe('rotate()', () => {
    test('calls replaceOne with version filter and prefixed _id', async () => {
      mockCollection.replaceOne.mockResolvedValue({ matchedCount: 1 });
      mockCollection.findOne.mockResolvedValue(null);

      const doc = makeDoc(NS_PHONE, 2);
      await store.rotate(doc);

      const [filter] = mockCollection.replaceOne.mock.calls[0];
      expect(filter).toEqual({ _id: VAULT_ID_PREFIX + NS_PHONE, v: 1 });
    });

    test('returns persisted document with id stripped of prefix', async () => {
      mockCollection.replaceOne.mockResolvedValue({ matchedCount: 1 });

      const doc = makeDoc(NS_PHONE, 2);
      const result = await store.rotate(doc);

      expect(result.id).toBe(NS_PHONE);
      expect(result.v).toBe(2);
    });

    test('throws OptimisticLockError when matchedCount is 0', async () => {
      mockCollection.replaceOne.mockResolvedValue({ matchedCount: 0 });
      mockCollection.findOne.mockResolvedValue({ v: 1 });

      const doc = makeDoc(NS_PHONE, 3);
      await expect(store.rotate(doc)).rejects.toThrow(OptimisticLockError);
    });

    test('OptimisticLockError includes actual version', async () => {
      mockCollection.replaceOne.mockResolvedValue({ matchedCount: 0 });
      mockCollection.findOne.mockResolvedValue({ v: 1 });

      const doc = makeDoc(NS_PHONE, 3);
      await expect(store.rotate(doc)).rejects.toBeInstanceOf(OptimisticLockError);
      try {
        await store.rotate(doc);
      } catch (e) {
        expect(e).toBeInstanceOf(OptimisticLockError);
        expect(e.namespace).toBe(NS_PHONE);
        expect(e.expected).toBe(2);
        expect(e.actual).toBe(1);
      }
    });

    test('OptimisticLockError reports actual=0 when document not found', async () => {
      mockCollection.replaceOne.mockResolvedValue({ matchedCount: 0 });
      mockCollection.findOne.mockResolvedValue(null);

      const doc = makeDoc(NS_PHONE, 2);
      await expect(store.rotate(doc)).rejects.toMatchObject({ actual: 0 });
      try {
        await store.rotate(doc);
      } catch (e) {
        expect(e.actual).toBe(0);
      }
    });
  });

  describe('loadAll()', () => {
    test('returns all documents with prefix stripped from id', async () => {
      const bsonDocs = [
        {
          _id: VAULT_ID_PREFIX + NS_PHONE, v: 1, status: 'ACTIVE', activeKid: 'v1-a',
          keys: [{ kid: 'v1-a', status: 'ACTIVE', dek: { wrapped: 'AA==', algorithm: 'AES_256_GCM', kcv: 'a', cmkVersion: '' }, hmk: { wrapped: 'AA==', algorithm: 'AES_256_GCM', kcv: 'b', cmkVersion: '' }, binding: 'x', createdAt: new Date() }],
          cmk: { provider: 'local', id: 'cmk' }, createdAt: new Date(), updatedAt: new Date()
        },
        {
          _id: VAULT_ID_PREFIX + NS_ORDER, v: 2, status: 'ACTIVE', activeKid: 'v2-b',
          keys: [{ kid: 'v2-b', status: 'ACTIVE', dek: { wrapped: 'AA==', algorithm: 'AES_256_GCM', kcv: 'a', cmkVersion: '' }, hmk: { wrapped: 'AA==', algorithm: 'AES_256_GCM', kcv: 'b', cmkVersion: '' }, binding: 'y', createdAt: new Date() }],
          cmk: { provider: 'local', id: 'cmk' }, createdAt: new Date(), updatedAt: new Date()
        }
      ];

      mockCollection.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(bsonDocs)
      });

      const result = await store.loadAll();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(NS_PHONE);
      expect(result[1].id).toBe(NS_ORDER);
    });

    test('returns empty array when no documents', async () => {
      mockCollection.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      });

      const result = await store.loadAll();
      expect(result).toEqual([]);
    });
  });
});

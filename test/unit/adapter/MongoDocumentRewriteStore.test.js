'use strict';

const MongoDocumentRewriteStore = require('../../../src/adapter/MongoDocumentRewriteStore');

describe('MongoDocumentRewriteStore (unit)', () => {
  let mockCollection;
  let mockDb;
  let store;

  beforeEach(() => {
    mockCollection = {
      find: jest.fn(),
      updateOne: jest.fn(),
      bulkWrite: jest.fn()
    };

    mockDb = {
      collection: jest.fn().mockReturnValue(mockCollection)
    };

    store = new MongoDocumentRewriteStore({ db: mockDb });
  });

  describe('constructor', () => {
    test('throws if db not provided', () => {
      expect(() => new MongoDocumentRewriteStore({})).toThrow('requires a db option');
      expect(() => new MongoDocumentRewriteStore()).toThrow();
    });
  });

  describe('scan', () => {
    test('uses find with sort _id:1 and batchSize', async () => {
      const mockCursor = {
        sort: jest.fn().mockReturnThis(),
        close: jest.fn().mockResolvedValue(undefined),
        [Symbol.asyncIterator]: async function* () {
          yield { _id: 'a', phone: { _e: 1, _k: 'v1-abc', c: 'blob1', _t: 'STR' } };
          yield { _id: 'b', email: { _e: 1, _k: 'v1-def', c: 'blob2', _t: 'STR' } };
        }
      };
      mockCollection.find.mockReturnValue(mockCursor);

      const scanOptions = { collectionHint: 'users', batchSize: 100 };
      const docs = [];
      for await (const doc of store.scan(scanOptions)) {
        docs.push(doc);
      }

      expect(mockDb.collection).toHaveBeenCalledWith('users');
      expect(mockCollection.find).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ batchSize: 100, noCursorTimeout: true })
      );
      expect(mockCursor.sort).toHaveBeenCalledWith({ _id: 1 });
      expect(docs).toHaveLength(2);
      expect(docs[0].id).toBe('a');
      expect(docs[0].fields.phone._k).toBe('v1-abc');
      expect(docs[0].casConditions.phone).toBe('v1-abc');
    });

    test('adds _id $gt filter when resumeAfter is set', async () => {
      const mockCursor = {
        sort: jest.fn().mockReturnThis(),
        close: jest.fn().mockResolvedValue(undefined),
        [Symbol.asyncIterator]: async function* () { /* empty */ }
      };
      mockCollection.find.mockReturnValue(mockCursor);

      const scanOptions = { collectionHint: 'users', batchSize: 500, resumeAfter: 'last-id' };
      // eslint-disable-next-line no-unused-vars
      for await (const _ of store.scan(scanOptions)) { /* drain */ }

      expect(mockCollection.find).toHaveBeenCalledWith(
        { _id: { $gt: 'last-id' } },
        expect.anything()
      );
    });
  });

  describe('replace', () => {
    test('uses updateOne with CAS filter and $set', async () => {
      mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const rawDoc = {
        id: 'doc-1',
        fields: { phone: { c: 'new-blob', _e: 1, _t: 'STR', _k: 'v2-xyz', _a: 'AES_256_GCM' } },
        casConditions: { phone: 'v1-abc' },
        _collectionHint: 'users'
      };

      const result = await store.replace(rawDoc);

      expect(result).toBe(true);
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { _id: 'doc-1', 'phone._k': 'v1-abc' },
        { $set: { phone: rawDoc.fields.phone } }
      );
    });

    test('returns false on CAS conflict (modifiedCount 0)', async () => {
      mockCollection.updateOne.mockResolvedValue({ modifiedCount: 0 });

      const rawDoc = {
        id: 'doc-2',
        fields: { phone: { c: 'new-blob', _e: 1, _t: 'STR', _k: 'v2-xyz' } },
        casConditions: { phone: 'v1-abc' },
        _collectionHint: 'users'
      };

      const result = await store.replace(rawDoc);
      expect(result).toBe(false);
    });
  });

  describe('replaceBatch', () => {
    test('uses bulkWrite with ordered:false and returns modifiedCount', async () => {
      mockCollection.bulkWrite.mockResolvedValue({ modifiedCount: 2 });

      const rawDocs = [
        {
          id: 'doc-1',
          fields: { phone: { c: 'blob1', _e: 1, _k: 'v2-a' } },
          casConditions: { phone: 'v1-a' },
          _collectionHint: 'users'
        },
        {
          id: 'doc-2',
          fields: { phone: { c: 'blob2', _e: 1, _k: 'v2-b' } },
          casConditions: { phone: 'v1-b' },
          _collectionHint: 'users'
        }
      ];

      const count = await store.replaceBatch(rawDocs);

      expect(count).toBe(2);
      expect(mockCollection.bulkWrite).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ updateOne: expect.anything() })
        ]),
        { ordered: false }
      );
    });

    test('returns 0 for empty array', async () => {
      const count = await store.replaceBatch([]);
      expect(count).toBe(0);
      expect(mockCollection.bulkWrite).not.toHaveBeenCalled();
    });
  });

  describe('checkpoint', () => {
    test('saveCheckpoint upserts to __lcl_checkpoints', async () => {
      const checkpointCol = { updateOne: jest.fn().mockResolvedValue({}) };
      mockDb.collection.mockImplementation((name) => {
        if (name === '__lcl_checkpoints') return checkpointCol;
        return mockCollection;
      });

      await store.saveCheckpoint('task-1', 'cursor-abc');

      expect(mockDb.collection).toHaveBeenCalledWith('__lcl_checkpoints');
      expect(checkpointCol.updateOne).toHaveBeenCalledWith(
        { _id: 'task-1' },
        { $set: { cursorState: 'cursor-abc', updatedAt: expect.any(Date) } },
        { upsert: true }
      );
    });

    test('loadCheckpoint returns cursorState', async () => {
      const checkpointCol = { findOne: jest.fn().mockResolvedValue({ _id: 'task-1', cursorState: 'cursor-xyz' }) };
      mockDb.collection.mockImplementation((name) => {
        if (name === '__lcl_checkpoints') return checkpointCol;
        return mockCollection;
      });

      const state = await store.loadCheckpoint('task-1');
      expect(state).toBe('cursor-xyz');
    });

    test('loadCheckpoint returns null for missing checkpoint', async () => {
      const checkpointCol = { findOne: jest.fn().mockResolvedValue(null) };
      mockDb.collection.mockImplementation((name) => {
        if (name === '__lcl_checkpoints') return checkpointCol;
        return mockCollection;
      });

      const state = await store.loadCheckpoint('task-missing');
      expect(state).toBeNull();
    });

    test('loadCheckpoint returns null for completed checkpoint', async () => {
      const checkpointCol = { findOne: jest.fn().mockResolvedValue({ _id: 'task-1', cursorState: '__COMPLETED__' }) };
      mockDb.collection.mockImplementation((name) => {
        if (name === '__lcl_checkpoints') return checkpointCol;
        return mockCollection;
      });

      const state = await store.loadCheckpoint('task-1');
      expect(state).toBeNull();
    });
  });
});

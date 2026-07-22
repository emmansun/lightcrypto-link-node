'use strict';

const InMemoryVaultStore = require('../../../src/adapter/InMemoryVaultStore');
const OptimisticLockError = require('../../../src/spi/OptimisticLockError');

describe('InMemoryVaultStore (unit)', () => {
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
        dek: { wrapped: Buffer.from('dek-secret'), algorithm: 'AES_256_GCM', kcv: 'aa', cmkVersion: '' },
        hmk: { wrapped: Buffer.from('hmk-secret'), algorithm: 'AES_256_GCM', kcv: 'bb', cmkVersion: '' },
        binding: 'binding-hex',
        createdAt: new Date()
      }],
      cmk: { provider: 'local', id: 'local-cmk' },
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  beforeEach(() => {
    store = new InMemoryVaultStore();
  });

  describe('save() and load()', () => {
    test('save stores and load retrieves a document', async () => {
      const doc = makeDoc('lcl-dek-User');
      await store.save(doc);

      const loaded = await store.load('lcl-dek-User');
      expect(loaded).toBeDefined();
      expect(loaded.id).toBe('lcl-dek-User');
      expect(loaded.v).toBe(1);
    });

    test('load returns null for non-existent document', async () => {
      const result = await store.load('nonexistent');
      expect(result).toBeNull();
    });

    test('save stores a deep copy — mutating original does not affect store', async () => {
      const doc = makeDoc('lcl-dek-User');
      await store.save(doc);

      doc.v = 999;
      doc.activeKid = 'mutated';

      const loaded = await store.load('lcl-dek-User');
      expect(loaded.v).toBe(1);
      expect(loaded.activeKid).toBe('v1-abcd1234');
    });

    test('load returns a deep copy — mutating result does not affect store', async () => {
      const doc = makeDoc('lcl-dek-User');
      await store.save(doc);

      const loaded1 = await store.load('lcl-dek-User');
      loaded1.v = 999;

      const loaded2 = await store.load('lcl-dek-User');
      expect(loaded2.v).toBe(1);
    });

    test('save overwrites existing document (upsert)', async () => {
      const doc1 = makeDoc('lcl-dek-User', 1);
      await store.save(doc1);

      const doc2 = makeDoc('lcl-dek-User', 2);
      await store.save(doc2);

      const loaded = await store.load('lcl-dek-User');
      expect(loaded.v).toBe(2);
    });
  });

  describe('exists()', () => {
    test('returns true for existing document', async () => {
      await store.save(makeDoc('lcl-dek-User'));
      expect(await store.exists('lcl-dek-User')).toBe(true);
    });

    test('returns false for non-existent document', async () => {
      expect(await store.exists('nonexistent')).toBe(false);
    });
  });

  describe('rotate()', () => {
    test('succeeds when version matches (stored.v === doc.v - 1)', async () => {
      const doc1 = makeDoc('lcl-dek-User', 1);
      await store.save(doc1);

      const doc2 = makeDoc('lcl-dek-User', 2);
      const result = await store.rotate(doc2);

      expect(result.v).toBe(2);
      const loaded = await store.load('lcl-dek-User');
      expect(loaded.v).toBe(2);
    });

    test('throws OptimisticLockError when version mismatches', async () => {
      const doc1 = makeDoc('lcl-dek-User', 1);
      await store.save(doc1);

      // Attempt rotate with v=3, expecting stored v=2, but stored v is 1
      const doc3 = makeDoc('lcl-dek-User', 3);
      await expect(store.rotate(doc3)).rejects.toThrow(OptimisticLockError);
    });

    test('OptimisticLockError has correct properties', async () => {
      const doc1 = makeDoc('lcl-dek-User', 1);
      await store.save(doc1);

      const doc3 = makeDoc('lcl-dek-User', 3);
      await expect(store.rotate(doc3)).rejects.toBeInstanceOf(OptimisticLockError);
      try {
        await store.rotate(doc3);
      } catch (e) {
        expect(e).toBeInstanceOf(OptimisticLockError);
        expect(e.namespace).toBe('lcl-dek-User');
        expect(e.expected).toBe(2);
        expect(e.actual).toBe(1);
      }
    });

    test('throws OptimisticLockError when document does not exist and doc.v > 1', async () => {
      const doc2 = makeDoc('lcl-dek-New', 2);
      await expect(store.rotate(doc2)).rejects.toThrow(OptimisticLockError);
    });

    test('succeeds when document does not exist and doc.v === 1', async () => {
      // doc.v - 1 === 0, stored version is 0 (non-existent)
      const doc1 = makeDoc('lcl-dek-New', 1);
      const result = await store.rotate(doc1);
      expect(result.v).toBe(1);
    });

    test('returns a deep copy', async () => {
      const doc1 = makeDoc('lcl-dek-User', 1);
      await store.save(doc1);

      const doc2 = makeDoc('lcl-dek-User', 2);
      const result = await store.rotate(doc2);

      result.v = 999;
      const loaded = await store.load('lcl-dek-User');
      expect(loaded.v).toBe(2);
    });
  });

  describe('loadAll()', () => {
    test('returns empty array when store is empty', async () => {
      const result = await store.loadAll();
      expect(result).toEqual([]);
    });

    test('returns all stored documents', async () => {
      await store.save(makeDoc('lcl-dek-User'));
      await store.save(makeDoc('lcl-dek-Order'));
      await store.save(makeDoc('lcl-dek-Product'));

      const all = await store.loadAll();
      expect(all).toHaveLength(3);
      const ids = all.map(d => d.id).sort();
      expect(ids).toEqual(['lcl-dek-Order', 'lcl-dek-Product', 'lcl-dek-User']);
    });

    test('returns deep copies', async () => {
      await store.save(makeDoc('lcl-dek-User'));
      const all = await store.loadAll();
      all[0].v = 999;

      const loaded = await store.load('lcl-dek-User');
      expect(loaded.v).toBe(1);
    });
  });

  describe('clear()', () => {
    test('removes all stored documents', async () => {
      await store.save(makeDoc('lcl-dek-User'));
      await store.save(makeDoc('lcl-dek-Order'));

      store.clear();

      expect(await store.loadAll()).toEqual([]);
      expect(await store.exists('lcl-dek-User')).toBe(false);
    });
  });
});

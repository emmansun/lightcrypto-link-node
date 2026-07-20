'use strict';

const mongoose = require('mongoose');
const {
  KeyVaultDocumentSchema,
  KeyVersionEntrySchema,
  WrappedKeyInfoSchema,
  getKeyVaultModel
} = require('../../../src/model/KeyVaultDocument');

describe('KeyVaultDocument', () => {
  describe('WrappedKeyInfoSchema', () => {
    test('has required fields: wrapped, algorithm, kcv', () => {
      const paths = WrappedKeyInfoSchema.paths;
      expect(paths.wrapped).toBeDefined();
      expect(paths.wrapped.isRequired).toBe(true);
      expect(paths.algorithm).toBeDefined();
      expect(paths.algorithm.isRequired).toBe(true);
      expect(paths.kcv).toBeDefined();
      expect(paths.kcv.isRequired).toBe(true);
    });

    test('cmkVersion has empty string default', () => {
      const paths = WrappedKeyInfoSchema.paths;
      expect(paths.cmkVersion).toBeDefined();
      expect(paths.cmkVersion.defaultValue).toBe('');
    });

    test('has _id disabled', () => {
      expect(WrappedKeyInfoSchema.options._id).toBe(false);
    });
  });

  describe('KeyVersionEntrySchema', () => {
    test('has required fields: kid, status, dek, hmk, binding', () => {
      const paths = KeyVersionEntrySchema.paths;
      expect(paths.kid).toBeDefined();
      expect(paths.kid.isRequired).toBe(true);
      expect(paths.status).toBeDefined();
      expect(paths.status.isRequired).toBe(true);
      expect(paths.dek).toBeDefined();
      expect(paths.hmk).toBeDefined();
      expect(paths.binding).toBeDefined();
      expect(paths.binding.isRequired).toBe(true);
    });

    test('status has enum constraint [ACTIVE, ROTATED, REVOKED]', () => {
      const statusPath = KeyVersionEntrySchema.paths.status;
      expect(statusPath.enumValues).toEqual(['ACTIVE', 'ROTATED', 'REVOKED']);
    });

    test('createdAt has Date.now default', () => {
      const paths = KeyVersionEntrySchema.paths;
      expect(paths.createdAt).toBeDefined();
      expect(paths.createdAt.defaultValue).toBe(Date.now);
    });

    test('has _id disabled', () => {
      expect(KeyVersionEntrySchema.options._id).toBe(false);
    });
  });

  describe('KeyVaultDocumentSchema', () => {
    test('uses __lcl_keyvault collection', () => {
      expect(KeyVaultDocumentSchema.options.collection).toBe('__lcl_keyvault');
    });

    test('has versionKey disabled', () => {
      expect(KeyVaultDocumentSchema.options.versionKey).toBe(false);
    });

    test('_id is String type', () => {
      const idPath = KeyVaultDocumentSchema.paths._id;
      expect(idPath.instance).toBe('String');
    });

    test('v has default 1', () => {
      const vPath = KeyVaultDocumentSchema.paths.v;
      expect(vPath.defaultValue).toBe(1);
    });

    test('status has default ACTIVE', () => {
      const statusPath = KeyVaultDocumentSchema.paths.status;
      expect(statusPath.defaultValue).toBe('ACTIVE');
    });

    test('has cmk.provider and cmk.id fields', () => {
      const paths = KeyVaultDocumentSchema.paths;
      expect(paths['cmk.provider']).toBeDefined();
      expect(paths['cmk.id']).toBeDefined();
    });

    test('pre-save hook updates updatedAt', () => {
      // Verify the pre-save hook is registered
      const preSaveHooks = KeyVaultDocumentSchema.s.hooks._pres.get('save');
      expect(preSaveHooks).toBeDefined();
      expect(preSaveHooks.length).toBeGreaterThan(0);
    });
  });

  describe('getKeyVaultModel', () => {
    test('creates model with correct collection name', () => {
      const connection = mongoose.createConnection();
      const Model = getKeyVaultModel(connection);

      expect(Model.modelName).toBe('KeyVaultDocument');
      expect(Model.collection.name).toBe('__lcl_keyvault');

      // Cleanup
      delete connection.models.KeyVaultDocument;
    });

    test('returns cached model on second call', () => {
      const connection = mongoose.createConnection();
      const Model1 = getKeyVaultModel(connection);
      const Model2 = getKeyVaultModel(connection);

      expect(Model1).toBe(Model2);

      // Cleanup
      delete connection.models.KeyVaultDocument;
    });
  });
});

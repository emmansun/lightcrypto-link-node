'use strict';

const lib = require('../../src/index');

describe('index.js - public API exports', () => {
  describe('Crypto module', () => {
    test('exports CryptoCodec', () => {
      expect(lib.CryptoCodec).toBeDefined();
      expect(typeof lib.CryptoCodec).toBe('function');
    });

    test('exports SymmetricEncryptor', () => {
      expect(lib.SymmetricEncryptor).toBeDefined();
      expect(typeof lib.SymmetricEncryptor).toBe('function');
    });

    test('exports AesGcmEncryptor', () => {
      expect(lib.AesGcmEncryptor).toBeDefined();
      expect(typeof lib.AesGcmEncryptor).toBe('function');
    });

    test('exports AesCbcEncryptor', () => {
      expect(lib.AesCbcEncryptor).toBeDefined();
      expect(typeof lib.AesCbcEncryptor).toBe('function');
    });

    test('exports Sm4CbcEncryptor', () => {
      expect(lib.Sm4CbcEncryptor).toBeDefined();
      expect(typeof lib.Sm4CbcEncryptor).toBe('function');
    });
  });

  describe('Format module', () => {
    test('exports AlgorithmId', () => {
      expect(lib.AlgorithmId).toBeDefined();
      expect(lib.AlgorithmId.AES_256_GCM).toBeDefined();
    });

    test('exports fromName', () => {
      expect(typeof lib.fromName).toBe('function');
    });

    test('exports fromByte', () => {
      expect(typeof lib.fromByte).toBe('function');
    });

    test('exports WireFormatEncoder', () => {
      expect(lib.WireFormatEncoder).toBeDefined();
      expect(typeof lib.WireFormatEncoder).toBe('function');
    });

    test('exports WireFormatDecoder', () => {
      expect(lib.WireFormatDecoder).toBeDefined();
      expect(typeof lib.WireFormatDecoder).toBe('function');
    });
  });

  describe('Namespace module', () => {
    test('exports Namespace', () => {
      expect(lib.Namespace).toBeDefined();
      expect(typeof lib.Namespace).toBe('function');
    });

    test('Namespace.parse works', () => {
      const ns = lib.Namespace.parse('User#phone');
      expect(ns.canonical()).toBe('default.default.User#phone');
    });
  });

  describe('BlindIndex module', () => {
    test('exports BlindIndexEngine', () => {
      expect(lib.BlindIndexEngine).toBeDefined();
      expect(typeof lib.BlindIndexEngine).toBe('function');
    });
  });

  describe('Services module', () => {
    test('exports TypeSerializer', () => {
      expect(lib.TypeSerializer).toBeDefined();
      expect(typeof lib.TypeSerializer).toBe('function');
    });

    test('exports TypeDeserializer', () => {
      expect(lib.TypeDeserializer).toBeDefined();
      expect(typeof lib.TypeDeserializer).toBe('function');
    });

    test('exports KeyVaultService', () => {
      expect(lib.KeyVaultService).toBeDefined();
      expect(typeof lib.KeyVaultService).toBe('function');
    });

    test('exports FieldCryptoService', () => {
      expect(lib.FieldCryptoService).toBeDefined();
      expect(typeof lib.FieldCryptoService).toBe('function');
    });

    test('exports FatalCryptoError', () => {
      expect(lib.FatalCryptoError).toBeDefined();
      expect(typeof lib.FatalCryptoError).toBe('function');
    });

    test('exports DecryptionError', () => {
      expect(lib.DecryptionError).toBeDefined();
      expect(typeof lib.DecryptionError).toBe('function');
    });

    test('exports ProgrammaticCryptoService', () => {
      expect(lib.ProgrammaticCryptoService).toBeDefined();
      expect(typeof lib.ProgrammaticCryptoService).toBe('function');
    });
  });

  describe('Providers module', () => {
    test('exports CmkProvider', () => {
      expect(lib.CmkProvider).toBeDefined();
      expect(typeof lib.CmkProvider).toBe('function');
    });

    test('exports LocalCmkProvider', () => {
      expect(lib.LocalCmkProvider).toBeDefined();
      expect(typeof lib.LocalCmkProvider).toBe('function');
    });

    test('exports AzureKmsProvider', () => {
      expect(lib.AzureKmsProvider).toBeDefined();
      expect(typeof lib.AzureKmsProvider).toBe('function');
    });

    test('exports AlibabaKmsProvider', () => {
      expect(lib.AlibabaKmsProvider).toBeDefined();
      expect(typeof lib.AlibabaKmsProvider).toBe('function');
    });
  });

  describe('Configuration module', () => {
    test('exports LclConfig', () => {
      expect(lib.LclConfig).toBeDefined();
      expect(typeof lib.LclConfig).toBe('function');
    });
  });

  describe('Plugin module', () => {
    test('exports lclCryptoPlugin', () => {
      expect(lib.lclCryptoPlugin).toBeDefined();
      expect(typeof lib.lclCryptoPlugin).toBe('function');
    });

    test('exports prepareEncryptedSchema', () => {
      expect(lib.prepareEncryptedSchema).toBeDefined();
      expect(typeof lib.prepareEncryptedSchema).toBe('function');
    });

    test('exports rewriteQuery', () => {
      expect(lib.rewriteQuery).toBeDefined();
      expect(typeof lib.rewriteQuery).toBe('function');
    });
  });

  describe('SPI module', () => {
    test('exports StorageAdapter', () => {
      expect(lib.StorageAdapter).toBeDefined();
      expect(typeof lib.StorageAdapter).toBe('function');
    });

    test('exports DocumentAccessor', () => {
      expect(lib.DocumentAccessor).toBeDefined();
      expect(typeof lib.DocumentAccessor).toBe('function');
    });

    test('exports StructuredValueCodec', () => {
      expect(lib.StructuredValueCodec).toBeDefined();
      expect(typeof lib.StructuredValueCodec).toBe('function');
    });

    test('exports QueryTransformer', () => {
      expect(lib.QueryTransformer).toBeDefined();
      expect(typeof lib.QueryTransformer).toBe('function');
    });
  });

  describe('Adapter module', () => {
    test('exports VaultStore', () => {
      expect(lib.VaultStore).toBeDefined();
      expect(typeof lib.VaultStore).toBe('function');
    });

    test('exports validateVaultDocument', () => {
      expect(lib.validateVaultDocument).toBeDefined();
      expect(typeof lib.validateVaultDocument).toBe('function');
    });

    test('exports createVaultDocument', () => {
      expect(lib.createVaultDocument).toBeDefined();
      expect(typeof lib.createVaultDocument).toBe('function');
    });

    test('exports OptimisticLockError', () => {
      expect(lib.OptimisticLockError).toBeDefined();
      expect(typeof lib.OptimisticLockError).toBe('function');
    });

    test('exports MongoVaultStore', () => {
      expect(lib.MongoVaultStore).toBeDefined();
      expect(typeof lib.MongoVaultStore).toBe('function');
    });

    test('exports InMemoryVaultStore', () => {
      expect(lib.InMemoryVaultStore).toBeDefined();
      expect(typeof lib.InMemoryVaultStore).toBe('function');
    });

    test('exports MongooseStorageAdapter', () => {
      expect(lib.MongooseStorageAdapter).toBeDefined();
      expect(typeof lib.MongooseStorageAdapter).toBe('function');
    });

    test('exports MongooseDocumentAccessor', () => {
      expect(lib.MongooseDocumentAccessor).toBeDefined();
      expect(typeof lib.MongooseDocumentAccessor).toBe('function');
    });

    test('exports BsonStructuredValueCodec', () => {
      expect(lib.BsonStructuredValueCodec).toBeDefined();
      expect(typeof lib.BsonStructuredValueCodec).toBe('function');
    });

    test('exports MongooseQueryTransformer', () => {
      expect(lib.MongooseQueryTransformer).toBeDefined();
      expect(typeof lib.MongooseQueryTransformer).toBe('function');
    });
  });

  describe('instantiation smoke tests', () => {
    test('CryptoCodec can be instantiated', () => {
      const codec = new lib.CryptoCodec();
      expect(codec).toBeInstanceOf(lib.CryptoCodec);
    });

    test('TypeSerializer can be instantiated', () => {
      const serializer = new lib.TypeSerializer();
      expect(serializer).toBeInstanceOf(lib.TypeSerializer);
    });

    test('TypeDeserializer can be instantiated', () => {
      const deserializer = new lib.TypeDeserializer();
      expect(deserializer).toBeInstanceOf(lib.TypeDeserializer);
    });

    test('FieldCryptoService can be instantiated', () => {
      const service = new lib.FieldCryptoService({
        storageAdapter: new lib.MongooseStorageAdapter(),
        structuredValueCodec: new lib.BsonStructuredValueCodec()
      });
      expect(service).toBeInstanceOf(lib.FieldCryptoService);
    });

    test('InMemoryVaultStore can be instantiated', () => {
      const store = new lib.InMemoryVaultStore();
      expect(store).toBeInstanceOf(lib.VaultStore);
    });

    test('LocalCmkProvider can be instantiated with valid key', () => {
      const crypto = require('crypto');
      const cmkHex = crypto.randomBytes(32).toString('hex');
      const provider = new lib.LocalCmkProvider(cmkHex);
      expect(provider).toBeInstanceOf(lib.CmkProvider);
    });

    test('MongooseStorageAdapter can be instantiated', () => {
      const adapter = new lib.MongooseStorageAdapter();
      expect(adapter).toBeInstanceOf(lib.StorageAdapter);
    });

    test('MongooseDocumentAccessor can be instantiated', () => {
      const accessor = new lib.MongooseDocumentAccessor();
      expect(accessor).toBeInstanceOf(lib.DocumentAccessor);
    });

    test('BsonStructuredValueCodec can be instantiated', () => {
      const codec = new lib.BsonStructuredValueCodec();
      expect(codec).toBeInstanceOf(lib.StructuredValueCodec);
    });
  });
});

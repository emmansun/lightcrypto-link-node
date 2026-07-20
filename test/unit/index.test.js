'use strict';

const lib = require('../../src/index');

describe('index.js - public API exports', () => {
  describe('Crypto module', () => {
    test('exports CryptoCodec', () => {
      expect(lib.CryptoCodec).toBeDefined();
      expect(typeof lib.CryptoCodec).toBe('function');
    });

    test('exports BsonCodec', () => {
      expect(lib.BsonCodec).toBeDefined();
      expect(typeof lib.BsonCodec).toBe('function');
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

  describe('Model module', () => {
    test('exports getKeyVaultModel', () => {
      expect(lib.getKeyVaultModel).toBeDefined();
      expect(typeof lib.getKeyVaultModel).toBe('function');
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
      const service = new lib.FieldCryptoService();
      expect(service).toBeInstanceOf(lib.FieldCryptoService);
    });

    test('LocalCmkProvider can be instantiated with valid key', () => {
      const crypto = require('crypto');
      const cmkHex = crypto.randomBytes(32).toString('hex');
      const provider = new lib.LocalCmkProvider(cmkHex);
      expect(provider).toBeInstanceOf(lib.CmkProvider);
    });
  });
});

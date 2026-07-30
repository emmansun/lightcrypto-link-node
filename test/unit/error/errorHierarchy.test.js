'use strict';

const {
  LclCryptoError,
  PayloadCorruptionError,
  KeyResolutionError,
  CryptoAuthenticationError,
  SchemaDriftError,
  UnsupportedAlgorithmError
} = require('../../../src/error');

describe('Error Hierarchy', () => {
  describe('LclCryptoError base class', () => {
    test('has correct name and code', () => {
      const err = new LclCryptoError('test error');
      expect(err.name).toBe('LclCryptoError');
      expect(err.code).toBe('ERR_LCL_CRYPTO');
      expect(err.message).toBe('test error');
    });

    test('populates context fields', () => {
      const cause = new Error('root cause');
      const err = new LclCryptoError('test', {
        namespace: 'default.default.User#phone',
        dekVersion: 2,
        kid: 'v1-abcd1234',
        fieldName: 'phone',
        cause
      });
      expect(err.namespace).toBe('default.default.User#phone');
      expect(err.dekVersion).toBe(2);
      expect(err.kid).toBe('v1-abcd1234');
      expect(err.fieldName).toBe('phone');
      expect(err.cause).toBe(cause);
    });

    test('is instanceof Error', () => {
      const err = new LclCryptoError('test');
      expect(err instanceof Error).toBe(true);
      expect(err instanceof LclCryptoError).toBe(true);
    });
  });

  describe('PayloadCorruptionError', () => {
    test('has correct code', () => {
      const err = new PayloadCorruptionError('corrupted');
      expect(err.code).toBe('ERR_LCL_PAYLOAD_CORRUPTION');
      expect(err.name).toBe('PayloadCorruptionError');
    });

    test('populates extra fields', () => {
      const err = new PayloadCorruptionError('truncated', {
        blobLength: 5,
        expectedMinLength: 12
      });
      expect(err.blobLength).toBe(5);
      expect(err.expectedMinLength).toBe(12);
    });

    test('is instanceof LclCryptoError and Error', () => {
      const err = new PayloadCorruptionError('test');
      expect(err instanceof LclCryptoError).toBe(true);
      expect(err instanceof PayloadCorruptionError).toBe(true);
      expect(err instanceof Error).toBe(true);
    });
  });

  describe('KeyResolutionError', () => {
    test('has correct code', () => {
      const err = new KeyResolutionError('key not found');
      expect(err.code).toBe('ERR_LCL_KEY_RESOLUTION');
      expect(err.name).toBe('KeyResolutionError');
    });

    test('populates vaultExists field', () => {
      const err = new KeyResolutionError('vault missing', {
        namespace: 'ns',
        vaultExists: false
      });
      expect(err.vaultExists).toBe(false);
      expect(err.namespace).toBe('ns');
    });

    test('is instanceof LclCryptoError', () => {
      const err = new KeyResolutionError('test');
      expect(err instanceof LclCryptoError).toBe(true);
    });
  });

  describe('CryptoAuthenticationError', () => {
    test('has correct code', () => {
      const err = new CryptoAuthenticationError('auth failed');
      expect(err.code).toBe('ERR_LCL_CRYPTO_AUTH');
      expect(err.name).toBe('CryptoAuthenticationError');
    });

    test('is instanceof LclCryptoError', () => {
      const err = new CryptoAuthenticationError('test');
      expect(err instanceof LclCryptoError).toBe(true);
    });
  });

  describe('SchemaDriftError', () => {
    test('has correct code', () => {
      const err = new SchemaDriftError('drift detected');
      expect(err.code).toBe('ERR_LCL_SCHEMA_DRIFT');
      expect(err.name).toBe('SchemaDriftError');
    });

    test('populates extra fields', () => {
      const rawBytes = Buffer.from('test');
      const err = new SchemaDriftError('drift', {
        typeMarker: 'INT',
        rawBytes
      });
      expect(err.typeMarker).toBe('INT');
      expect(err.rawBytes).toBe(rawBytes);
    });

    test('is instanceof LclCryptoError', () => {
      const err = new SchemaDriftError('test');
      expect(err instanceof LclCryptoError).toBe(true);
    });
  });

  describe('UnsupportedAlgorithmError', () => {
    test('has correct code', () => {
      const err = new UnsupportedAlgorithmError('unknown algo');
      expect(err.code).toBe('ERR_LCL_UNSUPPORTED_ALGORITHM');
      expect(err.name).toBe('UnsupportedAlgorithmError');
    });

    test('populates algorithm field', () => {
      const err = new UnsupportedAlgorithmError('unknown', { algorithm: 'FAKE_ALGO' });
      expect(err.algorithm).toBe('FAKE_ALGO');
    });

    test('supports null algorithm', () => {
      const err = new UnsupportedAlgorithmError('no algo', { algorithm: null });
      expect(err.algorithm).toBeNull();
    });

    test('is instanceof LclCryptoError', () => {
      const err = new UnsupportedAlgorithmError('test');
      expect(err instanceof LclCryptoError).toBe(true);
    });
  });
});

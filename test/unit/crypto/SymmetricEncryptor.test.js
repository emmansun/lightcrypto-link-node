'use strict';

const SymmetricEncryptor = require('../../../src/crypto/SymmetricEncryptor');

describe('SymmetricEncryptor (base class)', () => {
  let encryptor;

  beforeEach(() => {
    encryptor = new SymmetricEncryptor();
  });

  test('algorithmId throws "must be implemented"', () => {
    expect(() => encryptor.algorithmId()).toThrow('algorithmId() must be implemented by subclass');
  });

  test('getAlgorithm delegates to algorithmId and throws', () => {
    expect(() => encryptor.getAlgorithm()).toThrow('algorithmId() must be implemented by subclass');
  });

  test('encrypt throws "must be implemented"', () => {
    const key = Buffer.alloc(32);
    const iv = Buffer.alloc(12);
    const plaintext = Buffer.from('test');
    expect(() => encryptor.encrypt(key, iv, plaintext)).toThrow('encrypt() must be implemented by subclass');
  });

  test('decrypt throws "must be implemented"', () => {
    const key = Buffer.alloc(32);
    const iv = Buffer.alloc(12);
    const ciphertext = Buffer.from('ciphertext');
    expect(() => encryptor.decrypt(key, iv, ciphertext)).toThrow('decrypt() must be implemented by subclass');
  });

  test('computeKcv throws "must be implemented"', () => {
    const key = Buffer.alloc(32);
    expect(() => encryptor.computeKcv(key)).toThrow('computeKcv() must be implemented by subclass');
  });

  test('can be subclassed with proper implementation', () => {
    class MockEncryptor extends SymmetricEncryptor {
      algorithmId() { return { id: 0xFF, name: 'MOCK', ivLength: 12, keyLength: 32, isGcm: false }; }
      encrypt(key, iv, plaintext) { return plaintext; }
      decrypt(key, iv, ciphertext) { return ciphertext; }
      computeKcv(key) { return 'mock-kcv'; }
    }

    const mock = new MockEncryptor();
    expect(mock.getAlgorithm()).toBe('MOCK');
    expect(mock.encrypt(Buffer.alloc(32), Buffer.alloc(12), Buffer.from('hi')).toString()).toBe('hi');
    expect(mock.decrypt(Buffer.alloc(32), Buffer.alloc(12), Buffer.from('hi')).toString()).toBe('hi');
    expect(mock.computeKcv(Buffer.alloc(32))).toBe('mock-kcv');
  });
});

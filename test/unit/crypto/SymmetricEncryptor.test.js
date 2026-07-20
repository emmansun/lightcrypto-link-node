'use strict';

const SymmetricEncryptor = require('../../../src/crypto/SymmetricEncryptor');

describe('SymmetricEncryptor (base class)', () => {
  let encryptor;

  beforeEach(() => {
    encryptor = new SymmetricEncryptor();
  });

  test('getAlgorithm throws "must be implemented"', () => {
    expect(() => encryptor.getAlgorithm()).toThrow('getAlgorithm() must be implemented by subclass');
  });

  test('encrypt throws "must be implemented"', () => {
    const key = Buffer.alloc(32);
    const plaintext = Buffer.from('test');
    expect(() => encryptor.encrypt(key, plaintext)).toThrow('encrypt() must be implemented by subclass');
  });

  test('decrypt throws "must be implemented"', () => {
    const key = Buffer.alloc(32);
    const data = Buffer.from('ciphertext');
    expect(() => encryptor.decrypt(key, data)).toThrow('decrypt() must be implemented by subclass');
  });

  test('computeKcv throws "must be implemented"', () => {
    const key = Buffer.alloc(32);
    expect(() => encryptor.computeKcv(key)).toThrow('computeKcv() must be implemented by subclass');
  });

  test('can be subclassed with proper implementation', () => {
    class MockEncryptor extends SymmetricEncryptor {
      getAlgorithm() { return 'MOCK'; }
      encrypt(key, plaintext) { return plaintext; }
      decrypt(key, data) { return data; }
      computeKcv(key) { return 'mock-kcv'; }
    }

    const mock = new MockEncryptor();
    expect(mock.getAlgorithm()).toBe('MOCK');
    expect(mock.encrypt(Buffer.alloc(32), Buffer.from('hi')).toString()).toBe('hi');
    expect(mock.decrypt(Buffer.alloc(32), Buffer.from('hi')).toString()).toBe('hi');
    expect(mock.computeKcv(Buffer.alloc(32))).toBe('mock-kcv');
  });
});

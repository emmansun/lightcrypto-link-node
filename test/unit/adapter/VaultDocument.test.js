'use strict';

const { validateVaultDocument, createVaultDocument, REQUIRED_FIELDS, VALID_KEY_STATUSES } = require('../../../src/adapter/VaultDocument');

describe('VaultDocument (unit)', () => {
  function validDoc(overrides = {}) {
    return {
      id: 'lcl-dek-User',
      v: 1,
      status: 'ACTIVE',
      activeKid: 'v1-abcd1234',
      keys: [{
        kid: 'v1-abcd1234',
        status: 'ACTIVE',
        dek: { wrapped: Buffer.alloc(16), algorithm: 'AES_256_GCM', kcv: 'aabb', cmkVersion: '' },
        hmk: { wrapped: Buffer.alloc(16), algorithm: 'AES_256_GCM', kcv: 'ccdd', cmkVersion: '' },
        binding: 'deadbeef',
        createdAt: new Date()
      }],
      cmk: { provider: 'local-symmetric', id: 'local-cmk-sha256:abcd' },
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    };
  }

  describe('validateVaultDocument', () => {
    test('accepts a valid document', () => {
      expect(() => validateVaultDocument(validDoc())).not.toThrow();
    });

    test('throws for null input', () => {
      expect(() => validateVaultDocument(null)).toThrow(/non-null object/);
    });

    test('throws for non-object input', () => {
      expect(() => validateVaultDocument('string')).toThrow(/non-null object/);
    });

    test.each(REQUIRED_FIELDS)('throws when missing required field: %s', (field) => {
      const doc = validDoc();
      delete doc[field];
      expect(() => validateVaultDocument(doc)).toThrow(new RegExp(`missing required field: ${field}`));
    });

    test('throws when id is not a string', () => {
      expect(() => validateVaultDocument(validDoc({ id: 123 }))).toThrow(/id must be a String/);
    });

    test('throws when v is less than 1', () => {
      expect(() => validateVaultDocument(validDoc({ v: 0 }))).toThrow(/v must be a Number >= 1/);
    });

    test('throws when v is not a number', () => {
      expect(() => validateVaultDocument(validDoc({ v: '1' }))).toThrow(/v must be a Number/);
    });

    test('throws when keys is not an array', () => {
      expect(() => validateVaultDocument(validDoc({ keys: {} }))).toThrow(/keys must be an Array/);
    });

    test('throws when cmk is missing provider', () => {
      expect(() => validateVaultDocument(validDoc({ cmk: { id: 'x' } }))).toThrow(/cmk must be an Object with provider and id/);
    });

    test('throws when cmk is missing id', () => {
      expect(() => validateVaultDocument(validDoc({ cmk: { provider: 'x' } }))).toThrow(/cmk must be an Object with provider and id/);
    });

    test('throws when createdAt is not a Date', () => {
      expect(() => validateVaultDocument(validDoc({ createdAt: '2024-01-01' }))).toThrow(/createdAt must be a Date/);
    });

    test('throws when updatedAt is not a Date', () => {
      expect(() => validateVaultDocument(validDoc({ updatedAt: 12345 }))).toThrow(/updatedAt must be a Date/);
    });

    describe('key entry validation', () => {
      test('throws when key entry is null', () => {
        expect(() => validateVaultDocument(validDoc({ keys: [null] }))).toThrow(/keys\[0\] must be a non-null object/);
      });

      test('throws when kid is missing', () => {
        const doc = validDoc();
        delete doc.keys[0].kid;
        expect(() => validateVaultDocument(doc)).toThrow(/keys\[0\]\.kid must be a String/);
      });

      test('throws for invalid key status', () => {
        const doc = validDoc();
        doc.keys[0].status = 'INVALID';
        expect(() => validateVaultDocument(doc)).toThrow(/keys\[0\]\.status must be one of/);
      });

      test.each(VALID_KEY_STATUSES)('accepts valid key status: %s', (status) => {
        const doc = validDoc();
        doc.keys[0].status = status;
        expect(() => validateVaultDocument(doc)).not.toThrow();
      });

      test('throws when dek.wrapped is not a Buffer', () => {
        const doc = validDoc();
        doc.keys[0].dek.wrapped = 'not-a-buffer';
        expect(() => validateVaultDocument(doc)).toThrow(/keys\[0\]\.dek\.wrapped must be a Buffer/);
      });

      test('throws when hmk.algorithm is missing', () => {
        const doc = validDoc();
        delete doc.keys[0].hmk.algorithm;
        expect(() => validateVaultDocument(doc)).toThrow(/keys\[0\]\.hmk\.algorithm must be a String/);
      });

      test('throws when binding is not a string', () => {
        const doc = validDoc();
        doc.keys[0].binding = 123;
        expect(() => validateVaultDocument(doc)).toThrow(/keys\[0\]\.binding must be a String/);
      });

      test('throws when key createdAt is not a Date', () => {
        const doc = validDoc();
        doc.keys[0].createdAt = 'not-a-date';
        expect(() => validateVaultDocument(doc)).toThrow(/keys\[0\]\.createdAt must be a Date/);
      });
    });
  });

  describe('createVaultDocument', () => {
    test('returns the validated document', () => {
      const doc = validDoc();
      const result = createVaultDocument(doc);
      expect(result).toBe(doc);
    });

    test('throws for invalid document', () => {
      expect(() => createVaultDocument({})).toThrow(/missing required field/);
    });
  });

  describe('constants', () => {
    test('REQUIRED_FIELDS contains expected fields', () => {
      expect(REQUIRED_FIELDS).toEqual(['id', 'v', 'status', 'activeKid', 'keys', 'cmk', 'createdAt', 'updatedAt']);
    });

    test('VALID_KEY_STATUSES contains expected statuses', () => {
      expect(VALID_KEY_STATUSES).toEqual(['ACTIVE', 'ROTATED', 'REVOKED']);
    });
  });
});

'use strict';

const mongoose = require('mongoose');
const { prepareEncryptedSchema } = require('../../../src/plugin/lclCryptoPlugin');

describe('lclCryptoPlugin - prepareEncryptedSchema', () => {
  describe('scalar fields', () => {
    test('extracts encrypt option from scalar field', () => {
      const definition = {
        phone: { type: String, encrypt: true }
      };
      const result = prepareEncryptedSchema(definition);

      expect(result.phone).toEqual({ type: String });
      const opts = result._lclFieldOptions;
      expect(opts.phone).toBeDefined();
      expect(opts.phone.encrypt).toBe(true);
      expect(opts.phone.blindIndex).toBe(false);
      expect(opts.phone.structuredType).toBeNull();
    });

    test('extracts blindIndex option', () => {
      const definition = {
        email: { type: String, encrypt: true, blindIndex: true }
      };
      const result = prepareEncryptedSchema(definition);

      expect(result.email).toEqual({ type: String });
      const opts = result._lclFieldOptions;
      expect(opts.email.blindIndex).toBe(true);
    });

    test('extracts custom fieldName', () => {
      const definition = {
        phone: { type: String, encrypt: true, fieldName: 'phone_number' }
      };
      const result = prepareEncryptedSchema(definition);

      const opts = result._lclFieldOptions;
      expect(opts.phone.fieldName).toBe('phone_number');
    });

    test('extracts mode option', () => {
      const definition = {
        tags: { type: [String], encrypt: true, mode: 'WHOLE' }
      };
      const result = prepareEncryptedSchema(definition);

      const opts = result._lclFieldOptions;
      expect(opts.tags.mode).toBe('WHOLE');
    });

    test('preserves other schema options', () => {
      const definition = {
        phone: { type: String, encrypt: true, required: true, index: true }
      };
      const result = prepareEncryptedSchema(definition);

      expect(result.phone).toEqual({ type: String, required: true, index: true });
    });
  });

  describe('non-encrypted fields', () => {
    test('passes through fields without encrypt option', () => {
      const definition = {
        name: { type: String, required: true },
        age: { type: Number }
      };
      const result = prepareEncryptedSchema(definition);

      expect(result.name).toEqual({ type: String, required: true });
      expect(result.age).toEqual({ type: Number });
    });

    test('_lclFieldOptions is empty when no encrypted fields', () => {
      const definition = {
        name: { type: String }
      };
      const result = prepareEncryptedSchema(definition);
      const opts = result._lclFieldOptions;
      expect(Object.keys(opts).length).toBe(0);
    });
  });

  describe('structured types - DOC', () => {
    test('detects sub-document via Schema instance', () => {
      const addressSchema = new mongoose.Schema({ street: String, city: String });
      const definition = {
        address: { type: addressSchema, encrypt: true }
      };
      const result = prepareEncryptedSchema(definition);

      const opts = result._lclFieldOptions;
      expect(opts.address.structuredType).toBe('DOC');
    });

    test('detects nested object definition as DOC', () => {
      const definition = {
        address: { type: { street: String, city: String }, encrypt: true }
      };
      const result = prepareEncryptedSchema(definition);

      const opts = result._lclFieldOptions;
      expect(opts.address.structuredType).toBe('DOC');
      // Nested object type is replaced with Object (Mixed)
      expect(result.address).toBe(Object);
    });
  });

  describe('structured types - COL', () => {
    test('detects array via longhand { type: [...] }', () => {
      const definition = {
        tags: { type: [String], encrypt: true }
      };
      const result = prepareEncryptedSchema(definition);

      const opts = result._lclFieldOptions;
      expect(opts.tags.structuredType).toBe('COL');
      expect(opts.tags.isSubDocArray).toBe(false);
    });

    test('detects sub-document array', () => {
      const definition = {
        items: { type: [{ sku: String, qty: Number }], encrypt: true }
      };
      const result = prepareEncryptedSchema(definition);

      const opts = result._lclFieldOptions;
      expect(opts.items.structuredType).toBe('COL');
      expect(opts.items.isSubDocArray).toBe(true);
    });

    test('detects shorthand array with encrypt property', () => {
      const arr = [String];
      arr.encrypt = true;
      const definition = { tags: arr };
      const result = prepareEncryptedSchema(definition);

      const opts = result._lclFieldOptions;
      expect(opts.tags).toBeDefined();
      expect(opts.tags.encrypt).toBe(true);
      expect(opts.tags.structuredType).toBe('COL');
    });
  });

  describe('nested encrypted fields', () => {
    test('detects nested encrypt inside type object', () => {
      const definition = {
        address: {
          type: {
            street: { type: String, encrypt: true },
            city: { type: String }
          }
        }
      };
      const result = prepareEncryptedSchema(definition);

      const opts = result._lclFieldOptions;
      expect(opts['address.street']).toBeDefined();
      expect(opts['address.street'].encrypt).toBe(true);
      expect(opts['address.street'].isNested).toBe(true);
      expect(opts['address.street'].parentPath).toBe('address');
      expect(opts['address.street'].leafField).toBe('street');

      // Encrypted option stripped from nested field
      expect(result.address.type.street).toEqual({ type: String });
      expect(result.address.type.city).toEqual({ type: String });
    });

    test('detects nested encrypt inside array element definition', () => {
      const definition = {
        items: {
          type: [{ name: String, price: { type: Number, encrypt: true } }]
        }
      };
      const result = prepareEncryptedSchema(definition);

      const opts = result._lclFieldOptions;
      expect(opts['items.price']).toBeDefined();
      expect(opts['items.price'].encrypt).toBe(true);
      expect(opts['items.price'].isNested).toBe(true);
      expect(opts['items.price'].isArrayElement).toBe(true);
      expect(opts['items.price'].parentPath).toBe('items');
      expect(opts['items.price'].leafField).toBe('price');
    });

    test('detects shorthand nested object with encrypt', () => {
      const definition = {
        profile: {
          bio: { type: String },
          secret: { type: String, encrypt: true }
        }
      };
      const result = prepareEncryptedSchema(definition);

      const opts = result._lclFieldOptions;
      expect(opts['profile.secret']).toBeDefined();
      expect(opts['profile.secret'].isNested).toBe(true);
    });
  });

  describe('_lclFieldOptions property', () => {
    test('is non-enumerable', () => {
      const definition = { phone: { type: String, encrypt: true } };
      const result = prepareEncryptedSchema(definition);

      const keys = Object.keys(result);
      expect(keys).not.toContain('_lclFieldOptions');
      expect(result._lclFieldOptions).toBeDefined();
    });

    test('does not interfere with Mongoose Schema creation', () => {
      const definition = {
        name: { type: String },
        phone: { type: String, encrypt: true, blindIndex: true }
      };
      const processed = prepareEncryptedSchema(definition);

      // Should be safe to pass to mongoose.Schema
      expect(() => new mongoose.Schema(processed)).not.toThrow();
    });
  });
});

describe('lclCryptoPlugin - resolveMode / validation', () => {
  test('plugin throws for blindIndex on whole-object field', () => {
    const { lclCryptoPlugin } = require('../../../src/plugin/lclCryptoPlugin');

    const definition = {
      address: { type: { street: String }, encrypt: true, blindIndex: true }
    };
    const processed = prepareEncryptedSchema(definition);
    const schema = new mongoose.Schema(processed);

    const mockKeyVaultService = { ensureVaultInitialized: jest.fn() };
    expect(() => {
      schema.plugin(lclCryptoPlugin, { keyVaultService: mockKeyVaultService });
    }).toThrow(/blindIndex.*not supported.*whole-object/);
  });

  test('plugin throws for ELEMENT mode on sub-document field', () => {
    const { lclCryptoPlugin } = require('../../../src/plugin/lclCryptoPlugin');

    const addressSchema = new mongoose.Schema({ street: String });
    const definition = {
      address: { type: addressSchema, encrypt: true, mode: 'ELEMENT' }
    };
    const processed = prepareEncryptedSchema(definition);
    const schema = new mongoose.Schema(processed);

    const mockKeyVaultService = { ensureVaultInitialized: jest.fn() };
    expect(() => {
      schema.plugin(lclCryptoPlugin, { keyVaultService: mockKeyVaultService });
    }).toThrow(/ELEMENT.*not supported.*sub-document/);
  });

  test('plugin throws for ELEMENT mode on sub-document array', () => {
    const { lclCryptoPlugin } = require('../../../src/plugin/lclCryptoPlugin');

    const definition = {
      items: { type: [{ sku: String }], encrypt: true, mode: 'ELEMENT' }
    };
    const processed = prepareEncryptedSchema(definition);
    const schema = new mongoose.Schema(processed);

    const mockKeyVaultService = { ensureVaultInitialized: jest.fn() };
    expect(() => {
      schema.plugin(lclCryptoPlugin, { keyVaultService: mockKeyVaultService });
    }).toThrow(/ELEMENT.*not supported.*sub-document array/);
  });

  test('plugin skips setup when no encrypted fields', () => {
    const { lclCryptoPlugin } = require('../../../src/plugin/lclCryptoPlugin');

    const schema = new mongoose.Schema({ name: String });
    const mockKeyVaultService = { ensureVaultInitialized: jest.fn() };

    // Should not throw
    schema.plugin(lclCryptoPlugin, { keyVaultService: mockKeyVaultService });
    expect(schema._lclEncryptedFields).toBeUndefined();
  });

  test('plugin registers encrypted fields correctly for scalar', () => {
    const { lclCryptoPlugin } = require('../../../src/plugin/lclCryptoPlugin');

    const definition = {
      phone: { type: String, encrypt: true, blindIndex: true }
    };
    const processed = prepareEncryptedSchema(definition);
    const schema = new mongoose.Schema(processed);

    const mockKeyVaultService = { ensureVaultInitialized: jest.fn() };
    schema.plugin(lclCryptoPlugin, { keyVaultService: mockKeyVaultService });

    expect(schema._lclEncryptedFields).toBeDefined();
    expect(schema._lclEncryptedFields.size).toBe(1);
    const phoneConfig = schema._lclEncryptedFields.get('phone');
    expect(phoneConfig.encrypt).toBe(true);
    expect(phoneConfig.blindIndex).toBe(true);
  });

  test('plugin resolves AUTO mode for scalar array to ELEMENT', () => {
    const { lclCryptoPlugin } = require('../../../src/plugin/lclCryptoPlugin');

    const definition = {
      tags: { type: [String], encrypt: true }
    };
    const processed = prepareEncryptedSchema(definition);
    const schema = new mongoose.Schema(processed);

    const mockKeyVaultService = { ensureVaultInitialized: jest.fn() };
    schema.plugin(lclCryptoPlugin, { keyVaultService: mockKeyVaultService });

    const tagsConfig = schema._lclEncryptedFields.get('tags');
    expect(tagsConfig.mode).toBe('ELEMENT');
  });

  test('plugin resolves AUTO mode for sub-doc array to WHOLE_ARRAY', () => {
    const { lclCryptoPlugin } = require('../../../src/plugin/lclCryptoPlugin');

    const definition = {
      items: { type: [{ sku: String, qty: Number }], encrypt: true }
    };
    const processed = prepareEncryptedSchema(definition);
    const schema = new mongoose.Schema(processed);

    const mockKeyVaultService = { ensureVaultInitialized: jest.fn() };
    schema.plugin(lclCryptoPlugin, { keyVaultService: mockKeyVaultService });

    const itemsConfig = schema._lclEncryptedFields.get('items');
    expect(itemsConfig.mode).toBe('WHOLE_ARRAY');
  });

  test('plugin resolves WHOLE mode for scalar array to WHOLE_ARRAY', () => {
    const { lclCryptoPlugin } = require('../../../src/plugin/lclCryptoPlugin');

    const definition = {
      tags: { type: [String], encrypt: true, mode: 'WHOLE' }
    };
    const processed = prepareEncryptedSchema(definition);
    const schema = new mongoose.Schema(processed);

    const mockKeyVaultService = { ensureVaultInitialized: jest.fn() };
    schema.plugin(lclCryptoPlugin, { keyVaultService: mockKeyVaultService });

    const tagsConfig = schema._lclEncryptedFields.get('tags');
    expect(tagsConfig.mode).toBe('WHOLE_ARRAY');
  });
});

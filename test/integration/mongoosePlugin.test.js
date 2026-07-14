'use strict';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  KeyVaultService,
  LocalCmkProvider,
  lclCryptoPlugin,
  prepareEncryptedSchema,
  CryptoCodec,
  TypeSerializer
} = require('../../src');

describe('Integration: Mongoose Plugin + KeyVault + Field Encryption', () => {
  let mongoServer;
  let connection;
  let keyVaultService;
  let UserModel;
  const TEST_CMK_HEX = 'a'.repeat(64);  // 32-byte CMK as hex

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    connection = await mongoose.createConnection(uri).asPromise();

    const cmkProvider = new LocalCmkProvider(TEST_CMK_HEX);
    keyVaultService = new KeyVaultService({
      connection,
      cmkProvider,
      cacheTtl: 60000
    });

    const userSchema = new mongoose.Schema(prepareEncryptedSchema({
      name: String,
      phone: { type: String, encrypt: true, blindIndex: true },
      ssn: { type: String, encrypt: true },
      age: { type: Number, encrypt: true },
      balance: { type: Number, encrypt: true },
      active: { type: Boolean, encrypt: true },
      birthDate: { type: Date, encrypt: true }
    }));

    userSchema.plugin(lclCryptoPlugin, {
      keyVaultService,
      entityName: 'User',
      algorithm: 'AES_256_GCM'
    });

    UserModel = connection.model('User', userSchema);
  });

  afterAll(async () => {
    keyVaultService.flushCache();
    await connection.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await UserModel.deleteMany({});
  });

  describe('Save + Find Round-Trip', () => {
    test('encrypts strings on save, decrypts on find', async () => {
      const user = new UserModel({
        name: 'Alice',
        phone: '13800138000',
        ssn: '123-45-6789'
      });
      await user.save();

      // Verify encrypted sub-document structure in database
      const rawDoc = await UserModel.collection.findOne({ _id: user._id });
      expect(rawDoc.phone).toHaveProperty('_e', 1);
      expect(rawDoc.phone).toHaveProperty('_k');
      expect(rawDoc.phone).toHaveProperty('_a', 'AES_256_GCM');
      expect(rawDoc.phone).toHaveProperty('_t', 'STR');
      expect(rawDoc.phone).toHaveProperty('c');
      expect(rawDoc.phone).toHaveProperty('b');  // blind index enabled

      expect(rawDoc.ssn).toHaveProperty('_e', 1);
      expect(rawDoc.ssn).not.toHaveProperty('b');  // blind index disabled

      // Decrypt on find
      const found = await UserModel.findOne({ _id: user._id });
      expect(found.phone).toBe('13800138000');
      expect(found.ssn).toBe('123-45-6789');
      expect(found.name).toBe('Alice');
    });

    test('encrypts number fields', async () => {
      const user = new UserModel({
        name: 'Bob',
        age: 35,
        balance: 12345.67
      });
      await user.save();

      const found = await UserModel.findOne({ _id: user._id });
      expect(found.age).toBe(35);
      expect(found.balance).toBeCloseTo(12345.67, 2);
    });

    test('encrypts boolean fields', async () => {
      const user = new UserModel({
        name: 'Charlie',
        active: true
      });
      await user.save();

      const found = await UserModel.findOne({ _id: user._id });
      expect(found.active).toBe(true);
    });

    test('encrypts date fields', async () => {
      const birthDate = new Date('1990-05-15T10:30:00.000Z');
      const user = new UserModel({
        name: 'Dave',
        birthDate
      });
      await user.save();

      const found = await UserModel.findOne({ _id: user._id });
      // Date comparison: seconds precision (ms truncated in LocalDateTime)
      expect(found.birthDate.toISOString()).toMatch(/^1990-05-15T10:30:00/);
    });

    test('handles null/undefined encrypted fields', async () => {
      const user = new UserModel({
        name: 'Eve'
        // phone, ssn, etc. are null
      });
      await user.save();

      const found = await UserModel.findOne({ _id: user._id });
      expect(found.phone).toBeUndefined();
      expect(found.ssn).toBeUndefined();
      expect(found.name).toBe('Eve');
    });
  });

  describe('Blind Index Queries', () => {
    test('finds by encrypted field using blind index', async () => {
      await new UserModel({ name: 'Alice', phone: '13800138000' }).save();
      await new UserModel({ name: 'Bob', phone: '13900139000' }).save();

      // Query rewriting: { phone: "..." } → { "phone.b": "<blind-index>" }
      const found = await UserModel.findOne({ phone: '13800138000' });
      expect(found).not.toBeNull();
      expect(found.name).toBe('Alice');
    });

    test('finds multiple documents with blind index', async () => {
      await new UserModel({ name: 'Alice', phone: '13800138000' }).save();
      await new UserModel({ name: 'Alice2', phone: '13800138000' }).save();
      await new UserModel({ name: 'Bob', phone: '13900139000' }).save();

      const found = await UserModel.find({ phone: '13800138000' });
      expect(found).toHaveLength(2);
      expect(found.every(u => u.phone === '13800138000')).toBe(true);
    });

    test('blind index is deterministic', async () => {
      await new UserModel({ name: 'Alice', phone: '13800138000' }).save();

      const raw1 = await UserModel.collection.findOne({});
      const blindIndex1 = raw1.phone.b;

      await UserModel.deleteMany({});
      await new UserModel({ name: 'Bob', phone: '13800138000' }).save();

      const raw2 = await UserModel.collection.findOne({});
      const blindIndex2 = raw2.phone.b;

      // Same phone number → same blind index (deterministic)
      expect(blindIndex1).toBe(blindIndex2);
    });
  });

  describe('Key Rotation', () => {
    test('rotates DEK and maintains backward compatibility', async () => {
      // Save with original DEK
      const user1 = new UserModel({ name: 'Alice', phone: '13800138000' });
      await user1.save();

      // Rotate DEK
      await keyVaultService.rotateDek('User');
      keyVaultService.flushCache();

      // Save new document with new DEK
      const user2 = new UserModel({ name: 'Bob', phone: '13900139000' });
      await user2.save();

      // Both documents should decrypt correctly (backward compatibility)
      const found1 = await UserModel.findOne({ name: 'Alice' });
      expect(found1.phone).toBe('13800138000');

      const found2 = await UserModel.findOne({ name: 'Bob' });
      expect(found2.phone).toBe('13900139000');
    });
  });

  describe('Multiple Algorithms', () => {
    test('supports AES-256-CBC', async () => {
      const schema = new mongoose.Schema(prepareEncryptedSchema({
        name: String,
        secret: { type: String, encrypt: true }
      }));

      schema.plugin(lclCryptoPlugin, {
        keyVaultService,
        entityName: 'SecretCBC',
        algorithm: 'AES_256_CBC'
      });

      const SecretModel = connection.model('SecretCBC', schema);

      const doc = new SecretModel({ name: 'Test', secret: 'my-secret-value' });
      await doc.save();

      const raw = await SecretModel.collection.findOne({ _id: doc._id });
      expect(raw.secret._a).toBe('AES_256_CBC');

      const found = await SecretModel.findOne({ _id: doc._id });
      expect(found.secret).toBe('my-secret-value');
    });

    test('supports SM4-CBC', async () => {
      const schema = new mongoose.Schema(prepareEncryptedSchema({
        name: String,
        secret: { type: String, encrypt: true }
      }));

      schema.plugin(lclCryptoPlugin, {
        keyVaultService,
        entityName: 'SecretSM4',
        algorithm: 'SM4_CBC'
      });

      const SecretModel = connection.model('SecretSM4', schema);

      const doc = new SecretModel({ name: 'Test', secret: '中国加密' });
      await doc.save();

      const raw = await SecretModel.collection.findOne({ _id: doc._id });
      expect(raw.secret._a).toBe('SM4_CBC');

      const found = await SecretModel.findOne({ _id: doc._id });
      expect(found.secret).toBe('中国加密');
    });
  });

  describe('Type Preservation', () => {
    test('preserves number type through encrypt/decrypt cycle', async () => {
      const user = new UserModel({ name: 'Test', age: 42 });
      await user.save();

      const raw = await UserModel.collection.findOne({ _id: user._id });
      expect(raw.age._t).toBe('INT');

      const found = await UserModel.findOne({ _id: user._id });
      expect(typeof found.age).toBe('number');
      expect(found.age).toBe(42);
    });

    test('preserves boolean type through encrypt/decrypt cycle', async () => {
      const user = new UserModel({ name: 'Test', active: false });
      await user.save();

      const raw = await UserModel.collection.findOne({ _id: user._id });
      expect(raw.active._t).toBe('BOOL');

      const found = await UserModel.findOne({ _id: user._id });
      expect(typeof found.active).toBe('boolean');
      expect(found.active).toBe(false);
    });
  });

  describe('Structured Type Encryption — DOC (Whole-Object)', () => {
    let DocModel;

    beforeAll(() => {
      const addressSchema = new mongoose.Schema({
        street: String,
        city: String
      });

      const docSchema = new mongoose.Schema(prepareEncryptedSchema({
        name: String,
        address: { type: addressSchema, encrypt: true },
        profile: { type: { bio: String, website: String }, encrypt: true }
      }));

      docSchema.plugin(lclCryptoPlugin, {
        keyVaultService,
        entityName: 'DocEntity',
        algorithm: 'AES_256_GCM'
      });

      DocModel = connection.model('DocEntity', docSchema);
    });

    test('save and findOne round-trip for sub-document Schema instance (DOC)', async () => {
      const doc = new DocModel({
        name: 'Alice',
        address: { street: '123 Main', city: 'Shanghai' }
      });
      await doc.save();

      // Verify encrypted sub-document structure in database
      const rawDoc = await DocModel.collection.findOne({ _id: doc._id });
      expect(rawDoc.address).toHaveProperty('_e', 1);
      expect(rawDoc.address).toHaveProperty('_t', 'DOC');
      expect(rawDoc.address).not.toHaveProperty('b');

      // Decrypt on find
      const found = await DocModel.findOne({ _id: doc._id });
      expect(found.address).toEqual({ street: '123 Main', city: 'Shanghai' });
      expect(found.name).toBe('Alice');
    });

    test('save and findOne round-trip for nested object definition (DOC)', async () => {
      const doc = new DocModel({
        name: 'Bob',
        profile: { bio: 'Developer', website: 'https://example.com' }
      });
      await doc.save();

      const rawDoc = await DocModel.collection.findOne({ _id: doc._id });
      expect(rawDoc.profile).toHaveProperty('_e', 1);
      expect(rawDoc.profile).toHaveProperty('_t', 'DOC');

      const found = await DocModel.findOne({ _id: doc._id });
      expect(found.profile).toEqual({ bio: 'Developer', website: 'https://example.com' });
    });

    test('blindIndex: true on DOC field throws configuration error', () => {
      expect(() => {
        const schema = new mongoose.Schema(prepareEncryptedSchema({
          name: String,
          address: { type: { street: String }, encrypt: true, blindIndex: true }
        }));
        schema.plugin(lclCryptoPlugin, {
          keyVaultService,
          entityName: 'BadDoc'
        });
      }).toThrow(/blindIndex.*not supported/);
    });

    test('mode ELEMENT on DOC field throws configuration error', () => {
      expect(() => {
        const schema = new mongoose.Schema(prepareEncryptedSchema({
          name: String,
          address: { type: { street: String }, encrypt: true, mode: 'ELEMENT' }
        }));
        schema.plugin(lclCryptoPlugin, {
          keyVaultService,
          entityName: 'BadDocMode'
        });
      }).toThrow(/ELEMENT.*not supported/);
    });
  });

  describe('Structured Type Encryption — COL (Whole-Array) and Element-Level', () => {
    let ArrayModel;

    beforeAll(() => {
      const itemSchema = new mongoose.Schema({ sku: String, qty: Number });

      const arraySchema = new mongoose.Schema(prepareEncryptedSchema({
        name: String,
        tags: { type: [String], encrypt: true },
        wholeTags: { type: [String], encrypt: true, mode: 'WHOLE' },
        items: { type: [itemSchema], encrypt: true }
      }));

      arraySchema.plugin(lclCryptoPlugin, {
        keyVaultService,
        entityName: 'ArrayEntity',
        algorithm: 'AES_256_GCM'
      });

      ArrayModel = connection.model('ArrayEntity', arraySchema);
    });

    test('element-level encryption of [String] array (AUTO mode)', async () => {
      const doc = new ArrayModel({
        name: 'Alice',
        tags: ['node', 'mongodb', 'encryption']
      });
      await doc.save();

      // Verify each element is encrypted independently
      const rawDoc = await ArrayModel.collection.findOne({ _id: doc._id });
      expect(Array.isArray(rawDoc.tags)).toBe(true);
      expect(rawDoc.tags).toHaveLength(3);
      for (const elem of rawDoc.tags) {
        expect(elem).toHaveProperty('_e', 1);
        expect(elem).toHaveProperty('_t', 'STR');
        expect(elem).not.toHaveProperty('b');
      }

      // Decrypt on find
      const found = await ArrayModel.findOne({ _id: doc._id });
      expect(found.tags).toEqual(['node', 'mongodb', 'encryption']);
    });

    test('whole-array COL encryption of [String] with mode: WHOLE', async () => {
      const doc = new ArrayModel({
        name: 'Bob',
        wholeTags: ['tag1', 'tag2']
      });
      await doc.save();

      // Verify the entire array is encrypted as one COL sub-document
      const rawDoc = await ArrayModel.collection.findOne({ _id: doc._id });
      expect(rawDoc.wholeTags).toHaveProperty('_e', 1);
      expect(rawDoc.wholeTags).toHaveProperty('_t', 'COL');
      expect(rawDoc.wholeTags).not.toHaveProperty('b');

      // Decrypt on find
      const found = await ArrayModel.findOne({ _id: doc._id });
      expect(found.wholeTags).toEqual(['tag1', 'tag2']);
    });

    test('whole-array COL encryption of [Schema] array (AUTO)', async () => {
      const doc = new ArrayModel({
        name: 'Charlie',
        items: [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 2 }]
      });
      await doc.save();

      // Verify the entire array is encrypted as one COL sub-document
      const rawDoc = await ArrayModel.collection.findOne({ _id: doc._id });
      expect(rawDoc.items).toHaveProperty('_e', 1);
      expect(rawDoc.items).toHaveProperty('_t', 'COL');

      // Decrypt on find
      const found = await ArrayModel.findOne({ _id: doc._id });
      expect(found.items).toEqual([{ sku: 'A', qty: 1 }, { sku: 'B', qty: 2 }]);
    });

    test('mode ELEMENT on sub-doc array throws configuration error', () => {
      expect(() => {
        const itemSchema = new mongoose.Schema({ sku: String });
        const schema = new mongoose.Schema(prepareEncryptedSchema({
          name: String,
          items: { type: [itemSchema], encrypt: true, mode: 'ELEMENT' }
        }));
        schema.plugin(lclCryptoPlugin, {
          keyVaultService,
          entityName: 'BadArrayMode'
        });
      }).toThrow(/ELEMENT.*not supported/);
    });

    test('blindIndex: true on COL WHOLE mode throws configuration error', () => {
      expect(() => {
        const schema = new mongoose.Schema(prepareEncryptedSchema({
          name: String,
          wholeTags: { type: [String], encrypt: true, mode: 'WHOLE', blindIndex: true }
        }));
        schema.plugin(lclCryptoPlugin, {
          keyVaultService,
          entityName: 'BadColBlindIndex'
        });
      }).toThrow(/blindIndex.*not supported/);
    });
  });

  describe('Nested Path Encryption', () => {
    let NestedModel;

    beforeAll(() => {
      const nestedSchema = new mongoose.Schema(prepareEncryptedSchema({
        name: String,
        address: {
          street: { type: String, encrypt: true },
          city: String
        },
        items: [{
          sku: String,
          price: { type: Number, encrypt: true }
        }]
      }));

      nestedSchema.plugin(lclCryptoPlugin, {
        keyVaultService,
        entityName: 'NestedEntity',
        algorithm: 'AES_256_GCM'
      });

      NestedModel = connection.model('NestedEntity', nestedSchema);
    });

    test('nested encrypted field inside sub-document — only street encrypted, city visible', async () => {
      const doc = new NestedModel({
        name: 'Alice',
        address: { street: '123 Main St', city: 'Shanghai' }
      });
      await doc.save();

      // Verify only street is encrypted, city is visible
      const rawDoc = await NestedModel.collection.findOne({ _id: doc._id });
      expect(rawDoc.address).toBeDefined();
      expect(rawDoc.address.street).toHaveProperty('_e', 1);
      expect(rawDoc.address.street).toHaveProperty('_t', 'STR');
      expect(rawDoc.address.city).toBe('Shanghai');

      // Decrypt on find
      const found = await NestedModel.findOne({ _id: doc._id });
      expect(found.address.street).toBe('123 Main St');
      expect(found.address.city).toBe('Shanghai');
    });

    test('encrypted field inside array of sub-documents — items[].price encrypted per-element', async () => {
      const doc = new NestedModel({
        name: 'Bob',
        items: [
          { sku: 'A', price: 100 },
          { sku: 'B', price: 200 }
        ]
      });
      await doc.save();

      // Verify each price is encrypted, sku is visible
      const rawDoc = await NestedModel.collection.findOne({ _id: doc._id });
      expect(Array.isArray(rawDoc.items)).toBe(true);
      expect(rawDoc.items).toHaveLength(2);
      expect(rawDoc.items[0].sku).toBe('A');
      expect(rawDoc.items[0].price).toHaveProperty('_e', 1);
      expect(rawDoc.items[0].price).toHaveProperty('_t', 'INT');
      expect(rawDoc.items[1].sku).toBe('B');
      expect(rawDoc.items[1].price).toHaveProperty('_e', 1);

      // Decrypt on find
      const found = await NestedModel.findOne({ _id: doc._id });
      expect(found.items).toHaveLength(2);
      expect(found.items[0].sku).toBe('A');
      expect(found.items[0].price).toBe(100);
      expect(found.items[1].sku).toBe('B');
      expect(found.items[1].price).toBe(200);
    });
  });
});

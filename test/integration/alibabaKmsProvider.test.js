'use strict';

/**
 * Integration test: AlibabaKmsProvider + Mongoose Plugin
 *
 * Based on examples/alibaba-kms.js
 *
 * Required environment variables:
 *   ALIBABA_CLOUD_ACCESS_KEY_ID
 *   ALIBABA_CLOUD_ACCESS_KEY_SECRET
 *   LCL_ALIBABA_KMS_KEY_ID
 *   LCL_ALIBABA_KMS_REGION       (default: cn-hangzhou)
 *   LCL_ALIBABA_KMS_ENDPOINT     (default: kms.cn-hangzhou.aliyuncs.com)
 *   LCL_ALIBABA_KMS_KEY_TYPE     (symmetric | asymmetric, default: asymmetric)
 *
 * Optional:
 *   LCL_ALIBABA_KMS_CMK_VERSION      (auto-resolved if omitted)
 *   LCL_ALIBABA_KMS_PUBLIC_KEY_PEM   (auto-resolved if omitted for asymmetric)
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  AlibabaKmsProvider,
  KeyVaultService,
  lclCryptoPlugin,
  prepareEncryptedSchema
} = require('../../src');

const HAS_ALIBABA_CREDS =
  process.env.ALIBABA_CLOUD_ACCESS_KEY_ID &&
  process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET &&
  process.env.LCL_ALIBABA_KMS_KEY_ID;

const describeOrSkip = HAS_ALIBABA_CREDS ? describe : describe.skip;

describeOrSkip('Integration: AlibabaKmsProvider + Mongoose Plugin', () => {
  let mongoServer;
  let connection;
  let keyVaultService;
  let provider;

  const keyType = process.env.LCL_ALIBABA_KMS_KEY_TYPE || 'asymmetric';
  const region = process.env.LCL_ALIBABA_KMS_REGION || 'cn-hangzhou';
  const endpoint = process.env.LCL_ALIBABA_KMS_ENDPOINT || 'kms.cn-hangzhou.aliyuncs.com';

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    connection = await mongoose.createConnection(uri).asPromise();

    provider = new AlibabaKmsProvider({
      keyId: process.env.LCL_ALIBABA_KMS_KEY_ID,
      keyType,
      cmkVersion: process.env.LCL_ALIBABA_KMS_CMK_VERSION || null,
      region,
      endpoint,
      accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
      accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
      publicKeyPem: process.env.LCL_ALIBABA_KMS_PUBLIC_KEY_PEM || null,
      asymmetricAlgorithm: 'RSAES_OAEP_SHA_256'
    });

    console.log(`\n  Alibaba KMS: keyType=${keyType}, region=${region}, keyId=${process.env.LCL_ALIBABA_KMS_KEY_ID}`);

    keyVaultService = new KeyVaultService({
      connection,
      cmkProvider: provider,
      cacheTtl: 60000
    });
  });

  afterAll(async () => {
    if (keyVaultService) keyVaultService.flushCache();
    if (connection) await connection.close();
    if (mongoServer) await mongoServer.stop();
  });

  describe('Provider metadata', () => {
    test('getProviderId returns alibaba-kms', () => {
      expect(provider.getProviderId()).toBe('alibaba-kms');
    });

    test('getPublicReference returns keyId', () => {
      expect(provider.getPublicReference()).toBe(process.env.LCL_ALIBABA_KMS_KEY_ID);
    });
  });

  describe('Wrap + Unwrap round-trip', () => {
    const crypto = require('crypto');

    test('wraps and unwraps a 32-byte key', async () => {
      const plaintextKey = crypto.randomBytes(32);
      const wrapped = await provider.wrap(plaintextKey);

      expect(wrapped.ciphertext).toBeInstanceOf(Buffer);
      expect(wrapped.ciphertext.length).toBeGreaterThan(0);
      expect(wrapped.metadata).toHaveProperty('keyId', process.env.LCL_ALIBABA_KMS_KEY_ID);
      expect(wrapped.metadata).toHaveProperty('keyType', keyType);
      expect(wrapped.metadata).toHaveProperty('cmkVersion');
      console.log(`  wrap: algorithm=${wrapped.algorithm}, cmkVersion=${wrapped.metadata.cmkVersion}, localWrap=${wrapped.metadata.localWrap}`);

      const unwrapped = await provider.unwrap(wrapped);
      expect(unwrapped).toEqual(plaintextKey);
    }, 30000);
  });

  if (keyType === 'asymmetric') {
    describe('Auto-resolution (asymmetric only)', () => {
      test('auto-resolves cmkVersion when not configured', async () => {
        const autoProvider = new AlibabaKmsProvider({
          keyId: process.env.LCL_ALIBABA_KMS_KEY_ID,
          keyType: 'asymmetric',
          region,
          endpoint,
          accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
          accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
          asymmetricAlgorithm: 'RSAES_OAEP_SHA_256'
          // cmkVersion and publicKeyPem intentionally omitted
        });

        // Before wrap, cmkVersion should be null
        expect(autoProvider.getCmkVersion()).toBeNull();

        const crypto = require('crypto');
        const wrapped = await autoProvider.wrap(crypto.randomBytes(32));

        // cmkVersion resolved on provider via ListKeyVersions
        expect(autoProvider.getCmkVersion()).toBeTruthy();
        expect(wrapped.metadata.cmkVersion).toBeTruthy();
        console.log(`  auto-resolved cmkVersion: ${autoProvider.getCmkVersion()}`);

        // Unwrap should work
        const unwrapped = await autoProvider.unwrap(wrapped);
        expect(unwrapped).toBeInstanceOf(Buffer);
        expect(unwrapped.length).toBe(32);
      }, 30000);

      test('auto-resolves publicKeyPem for local wrap', async () => {
        const autoProvider = new AlibabaKmsProvider({
          keyId: process.env.LCL_ALIBABA_KMS_KEY_ID,
          keyType: 'asymmetric',
          cmkVersion: process.env.LCL_ALIBABA_KMS_CMK_VERSION || null,
          region,
          endpoint,
          accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
          accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
          asymmetricAlgorithm: 'RSAES_OAEP_SHA_256'
          // publicKeyPem intentionally omitted
        });

        const crypto = require('crypto');
        const wrapped = await autoProvider.wrap(crypto.randomBytes(32));

        // Should be local wrap after auto-resolution
        expect(wrapped.metadata.localWrap).toBe(true);
        console.log(`  auto-resolved publicKeyPem: ${wrapped.metadata.localWrap ? 'local wrap used' : 'remote wrap'}`);
      }, 30000);
    });
  }

  describe('Mongoose Plugin integration', () => {
    let UserModel;
    const algorithm = keyType === 'symmetric' ? 'SM4_CBC' : 'AES_256_GCM';

    beforeAll(() => {
      const userSchema = new mongoose.Schema(prepareEncryptedSchema({
        name: String,
        phone: { type: String, encrypt: true, blindIndex: true },
        ssn: { type: String, encrypt: true }
      }));

      userSchema.plugin(lclCryptoPlugin, {
        keyVaultService,
        entityName: 'User',
        algorithm
      });

      UserModel = connection.model('User', userSchema);
    });

    beforeEach(async () => {
      await UserModel.deleteMany({});
    });

    test('saves and retrieves encrypted data', async () => {
      const user = new UserModel({
        name: 'Alice',
        phone: '13800138000',
        ssn: '123-45-6789'
      });
      await user.save();

      // Verify raw document has encrypted structure
      const raw = await UserModel.collection.findOne({ _id: user._id });
      expect(raw.phone).toHaveProperty('_e', 1);
      expect(raw.phone).toHaveProperty('_a', algorithm);
      expect(raw.phone).toHaveProperty('b'); // blind index
      expect(raw.ssn).toHaveProperty('_e', 1);
      expect(raw.ssn).not.toHaveProperty('b'); // no blind index

      // Retrieve and decrypt
      const found = await UserModel.findOne({ _id: user._id });
      expect(found.name).toBe('Alice');
      expect(found.phone).toBe('13800138000');
      expect(found.ssn).toBe('123-45-6789');

      console.log(`  Mongoose round-trip OK: algorithm=${algorithm}`);
    }, 60000);

    test('blind index query on encrypted field', async () => {
      await new UserModel({ name: 'Alice', phone: '13800138000' }).save();
      await new UserModel({ name: 'Bob', phone: '13900139000' }).save();

      const found = await UserModel.findOne({ phone: '13800138000' });
      expect(found).not.toBeNull();
      expect(found.name).toBe('Alice');
      expect(found.phone).toBe('13800138000');
    }, 60000);

    test('handles null encrypted fields', async () => {
      const user = new UserModel({ name: 'Eve' });
      await user.save();

      const found = await UserModel.findOne({ _id: user._id });
      expect(found.name).toBe('Eve');
      expect(found.phone).toBeUndefined();
      expect(found.ssn).toBeUndefined();
    }, 30000);

    test('key rotation with backward compatibility', async () => {
      // Save with original DEK
      const user1 = new UserModel({ name: 'Alice', phone: '13800138000' });
      await user1.save();

      // Rotate DEK
      await keyVaultService.rotateDek('User');
      keyVaultService.flushCache();

      // Save with new DEK
      const user2 = new UserModel({ name: 'Bob', phone: '13900139000' });
      await user2.save();

      // Both should decrypt correctly
      const found1 = await UserModel.findOne({ name: 'Alice' });
      expect(found1.phone).toBe('13800138000');

      const found2 = await UserModel.findOne({ name: 'Bob' });
      expect(found2.phone).toBe('13900139000');

      console.log('  Key rotation: both v1 and v2 decrypt OK');
    }, 90000);
  });
});

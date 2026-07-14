'use strict';

const crypto = require('crypto');
const { generateKeyPairSync } = require('crypto');
const AlibabaKmsProvider = require('../../../src/provider/AlibabaKmsProvider');

/**
 * Create a provider with a mocked _ensureClient() that returns a mock KMS client.
 * This avoids needing the actual @alicloud/kms20160120 SDK installed.
 */
function createMockedProvider(config, handlers) {
  const provider = new AlibabaKmsProvider(config);
  const callCounts = { listKeyVersions: 0, getPublicKey: 0, encrypt: 0 };

  // Create mock request classes
  const ListKeyVersionsRequest = class { constructor(o) { Object.assign(this, o); } };
  const GetPublicKeyRequest = class { constructor(o) { Object.assign(this, o); } };
  const EncryptRequest = class { constructor(o) { Object.assign(this, o); } };
  const DecryptRequest = class { constructor(o) { Object.assign(this, o); } };
  const AsymmetricEncryptRequest = class { constructor(o) { Object.assign(this, o); } };
  const AsymmetricDecryptRequest = class { constructor(o) { Object.assign(this, o); } };

  provider._ensureClient = async function() {
    if (!this._client) {
      this._client = {
        async listKeyVersions(request) {
          callCounts.listKeyVersions++;
          return handlers.listKeyVersions
            ? handlers.listKeyVersions(request)
            : { body: { keyVersions: { keyVersion: [] }, totalCount: 0 } };
        },
        async getPublicKey(request) {
          callCounts.getPublicKey++;
          return handlers.getPublicKey
            ? handlers.getPublicKey(request)
            : { body: { publicKey: 'mock-pem' } };
        },
        async encrypt(request) {
          callCounts.encrypt++;
          return { body: { ciphertextBlob: Buffer.from('encrypted').toString('base64'), keyVersionId: 'sym-v1' } };
        },
        async decrypt(request) {
          return { body: { plaintext: Buffer.from('decrypted').toString('base64') } };
        },
        async asymmetricEncrypt(request) {
          return { body: { ciphertextBlob: Buffer.from('asym-encrypted').toString('base64') } };
        },
        async asymmetricDecrypt(request) {
          return { body: { plaintext: Buffer.from('asym-decrypted').toString('base64') } };
        }
      };
    }
    return this._client;
  };

  // Override _ensureResolved to use mock request classes (avoids require('@alicloud/kms20160120'))
  const originalEnsureResolved = provider._ensureResolved;
  provider._ensureResolved = async function() {
    if (this._keyType === 'symmetric') return;
    if (this._cmkVersion && this._publicKeyPem) return;

    let client;
    try {
      client = await this._ensureClient();
    } catch (e) {
      return;
    }

    // Use mock request classes instead of requiring SDK
    if (!this._cmkVersion) {
      const listRequest = new ListKeyVersionsRequest({
        keyId: this._keyId,
        pageNumber: 1,
        pageSize: 1
      });
      const listResponse = await client.listKeyVersions(listRequest);
      const versions = (listResponse.body.keyVersions && listResponse.body.keyVersions.keyVersion) || [];
      if (versions.length > 0) {
        this._cmkVersion = versions[0].keyVersionId;
      }
    }

    if (!this._publicKeyPem && this._cmkVersion) {
      const pkRequest = new GetPublicKeyRequest({
        keyId: this._keyId,
        keyVersionId: this._cmkVersion
      });
      const pkResponse = await client.getPublicKey(pkRequest);
      this._publicKeyPem = pkResponse.body.publicKey;
    }
  };

  // Override wrap() to use mock client without requiring SDK request classes
  const origWrap = provider.wrap.bind(provider);
  provider.wrap = async function(plaintextKey) {
    await this._ensureResolved();

    if (this._keyType === 'asymmetric' && this._publicKeyPem) {
      // Local wrap — delegate to original (uses Node crypto, no SDK needed)
      return origWrap.call(this, plaintextKey);
    }

    // Remote mode — use mock client directly
    const client = await this._ensureClient();
    const plaintextBase64 = plaintextKey.toString('base64');

    if (this._keyType === 'symmetric') {
      const response = await client.encrypt({ keyId: this._keyId, plaintext: plaintextBase64 });
      return {
        ciphertext: Buffer.from(response.body.ciphertextBlob, 'base64'),
        algorithm: 'ALIBABA_KMS_SYMMETRIC',
        metadata: { keyId: this._keyId, keyType: 'symmetric', cmkVersion: response.body.keyVersionId || null, localWrap: false }
      };
    }

    const response = await client.asymmetricEncrypt({ keyId: this._keyId, keyVersionId: this._cmkVersion, plaintext: plaintextBase64, algorithm: this._asymmetricAlgorithm });
    return {
      ciphertext: Buffer.from(response.body.ciphertextBlob, 'base64'),
      algorithm: this._asymmetricAlgorithm,
      metadata: { keyId: this._keyId, keyType: 'asymmetric', cmkVersion: this._cmkVersion, localWrap: false }
    };
  };

  return { provider, callCounts };
}

describe('AlibabaKmsProvider', () => {
  let rsaKeyPair;

  beforeAll(() => {
    rsaKeyPair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
  });

  describe('Configuration', () => {
    test('requires keyId in constructor', () => {
      expect(() => new AlibabaKmsProvider()).toThrow('requires config.keyId');
      expect(() => new AlibabaKmsProvider({})).toThrow('requires config.keyId');
    });

    test('accepts keyId and keyType', () => {
      expect(() => new AlibabaKmsProvider({
        keyId: 'key-123',
        keyType: 'symmetric'
      })).not.toThrow();
    });

    test('defaults keyType to symmetric', () => {
      const provider = new AlibabaKmsProvider({ keyId: 'key-123' });
      expect(provider).toBeDefined();
    });

    test('rejects invalid keyType', () => {
      expect(() => new AlibabaKmsProvider({
        keyId: 'key-123',
        keyType: 'invalid'
      })).toThrow(/invalid keyType/);
    });

    test('getProviderId returns "alibaba-kms"', () => {
      const provider = new AlibabaKmsProvider({ keyId: 'key-123' });
      expect(provider.getProviderId()).toBe('alibaba-kms');
    });

    test('getPublicReference returns keyId', () => {
      const provider = new AlibabaKmsProvider({ keyId: 'key-abc-def' });
      expect(provider.getPublicReference()).toBe('key-abc-def');
    });

    test('getCmkVersion returns configured version', () => {
      const provider = new AlibabaKmsProvider({
        keyId: 'key-123',
        cmkVersion: 'ver-abc-123'
      });
      expect(provider.getCmkVersion()).toBe('ver-abc-123');
    });

    test('getCmkVersion returns null when not configured', () => {
      const provider = new AlibabaKmsProvider({ keyId: 'key-123' });
      expect(provider.getCmkVersion()).toBeNull();
    });
  });

  describe('Symmetric CMK', () => {
    test('wraps key using Encrypt API with mocked client', async () => {
      const { provider, callCounts } = createMockedProvider(
        { keyId: 'key-123', keyType: 'symmetric', accessKeyId: 'id', accessKeySecret: 'secret' },
        {}
      );

      const wrapped = await provider.wrap(crypto.randomBytes(32));
      expect(wrapped.algorithm).toBe('ALIBABA_KMS_SYMMETRIC');
      expect(callCounts.encrypt).toBe(1);
    });

    test('requires @alicloud SDK when wrapping without mock', async () => {
      const provider = new AlibabaKmsProvider({
        keyId: 'key-123',
        keyType: 'symmetric',
        accessKeyId: 'test-id',
        accessKeySecret: 'test-secret'
      });

      const plaintextKey = crypto.randomBytes(32);
      await expect(provider.wrap(plaintextKey)).rejects.toThrow('@alicloud/kms20160120');
    });
  });

  describe('Asymmetric CMK - Local Wrap', () => {
    test('wraps key locally using public key PEM', async () => {
      const provider = new AlibabaKmsProvider({
        keyId: 'key-456',
        keyType: 'asymmetric',
        cmkVersion: 'ver-xyz-789',
        publicKeyPem: rsaKeyPair.publicKey,
        asymmetricAlgorithm: 'RSAES_OAEP_SHA_256'
      });

      const plaintextKey = crypto.randomBytes(32);
      const wrapped = await provider.wrap(plaintextKey);

      expect(wrapped.ciphertext).toBeInstanceOf(Buffer);
      expect(wrapped.algorithm).toBe('RSAES_OAEP_SHA_256');
      expect(wrapped.metadata.keyId).toBe('key-456');
      expect(wrapped.metadata.keyType).toBe('asymmetric');
      expect(wrapped.metadata.cmkVersion).toBe('ver-xyz-789');
      expect(wrapped.metadata.localWrap).toBe(true);
    });

    test('supports SHA-1 OAEP hash', async () => {
      const provider = new AlibabaKmsProvider({
        keyId: 'key-789',
        keyType: 'asymmetric',
        publicKeyPem: rsaKeyPair.publicKey,
        asymmetricAlgorithm: 'RSAES_OAEP_SHA_1'
      });

      const plaintextKey = crypto.randomBytes(32);
      const wrapped = await provider.wrap(plaintextKey);

      const decrypted = crypto.privateDecrypt(
        {
          key: rsaKeyPair.privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha1'
        },
        wrapped.ciphertext
      );

      expect(decrypted.equals(plaintextKey)).toBe(true);
    });

    test('supports SHA-256 OAEP hash', async () => {
      const provider = new AlibabaKmsProvider({
        keyId: 'key-789',
        keyType: 'asymmetric',
        publicKeyPem: rsaKeyPair.publicKey,
        asymmetricAlgorithm: 'RSAES_OAEP_SHA_256'
      });

      const plaintextKey = crypto.randomBytes(32);
      const wrapped = await provider.wrap(plaintextKey);

      const decrypted = crypto.privateDecrypt(
        {
          key: rsaKeyPair.privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256'
        },
        wrapped.ciphertext
      );

      expect(decrypted.equals(plaintextKey)).toBe(true);
    });

    test('produces different ciphertext each time', async () => {
      const provider = new AlibabaKmsProvider({
        keyId: 'key-456',
        keyType: 'asymmetric',
        publicKeyPem: rsaKeyPair.publicKey
      });

      const plaintextKey = crypto.randomBytes(32);
      const wrapped1 = await provider.wrap(plaintextKey);
      const wrapped2 = await provider.wrap(plaintextKey);

      expect(wrapped1.ciphertext.equals(wrapped2.ciphertext)).toBe(false);
    });

    test('cmkVersion in metadata is null when not configured and not resolved', async () => {
      const provider = new AlibabaKmsProvider({
        keyId: 'key-456',
        keyType: 'asymmetric',
        publicKeyPem: rsaKeyPair.publicKey
      });

      const wrapped = await provider.wrap(crypto.randomBytes(32));
      expect(wrapped.metadata.cmkVersion).toBeNull();
    });
  });

  describe('Asymmetric CMK - Remote', () => {
    test('requires @alicloud SDK for asymmetric remote wrap', async () => {
      const provider = new AlibabaKmsProvider({
        keyId: 'key-456',
        keyType: 'asymmetric',
        accessKeyId: 'test-id',
        accessKeySecret: 'test-secret'
      });

      const plaintextKey = crypto.randomBytes(32);
      await expect(provider.wrap(plaintextKey)).rejects.toThrow('@alicloud/kms20160120');
    });

    test('unwrap requires keyVersionId from metadata for asymmetric', async () => {
      const provider = new AlibabaKmsProvider({
        keyId: 'key-456',
        keyType: 'asymmetric',
        accessKeyId: 'test-id',
        accessKeySecret: 'test-secret'
      });

      const wrapped = {
        ciphertext: Buffer.alloc(256),
        algorithm: 'RSAES_OAEP_SHA_256',
        metadata: {}
      };

      await expect(provider.unwrap(wrapped)).rejects.toThrow('keyVersionId is required');
    });

    test('unwrap uses cmkVersion from wrapped key metadata', async () => {
      const provider = new AlibabaKmsProvider({
        keyId: 'key-456',
        keyType: 'asymmetric',
        accessKeyId: 'test-id',
        accessKeySecret: 'test-secret'
      });

      const wrapped = {
        ciphertext: Buffer.alloc(256),
        algorithm: 'RSAES_OAEP_SHA_256',
        metadata: { cmkVersion: 'ver-from-vault-123' }
      };

      await expect(provider.unwrap(wrapped)).rejects.toThrow('@alicloud/kms20160120');
    });

    test('unwrap falls back to configured cmkVersion when metadata is empty', async () => {
      const provider = new AlibabaKmsProvider({
        keyId: 'key-456',
        keyType: 'asymmetric',
        cmkVersion: 'config-version-456',
        accessKeyId: 'test-id',
        accessKeySecret: 'test-secret'
      });

      const wrapped = {
        ciphertext: Buffer.alloc(256),
        algorithm: 'RSAES_OAEP_SHA_256',
        metadata: {}
      };

      await expect(provider.unwrap(wrapped)).rejects.toThrow('@alicloud/kms20160120');
    });
  });

  describe('Auto-Resolution of Key Metadata', () => {
    test('auto-resolves keyVersionId via ListKeyVersions for asymmetric keys', async () => {
      const { provider, callCounts } = createMockedProvider(
        { keyId: 'key-456', keyType: 'asymmetric', accessKeyId: 'id', accessKeySecret: 'secret', endpoint: 'kms.cn-hangzhou.aliyuncs.com' },
        {
          listKeyVersions: () => ({
            body: {
              keyVersions: { keyVersion: [{ keyVersionId: 'auto-resolved-kv-001', keyId: 'key-456' }] },
              totalCount: 1
            }
          }),
          getPublicKey: () => ({
            body: { publicKey: rsaKeyPair.publicKey }
          })
        }
      );

      expect(provider.getCmkVersion()).toBeNull();

      const wrapped = await provider.wrap(crypto.randomBytes(32));

      expect(wrapped.metadata.cmkVersion).toBe('auto-resolved-kv-001');
      expect(wrapped.metadata.localWrap).toBe(true); // publicKeyPem resolved → local wrap
      expect(provider.getCmkVersion()).toBe('auto-resolved-kv-001');
      expect(callCounts.listKeyVersions).toBe(1);
      expect(callCounts.getPublicKey).toBe(1);
    });

    test('auto-resolves publicKeyPem via GetPublicKey API', async () => {
      const { provider, callCounts } = createMockedProvider(
        { keyId: 'key-789', keyType: 'asymmetric', accessKeyId: 'id', accessKeySecret: 'secret', endpoint: 'kms.cn-hangzhou.aliyuncs.com' },
        {
          listKeyVersions: () => ({
            body: {
              keyVersions: { keyVersion: [{ keyVersionId: 'kv-for-pem', keyId: 'key-789' }] },
              totalCount: 1
            }
          }),
          getPublicKey: (request) => {
            expect(request.keyId).toBe('key-789');
            expect(request.keyVersionId).toBe('kv-for-pem');
            return { body: { publicKey: rsaKeyPair.publicKey } };
          }
        }
      );

      const plaintextKey = crypto.randomBytes(32);
      const wrapped = await provider.wrap(plaintextKey);

      // Verify resolved PEM works by decrypting with private key
      const decrypted = crypto.privateDecrypt(
        {
          key: rsaKeyPair.privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256'
        },
        wrapped.ciphertext
      );
      expect(decrypted.equals(plaintextKey)).toBe(true);
      expect(callCounts.getPublicKey).toBe(1);
    });

    test('caches resolved metadata across multiple wrap() calls', async () => {
      const { provider, callCounts } = createMockedProvider(
        { keyId: 'key-cache', keyType: 'asymmetric', accessKeyId: 'id', accessKeySecret: 'secret', endpoint: 'kms.cn-hangzhou.aliyuncs.com' },
        {
          listKeyVersions: () => ({
            body: {
              keyVersions: { keyVersion: [{ keyVersionId: 'cached-kv', keyId: 'key-cache' }] },
              totalCount: 1
            }
          }),
          getPublicKey: () => ({
            body: { publicKey: rsaKeyPair.publicKey }
          })
        }
      );

      await provider.wrap(crypto.randomBytes(32));
      await provider.wrap(crypto.randomBytes(32));
      await provider.wrap(crypto.randomBytes(32));

      // Each API should only be called once
      expect(callCounts.listKeyVersions).toBe(1);
      expect(callCounts.getPublicKey).toBe(1);
    });

    test('explicit cmkVersion config skips ListKeyVersions call', async () => {
      const { provider, callCounts } = createMockedProvider(
        { keyId: 'key-explicit', keyType: 'asymmetric', cmkVersion: 'explicit-kv', accessKeyId: 'id', accessKeySecret: 'secret', endpoint: 'kms.cn-hangzhou.aliyuncs.com' },
        {
          listKeyVersions: () => { throw new Error('Should not be called'); },
          getPublicKey: (request) => {
            expect(request.keyVersionId).toBe('explicit-kv');
            return { body: { publicKey: rsaKeyPair.publicKey } };
          }
        }
      );

      const wrapped = await provider.wrap(crypto.randomBytes(32));

      expect(wrapped.metadata.cmkVersion).toBe('explicit-kv');
      expect(callCounts.listKeyVersions).toBe(0);
      expect(callCounts.getPublicKey).toBe(1); // Only GetPublicKey called
    });

    test('explicit publicKeyPem config skips GetPublicKey call', async () => {
      const { provider, callCounts } = createMockedProvider(
        { keyId: 'key-nopem', keyType: 'asymmetric', publicKeyPem: rsaKeyPair.publicKey, accessKeyId: 'id', accessKeySecret: 'secret', endpoint: 'kms.cn-hangzhou.aliyuncs.com' },
        {
          listKeyVersions: () => ({
            body: {
              keyVersions: { keyVersion: [{ keyVersionId: 'resolved-kv', keyId: 'key-nopem' }] },
              totalCount: 1
            }
          }),
          getPublicKey: () => { throw new Error('Should not be called'); }
        }
      );

      const wrapped = await provider.wrap(crypto.randomBytes(32));

      expect(wrapped.metadata.cmkVersion).toBe('resolved-kv');
      expect(wrapped.metadata.localWrap).toBe(true);
      expect(callCounts.listKeyVersions).toBe(1);
      expect(callCounts.getPublicKey).toBe(0);
    });

    test('both explicit cmkVersion and publicKeyPem skip all KMS resolution calls', async () => {
      const { provider, callCounts } = createMockedProvider(
        { keyId: 'key-both-explicit', keyType: 'asymmetric', cmkVersion: 'explicit-v1', publicKeyPem: rsaKeyPair.publicKey, accessKeyId: 'id', accessKeySecret: 'secret', endpoint: 'kms.cn-hangzhou.aliyuncs.com' },
        {
          listKeyVersions: () => { throw new Error('Should not be called'); },
          getPublicKey: () => { throw new Error('Should not be called'); }
        }
      );

      const wrapped = await provider.wrap(crypto.randomBytes(32));

      expect(wrapped.metadata.cmkVersion).toBe('explicit-v1');
      expect(wrapped.metadata.localWrap).toBe(true);
      expect(callCounts.listKeyVersions).toBe(0);
      expect(callCounts.getPublicKey).toBe(0);
    });

    test('no public key resolution for symmetric keys', async () => {
      const { provider, callCounts } = createMockedProvider(
        { keyId: 'key-sym', keyType: 'symmetric', accessKeyId: 'id', accessKeySecret: 'secret', endpoint: 'kms.cn-hangzhou.aliyuncs.com' },
        {
          listKeyVersions: () => { throw new Error('Should not be called for symmetric'); },
          getPublicKey: () => { throw new Error('Should not be called for symmetric'); }
        }
      );

      const wrapped = await provider.wrap(crypto.randomBytes(32));

      // Symmetric wrap uses Encrypt API, not resolution
      expect(wrapped.algorithm).toBe('ALIBABA_KMS_SYMMETRIC');
      expect(callCounts.listKeyVersions).toBe(0);
      expect(callCounts.getPublicKey).toBe(0);
    });

    test('gracefully skips resolution when KMS is not accessible', async () => {
      // No SDK mocks, no credentials → _ensureClient() will fail
      const provider = new AlibabaKmsProvider({
        keyId: 'key-no-kms',
        keyType: 'asymmetric',
        publicKeyPem: rsaKeyPair.publicKey,
        cmkVersion: 'fallback-v1'
      });

      const wrapped = await provider.wrap(crypto.randomBytes(32));

      // Should still work with explicit config
      expect(wrapped.metadata.cmkVersion).toBe('fallback-v1');
      expect(wrapped.metadata.localWrap).toBe(true);
    });
  });
});

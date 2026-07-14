'use strict';

const crypto = require('crypto');
const { generateKeyPairSync } = require('crypto');
const AzureKmsProvider = require('../../../src/provider/AzureKmsProvider');

/**
 * Create a provider with a mocked _ensureKeyClient() that returns a mock KeyClient.
 * This avoids needing the actual @azure/keyvault-keys SDK installed.
 */
function createMockedProvider(config, getKeyFn) {
  const provider = new AzureKmsProvider(config);
  let getKeyCallCount = 0;

  const mockCryptoClient = {
    async encrypt(alg, data) { return { result: Buffer.from('encrypted-' + alg) }; },
    async decrypt(params) { return { result: Buffer.from('decrypted') }; }
  };

  provider._ensureKeyClient = function() {
    if (!this._keyClient) {
      this._keyClient = {
        async getKey(keyName) {
          getKeyCallCount++;
          return getKeyFn(keyName);
        },
        getCryptographyClient(keyName, opts) {
          return mockCryptoClient;
        }
      };
    }
    return this._keyClient;
  };

  return { provider, getGetKeyCallCount: () => getKeyCallCount };
}

describe('AzureKmsProvider', () => {
  let rsaKeyPair;

  beforeAll(() => {
    rsaKeyPair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
  });

  describe('Configuration', () => {
    test('requires keyName in constructor', () => {
      expect(() => new AzureKmsProvider()).toThrow('requires config.keyName');
      expect(() => new AzureKmsProvider({})).toThrow('requires config.keyName');
    });

    test('accepts keyName configuration', () => {
      expect(() => new AzureKmsProvider({ keyName: 'my-key' })).not.toThrow();
    });

    test('getProviderId returns "azure-keyvault"', () => {
      const provider = new AzureKmsProvider({ keyName: 'my-key' });
      expect(provider.getProviderId()).toBe('azure-keyvault');
    });

    test('getPublicReference returns keyName', () => {
      const provider = new AzureKmsProvider({ keyName: 'my-production-key' });
      expect(provider.getPublicReference()).toBe('my-production-key');
    });

    test('getCmkVersion returns configured version', () => {
      const provider = new AzureKmsProvider({ keyName: 'my-key', cmkVersion: 'v1-abc123' });
      expect(provider.getCmkVersion()).toBe('v1-abc123');
    });

    test('getCmkVersion returns null when not configured', () => {
      const provider = new AzureKmsProvider({ keyName: 'my-key' });
      expect(provider.getCmkVersion()).toBeNull();
    });

    test('rejects unsupported algorithm', () => {
      expect(() => new AzureKmsProvider({ keyName: 'my-key', algorithm: 'RSA-PKCS1' }))
        .toThrow(/unsupported algorithm/);
    });

    test('accepts RSA-OAEP-256 algorithm', () => {
      expect(() => new AzureKmsProvider({ keyName: 'my-key', algorithm: 'RSA-OAEP-256' }))
        .not.toThrow();
    });
  });

  describe('Local Wrap Mode (RSA-OAEP)', () => {
    test('wraps key locally using public key PEM', async () => {
      const provider = new AzureKmsProvider({
        keyName: 'my-key',
        cmkVersion: 'v1-abc123',
        publicKeyPem: rsaKeyPair.publicKey
      });

      const plaintextKey = crypto.randomBytes(32);
      const wrapped = await provider.wrap(plaintextKey);

      expect(wrapped.ciphertext).toBeInstanceOf(Buffer);
      expect(wrapped.algorithm).toBe('RSA-OAEP-256');
      expect(wrapped.metadata.keyName).toBe('my-key');
      expect(wrapped.metadata.cmkVersion).toBe('v1-abc123');
      expect(wrapped.metadata.localWrap).toBe(true);
    });

    test('produces different ciphertext each time (RSA padding randomness)', async () => {
      const provider = new AzureKmsProvider({
        keyName: 'my-key',
        cmkVersion: 'v1-abc123',
        publicKeyPem: rsaKeyPair.publicKey
      });

      const plaintextKey = crypto.randomBytes(32);
      const wrapped1 = await provider.wrap(plaintextKey);
      const wrapped2 = await provider.wrap(plaintextKey);

      expect(wrapped1.ciphertext.equals(wrapped2.ciphertext)).toBe(false);
    });

    test('local wrap can be decrypted with private key', async () => {
      const provider = new AzureKmsProvider({
        keyName: 'my-key',
        cmkVersion: 'v2-def456',
        publicKeyPem: rsaKeyPair.publicKey
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

    test('wrap includes cmkVersion in metadata for rotation tracking', async () => {
      const provider = new AzureKmsProvider({
        keyName: 'rotation-key',
        cmkVersion: '7f3a9b2c1d4e',
        publicKeyPem: rsaKeyPair.publicKey
      });

      const wrapped = await provider.wrap(crypto.randomBytes(32));
      expect(wrapped.metadata.cmkVersion).toBe('7f3a9b2c1d4e');
    });

    test('RSA-OAEP-256 uses SHA-256 for local wrap', async () => {
      const provider = new AzureKmsProvider({
        keyName: 'my-key',
        cmkVersion: 'v1',
        publicKeyPem: rsaKeyPair.publicKey,
        algorithm: 'RSA-OAEP-256'
      });

      const plaintextKey = crypto.randomBytes(32);
      const wrapped = await provider.wrap(plaintextKey);

      expect(wrapped.algorithm).toBe('RSA-OAEP-256');
      expect(wrapped.metadata.localWrap).toBe(true);

      // Verify decryptable with SHA-256
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

    test('default algorithm is RSA-OAEP-256 (SHA-256)', async () => {
      const provider = new AzureKmsProvider({
        keyName: 'my-key',
        cmkVersion: 'v1',
        publicKeyPem: rsaKeyPair.publicKey
      });

      const wrapped = await provider.wrap(crypto.randomBytes(32));
      expect(wrapped.algorithm).toBe('RSA-OAEP-256');
    });

    test('explicit RSA-OAEP uses SHA-1 for backward compatibility', async () => {
      const provider = new AzureKmsProvider({
        keyName: 'my-key',
        cmkVersion: 'v1',
        publicKeyPem: rsaKeyPair.publicKey,
        algorithm: 'RSA-OAEP'
      });

      const plaintextKey = crypto.randomBytes(32);
      const wrapped = await provider.wrap(plaintextKey);

      expect(wrapped.algorithm).toBe('RSA-OAEP');

      // Verify decryptable with SHA-1
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
  });

  describe('Unwrap with cmkVersion', () => {
    test('unwrap requires cmkVersion from metadata or config', async () => {
      const provider = new AzureKmsProvider({ keyName: 'my-key' });
      const fakeWrapped = { ciphertext: Buffer.alloc(32), algorithm: 'RSA-OAEP', metadata: {} };
      await expect(provider.unwrap(fakeWrapped)).rejects.toThrow();
    });

    test('unwrap reads cmkVersion from wrapped key metadata', async () => {
      let usedKeyVersion;
      const { provider } = createMockedProvider(
        { keyName: 'my-key', vaultUrl: 'https://vault.vault.azure.net' },
        () => ({ properties: { version: 'resolved-v1' }, key: null })
      );
      // Override getCryptographyClient to capture the keyVersion used
      provider._ensureKeyClient = function() {
        if (!this._keyClient) {
          this._keyClient = {
            async getKey() { return { properties: { version: 'resolved-v1' }, key: null }; },
            getCryptographyClient(keyName, opts) {
              usedKeyVersion = opts.keyVersion;
              return {
                async decrypt(params) { return { result: Buffer.from('decrypted') }; }
              };
            }
          };
        }
        return this._keyClient;
      };

      const fakeWrapped = {
        ciphertext: Buffer.alloc(32),
        algorithm: 'RSA-OAEP-256',
        metadata: { cmkVersion: 'v1-abc123' }
      };

      await provider.unwrap(fakeWrapped);
      expect(usedKeyVersion).toBe('v1-abc123');
    });

    test('unwrap throws if cmkVersion is missing from metadata and config', async () => {
      const provider = new AzureKmsProvider({
        keyName: 'my-key',
        vaultUrl: 'https://vault.vault.azure.net'
      });

      const fakeWrapped = {
        ciphertext: Buffer.alloc(32),
        algorithm: 'RSA-OAEP',
        metadata: {}
      };

      await expect(provider.unwrap(fakeWrapped)).rejects.toThrow('cmkVersion is required');
    });
  });

  describe('Auto-Resolution of Key Metadata', () => {
    test('auto-resolves cmkVersion via getKey() when not configured', async () => {
      const { provider } = createMockedProvider(
        { keyName: 'my-key', vaultUrl: 'https://vault.vault.azure.net' },
        () => ({ properties: { version: 'auto-resolved-v42' }, key: null })
      );

      expect(provider.getCmkVersion()).toBeNull();

      const plaintextKey = crypto.randomBytes(32);
      const wrapped = await provider.wrap(plaintextKey);

      expect(wrapped.metadata.cmkVersion).toBe('auto-resolved-v42');
      expect(wrapped.metadata.localWrap).toBe(false); // No PEM resolved → remote mode
      expect(provider.getCmkVersion()).toBe('auto-resolved-v42');
    });

    test('auto-resolves publicKeyPem from JWK material', async () => {
      const kp = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });
      const pubKeyObj = crypto.createPublicKey(kp.publicKey);
      const jwk = pubKeyObj.export({ format: 'jwk' });

      const { provider } = createMockedProvider(
        { keyName: 'my-key', vaultUrl: 'https://vault.vault.azure.net' },
        () => ({
          properties: { version: 'jwk-v1' },
          key: {
            kty: jwk.kty,
            n: Buffer.from(jwk.n, 'base64'),
            e: Buffer.from(jwk.e, 'base64')
          }
        })
      );

      const plaintextKey = crypto.randomBytes(32);
      const wrapped = await provider.wrap(plaintextKey);

      // Should have resolved publicKeyPem and done local wrap
      expect(wrapped.metadata.localWrap).toBe(true);
      expect(wrapped.metadata.cmkVersion).toBe('jwk-v1');

      // Verify the resolved PEM can actually encrypt/decrypt with the key pair
      const decrypted = crypto.privateDecrypt(
        { key: kp.privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        wrapped.ciphertext
      );
      expect(decrypted.equals(plaintextKey)).toBe(true);
    });

    test('resolves both cmkVersion and publicKeyPem from single getKey() call', async () => {
      const kp = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });
      const pubKeyObj = crypto.createPublicKey(kp.publicKey);
      const jwk = pubKeyObj.export({ format: 'jwk' });

      const { provider, getGetKeyCallCount } = createMockedProvider(
        { keyName: 'my-key', vaultUrl: 'https://vault.vault.azure.net' },
        () => ({
          properties: { version: 'single-call-v1' },
          key: {
            kty: jwk.kty,
            n: Buffer.from(jwk.n, 'base64'),
            e: Buffer.from(jwk.e, 'base64')
          }
        })
      );

      await provider.wrap(crypto.randomBytes(32));
      expect(getGetKeyCallCount()).toBe(1);
    });

    test('caches resolved metadata across multiple wrap() calls', async () => {
      const kp = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });
      const pubKeyObj = crypto.createPublicKey(kp.publicKey);
      const jwk = pubKeyObj.export({ format: 'jwk' });

      const { provider, getGetKeyCallCount } = createMockedProvider(
        { keyName: 'my-key', vaultUrl: 'https://vault.vault.azure.net' },
        () => ({
          properties: { version: 'cached-v1' },
          key: {
            kty: jwk.kty,
            n: Buffer.from(jwk.n, 'base64'),
            e: Buffer.from(jwk.e, 'base64')
          }
        })
      );

      await provider.wrap(crypto.randomBytes(32));
      await provider.wrap(crypto.randomBytes(32));
      await provider.wrap(crypto.randomBytes(32));

      // getKey() should only be called once, cached for subsequent wraps
      expect(getGetKeyCallCount()).toBe(1);
    });

    test('explicit cmkVersion config takes precedence over auto-resolution', async () => {
      const { provider, getGetKeyCallCount } = createMockedProvider(
        {
          keyName: 'my-key',
          vaultUrl: 'https://vault.vault.azure.net',
          cmkVersion: 'explicit-v99',
          publicKeyPem: rsaKeyPair.publicKey
        },
        () => ({ properties: { version: 'should-not-use-this' }, key: null })
      );

      const wrapped = await provider.wrap(crypto.randomBytes(32));
      expect(wrapped.metadata.cmkVersion).toBe('explicit-v99');
      // Both values explicit → getKey() should NOT be called
      expect(getGetKeyCallCount()).toBe(0);
    });

    test('explicit publicKeyPem config takes precedence, only cmkVersion resolved', async () => {
      const { provider, getGetKeyCallCount } = createMockedProvider(
        {
          keyName: 'my-key',
          vaultUrl: 'https://vault.vault.azure.net',
          publicKeyPem: rsaKeyPair.publicKey
        },
        () => ({
          properties: { version: 'resolved-v5' },
          key: { kty: 'RSA', n: Buffer.from('fake'), e: Buffer.from('fake') }
        })
      );

      const wrapped = await provider.wrap(crypto.randomBytes(32));
      expect(wrapped.metadata.cmkVersion).toBe('resolved-v5');
      expect(wrapped.metadata.localWrap).toBe(true);
      expect(getGetKeyCallCount()).toBe(1);
    });
  });
});

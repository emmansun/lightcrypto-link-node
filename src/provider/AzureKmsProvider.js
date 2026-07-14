'use strict';

const crypto = require('crypto');
const CmkProvider = require('./CmkProvider');

/**
 * Azure Key Vault CMK provider using RSA-OAEP for asymmetric key wrapping.
 * 
 * Supports two modes:
 * 1. **Local wrap mode** (recommended): Uses public key PEM for local RSA-OAEP encryption.
 *    - wrap() is performed locally using Node.js crypto (no KMS call).
 *    - unwrap() requires calling Azure KMS decrypt endpoint.
 * 2. **Remote mode**: Both wrap and unwrap call Azure KMS (higher latency, higher cost).
 * 
 * cmkVersion (key version) handling — matches Java AKV.js reference:
 * - If `config.cmkVersion` is provided, it is used directly.
 * - Otherwise, the latest version is resolved lazily via `KeyClient.getKey(keyName)`.
 * - The cmkVersion is stored in wrap metadata and read back during unwrap,
 *   enabling CMK rotation support.
 *
 * Lazy-loads @azure/keyvault-keys and @azure/identity dependencies.
 */
class AzureKmsProvider extends CmkProvider {
  /**
   * @param {Object} config - Azure configuration
   * @param {string} config.keyName - Azure Key Vault key name (used as public reference)
   * @param {string} [config.vaultUrl] - Azure Key Vault URL (e.g. https://myvault.vault.azure.net)
   * @param {string} [config.cmkVersion] - Key version string (if not provided, latest is resolved)
   * @param {string} [config.publicKeyPem] - RSA public key in PEM format (for local wrap)
   * @param {string} [config.algorithm='RSA-OAEP-256'] - RSA-OAEP variant: 'RSA-OAEP' (SHA-1) or 'RSA-OAEP-256' (SHA-256, recommended)
   * @param {Object} [config.credential] - Azure credential (DefaultAzureCredential)
   */
  constructor(config) {
    super();
    if (!config || !config.keyName) {
      throw new Error('AzureKmsProvider requires config.keyName');
    }
    this._keyName = config.keyName;
    this._vaultUrl = config.vaultUrl || null;
    this._cmkVersion = config.cmkVersion || null;
    this._publicKeyPem = config.publicKeyPem || null;
    this._credential = config.credential || null;
    this._algorithm = config.algorithm || 'RSA-OAEP-256';
    this._keyClient = null;

    if (this._algorithm !== 'RSA-OAEP' && this._algorithm !== 'RSA-OAEP-256') {
      throw new Error(`AzureKmsProvider: unsupported algorithm '${this._algorithm}'. Must be 'RSA-OAEP' or 'RSA-OAEP-256'`);
    }
  }

  getProviderId() {
    return 'azure-keyvault';
  }

  getPublicReference() {
    return this._keyName;
  }

  /**
   * Get the current CMK key version.
   * Lazily resolves the latest version from Azure Key Vault if not explicitly configured.
   * @returns {Promise<string|null>} Key version string, or null if unavailable
   */
  getCmkVersion() {
    return this._cmkVersion;
  }

  /**
   * Ensure key metadata (cmkVersion and publicKeyPem) is resolved.
   * If either is not explicitly configured, fetches both from a single getKey() call.
   * - cmkVersion: resolved from key.properties.version
   * - publicKeyPem: built from JWK material (kty, n, e) matching AKV.buildPublicKeyPEMFromJWK()
   * 
   * Results are cached for the provider lifetime.
   * @returns {Promise<void>}
   * @private
   */
  async _ensureResolved() {
    if (this._cmkVersion && this._publicKeyPem) return;
    const keyClient = this._ensureKeyClient();
    const key = await keyClient.getKey(this._keyName);
    if (!this._cmkVersion) {
      this._cmkVersion = key.properties.version;
    }
    if (!this._publicKeyPem && key.key) {
      const publicKeyObj = crypto.createPublicKey({
        key: {
          kty: key.key.kty,
          n: key.key.n.toString('base64'),
          e: key.key.e.toString('base64')
        },
        format: 'jwk'
      });
      this._publicKeyPem = publicKeyObj.export({ type: 'spki', format: 'pem' }).toString();
    }
  }

  /**
   * Lazy-initialize the KeyClient (used for version resolution and obtaining CryptographyClients).
   * Mirrors the pattern in AKV.js: `new KeyClient(vaultUrl, credential)`.
   * @private
   */
  _ensureKeyClient() {
    if (!this._keyClient) {
      if (!this._vaultUrl) {
        throw new Error(
          'AzureKmsProvider requires config.vaultUrl for KMS operations'
        );
      }
      let KeyClient, DefaultAzureCredential;
      try {
        const keysModule = require('@azure/keyvault-keys');
        KeyClient = keysModule.KeyClient;
      } catch (e) {
        throw new Error(
          'Azure Key Vault provider requires @azure/keyvault-keys. Install with: npm install @azure/keyvault-keys'
        );
      }
      try {
        const identityModule = require('@azure/identity');
        DefaultAzureCredential = identityModule.DefaultAzureCredential;
      } catch (e) {
        throw new Error(
          'Azure Key Vault provider requires @azure/identity. Install with: npm install @azure/identity'
        );
      }
      const credential = this._credential || new DefaultAzureCredential();
      this._keyClient = new KeyClient(this._vaultUrl, credential);
    }
    return this._keyClient;
  }

  /**
   * Get a CryptographyClient for the specified key version.
   * Mirrors AKV.js: `this.client.getCryptographyClient(keyName, { keyVersion })`.
   * @param {string} keyVersion
   * @returns {CryptographyClient}
   * @private
   */
  _getCryptoClient(keyVersion) {
    const keyClient = this._ensureKeyClient();
    return keyClient.getCryptographyClient(this._keyName, { keyVersion });
  }

  /**
   * Map Azure algorithm name to Node.js crypto oaepHash.
   * RSA-OAEP → sha1, RSA-OAEP-256 → sha256
   * @private
   */
  _oaepHash() {
    return this._algorithm === 'RSA-OAEP-256' ? 'sha256' : 'sha1';
  }

  /**
   * Wrap a key using RSA-OAEP.
   * 
   * If publicKeyPem is configured, performs encryption **locally** using Node.js crypto
   * (no KMS call, faster, cheaper). Otherwise calls Azure KMS encrypt endpoint.
   * 
   * cmkVersion is included in metadata for both modes, enabling CMK rotation tracking.
   * 
   * @param {Buffer} plaintextKey
   * @returns {Promise<{ciphertext: Buffer, algorithm: string, metadata: Object}>}
   */
  async wrap(plaintextKey) {
    await this._ensureResolved();
    const cmkVersion = this._cmkVersion;

    if (this._publicKeyPem) {
      // Local RSA-OAEP encryption using public key
      const ciphertext = crypto.publicEncrypt(
        {
          key: this._publicKeyPem,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: this._oaepHash()
        },
        plaintextKey
      );
      return {
        ciphertext,
        algorithm: this._algorithm,
        metadata: { keyName: this._keyName, cmkVersion, localWrap: true }
      };
    }

    // Remote mode: call Azure KMS via versioned CryptographyClient
    const cryptoClient = this._getCryptoClient(cmkVersion);
    const result = await cryptoClient.encrypt(this._algorithm, plaintextKey);
    return {
      ciphertext: Buffer.from(result.result),
      algorithm: this._algorithm,
      metadata: { keyName: this._keyName, cmkVersion, localWrap: false }
    };
  }

  /**
   * Unwrap a key using Azure Key Vault RSA-OAEP.
   * 
   * **Always calls Azure KMS** decrypt endpoint because private key never leaves Key Vault.
   * 
   * Uses the cmkVersion stored in wrap metadata to decrypt with the correct key version,
   * matching the AKV.js pattern: `getCryptographyClient(keyName, { keyVersion }).decrypt(...)`.
   * 
   * @param {{ciphertext: Buffer, algorithm: string, metadata: Object}} wrappedKey
   * @returns {Promise<Buffer>}
   */
  async unwrap(wrappedKey) {
    const cmkVersion = (wrappedKey.metadata && wrappedKey.metadata.cmkVersion) || this._cmkVersion;
    if (!cmkVersion) {
      throw new Error('AzureKmsProvider: cmkVersion is required for unwrap. Ensure it was stored during wrap.');
    }
    // Read algorithm from wrapped key metadata, fall back to provider config
    const algorithm = (wrappedKey.metadata && wrappedKey.metadata.algorithm) || this._algorithm;
    const cryptoClient = this._getCryptoClient(cmkVersion);
    const result = await cryptoClient.decrypt({ algorithm, ciphertext: wrappedKey.ciphertext });
    return Buffer.from(result.result);
  }
}

module.exports = AzureKmsProvider;

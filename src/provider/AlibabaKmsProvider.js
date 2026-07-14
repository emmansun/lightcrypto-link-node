'use strict';

const crypto = require('crypto');
const CmkProvider = require('./CmkProvider');

/**
 * Alibaba Cloud KMS CMK provider for China compliance.
 * 
 * Supports two key types:
 * 1. **Symmetric CMK** (Aliyun_AES_256): Uses Encrypt/Decrypt APIs.
 *    - wrap() calls Alibaba KMS Encrypt API; captures returned keyVersionId in metadata.
 *    - unwrap() calls Alibaba KMS Decrypt API (keyVersionId NOT needed per API design).
 * 2. **Asymmetric CMK** (RSA_2048, RSA_3072, etc.): Uses AsymmetricEncrypt/Decrypt.
 *    - wrap() can be performed **locally** using public key (no KMS call, faster, cheaper).
 *    - unwrap() always calls Alibaba KMS with keyVersionId (private key never leaves KMS).
 * 
 * cmkVersion (keyVersionId) handling — matches Java AliKMS.js reference:
 * - Symmetric: Encrypt API returns keyVersionId; Decrypt API does not need it.
 * - Asymmetric: keyVersionId is required for both AsymmetricEncrypt and AsymmetricDecrypt.
 * - If `config.cmkVersion` is provided, it is used for asymmetric operations.
 *
 * Lazy-loads @alicloud/kms20160120 dependency.
 */
class AlibabaKmsProvider extends CmkProvider {
  /**
   * @param {Object} config - Alibaba KMS configuration
   * @param {string} config.keyId - KMS key ID (used as public reference)
   * @param {string} [config.keyType='symmetric'] - Key type: 'symmetric' or 'asymmetric'
   * @param {string} [config.cmkVersion] - keyVersionId for the CMK (required for asymmetric)
   * @param {string} [config.region] - Region ID
   * @param {string} [config.endpoint] - KMS endpoint
   * @param {string} [config.accessKeyId] - Access key ID
   * @param {string} [config.accessKeySecret] - Access key secret
   * @param {string} [config.publicKeyPem] - RSA public key in PEM format (for local asymmetric wrap)
   * @param {string} [config.asymmetricAlgorithm='RSAES_OAEP_SHA_256'] - Algorithm for asymmetric ops
   */
  constructor(config) {
    super();
    if (!config || !config.keyId) {
      throw new Error('AlibabaKmsProvider requires config.keyId');
    }
    this._keyId = config.keyId;
    this._keyType = config.keyType || 'symmetric';
    this._cmkVersion = config.cmkVersion || null;
    this._region = config.region;
    this._endpoint = config.endpoint;
    this._accessKeyId = config.accessKeyId;
    this._accessKeySecret = config.accessKeySecret;
    this._publicKeyPem = config.publicKeyPem || null;
    this._asymmetricAlgorithm = config.asymmetricAlgorithm || 'RSAES_OAEP_SHA_256';
    this._client = null;

    if (this._keyType !== 'symmetric' && this._keyType !== 'asymmetric') {
      throw new Error(`AlibabaKmsProvider: invalid keyType '${this._keyType}'. Must be 'symmetric' or 'asymmetric'`);
    }
  }

  getProviderId() {
    return 'alibaba-kms';
  }

  getPublicReference() {
    return this._keyId;
  }

  /**
   * Get the current CMK key version (keyVersionId).
   * @returns {string|null} keyVersionId, or null if not configured
   */
  getCmkVersion() {
    return this._cmkVersion;
  }

  /**
   * Lazy-initialize the Alibaba KMS client.
   * @private
   */
  async _ensureClient() {
    if (!this._client) {
      try {
        const Kms20160120 = require('@alicloud/kms20160120');
        const OpenApi = require('@alicloud/openapi-client');

        const cfg = new OpenApi.Config({
          accessKeyId: this._accessKeyId,
          accessKeySecret: this._accessKeySecret,
          endpoint: this._endpoint,
          regionId: this._region
        });
        this._client = new Kms20160120.default(cfg);
      } catch (e) {
        throw new Error(
          'Alibaba KMS provider requires @alicloud/kms20160120 and @alicloud/openapi-client. ' +
          'Install with: npm install @alicloud/kms20160120 @alicloud/openapi-client'
        );
      }
    }
    return this._client;
  }

  /**
   * Ensure key metadata (cmkVersion and publicKeyPem) is resolved from KMS.
   * 
   * For asymmetric keys:
   * - If cmkVersion is not configured, resolves the latest keyVersionId via ListKeyVersions.
   * - If publicKeyPem is not configured, fetches it via GetPublicKey(keyId, keyVersionId).
   * 
   * For symmetric keys:
   * - Resolution is skipped (Encrypt API returns keyVersionId; no public key needed).
   * 
   * If KMS is not accessible (no credentials, SDK not installed), resolution is skipped
   * gracefully to allow local wrap with explicit config.
   * 
   * Results are cached for the provider lifetime.
   * @returns {Promise<void>}
   * @private
   */
  async _ensureResolved() {
    // Symmetric keys don't need pre-resolution
    if (this._keyType === 'symmetric') return;
    // Asymmetric: skip if both values are already known
    if (this._cmkVersion && this._publicKeyPem) return;

    let client;
    try {
      client = await this._ensureClient();
    } catch (e) {
      // KMS not accessible — skip resolution, rely on explicit config
      return;
    }

    const Kms20160120 = require('@alicloud/kms20160120');

    // Resolve latest keyVersionId if not configured
    if (!this._cmkVersion) {
      const listRequest = new Kms20160120.ListKeyVersionsRequest({
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

    // Resolve publicKeyPem if not configured and we have a keyVersionId
    if (!this._publicKeyPem && this._cmkVersion) {
      const pkRequest = new Kms20160120.GetPublicKeyRequest({
        keyId: this._keyId,
        keyVersionId: this._cmkVersion
      });
      const pkResponse = await client.getPublicKey(pkRequest);
      this._publicKeyPem = pkResponse.body.publicKey;
    }
  }

  /**
   * Map asymmetric algorithm name to Node.js crypto oaepHash.
   * @private
   */
  _mapOaepHash(algorithm) {
    const map = {
      RSAES_OAEP_SHA_1: 'sha1',
      RSAES_OAEP_SHA_256: 'sha256'
    };
    return map[algorithm] || 'sha256';
  }

  /**
   * Wrap a key using Alibaba Cloud KMS.
   * 
   * **Symmetric key**: Calls Alibaba Encrypt API.
   *   - keyVersionId is NOT needed in the request.
   *   - The returned keyVersionId from the response is captured in metadata.
   * 
   * **Asymmetric key (local)**: If publicKeyPem is configured, performs RSA-OAEP
   *   encryption **locally** using Node.js crypto (no KMS call).
   *   - cmkVersion is included in metadata for rotation tracking.
   * 
   * **Asymmetric key (remote)**: Calls Alibaba AsymmetricEncrypt API.
   *   - keyVersionId is passed in the request (matching AliKMS.js pattern).
   * 
   * @param {Buffer} plaintextKey
   * @returns {Promise<{ciphertext: Buffer, algorithm: string, metadata: Object}>}
   */
  async wrap(plaintextKey) {
    await this._ensureResolved();

    if (this._keyType === 'asymmetric' && this._publicKeyPem) {
      // Local RSA-OAEP encryption using public key
      const oaepHash = this._mapOaepHash(this._asymmetricAlgorithm);
      const ciphertext = crypto.publicEncrypt(
        {
          key: this._publicKeyPem,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash
        },
        plaintextKey
      );
      return {
        ciphertext,
        algorithm: this._asymmetricAlgorithm,
        metadata: {
          keyId: this._keyId,
          keyType: 'asymmetric',
          cmkVersion: this._cmkVersion,
          localWrap: true
        }
      };
    }

    // Remote mode: call Alibaba KMS
    const client = await this._ensureClient();
    const Kms20160120 = require('@alicloud/kms20160120');

    const plaintextBase64 = plaintextKey.toString('base64');

    if (this._keyType === 'symmetric') {
      // Symmetric: Encrypt API does not require keyVersionId
      const request = new Kms20160120.EncryptRequest({
        keyId: this._keyId,
        plaintext: plaintextBase64
      });
      const response = await client.encrypt(request);
      // Capture keyVersionId from response for metadata tracking
      const keyVersionId = response.body.keyVersionId || null;
      return {
        ciphertext: Buffer.from(response.body.ciphertextBlob, 'base64'),
        algorithm: 'ALIBABA_KMS_SYMMETRIC',
        metadata: {
          keyId: this._keyId,
          keyType: 'symmetric',
          cmkVersion: keyVersionId,
          localWrap: false
        }
      };
    }

    // Asymmetric remote: call AsymmetricEncrypt API with keyVersionId
    const request = new Kms20160120.AsymmetricEncryptRequest({
      keyId: this._keyId,
      keyVersionId: this._cmkVersion,
      plaintext: plaintextBase64,
      algorithm: this._asymmetricAlgorithm
    });
    const response = await client.asymmetricEncrypt(request);
    return {
      ciphertext: Buffer.from(response.body.ciphertextBlob, 'base64'),
      algorithm: this._asymmetricAlgorithm,
      metadata: {
        keyId: this._keyId,
        keyType: 'asymmetric',
        cmkVersion: this._cmkVersion,
        localWrap: false
      }
    };
  }

  /**
   * Unwrap a key using Alibaba Cloud KMS.
   * 
   * **Symmetric**: Calls Decrypt API. keyVersionId is NOT needed
   *   (the ciphertextBlob is self-contained, per Alibaba KMS API design).
   * 
   * **Asymmetric**: Calls AsymmetricDecrypt API with keyVersionId from stored metadata.
   *   Matches AliKMS.js pattern: `asymmetricDecrypt(ciphertext, keyId, keyVersionId)`.
   * 
   * @param {{ciphertext: Buffer, algorithm: string, metadata: Object}} wrappedKey
   * @returns {Promise<Buffer>}
   */
  async unwrap(wrappedKey) {
    const ciphertextBase64 = wrappedKey.ciphertext.toString('base64');

    if (this._keyType === 'symmetric') {
      // Symmetric Decrypt API does not need keyVersionId
      const client = await this._ensureClient();
      const Kms20160120 = require('@alicloud/kms20160120');
      const request = new Kms20160120.DecryptRequest({
        ciphertextBlob: ciphertextBase64
      });
      const response = await client.decrypt(request);
      return Buffer.from(response.body.plaintext, 'base64');
    }

    // Asymmetric: read keyVersionId from stored metadata BEFORE calling KMS
    const keyVersionId = (wrappedKey.metadata && wrappedKey.metadata.cmkVersion) || this._cmkVersion;
    if (!keyVersionId) {
      throw new Error(
        'AlibabaKmsProvider: keyVersionId is required for asymmetric unwrap. ' +
        'Ensure cmkVersion was stored during wrap or configured via config.cmkVersion.'
      );
    }

    const client = await this._ensureClient();
    const Kms20160120 = require('@alicloud/kms20160120');

    const request = new Kms20160120.AsymmetricDecryptRequest({
      keyId: this._keyId,
      keyVersionId,
      ciphertextBlob: ciphertextBase64,
      algorithm: this._asymmetricAlgorithm
    });
    const response = await client.asymmetricDecrypt(request);
    return Buffer.from(response.body.plaintext, 'base64');
  }
}

module.exports = AlibabaKmsProvider;

'use strict';

const crypto = require('crypto');
const CmkProvider = require('./CmkProvider');
const { LclAlgorithms } = require('./LclAlgorithms');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const PROVIDER_ID = 'local-symmetric';

/**
 * Local CMK provider using AES-256-GCM for key wrapping.
 * The CMK must be exactly 32 bytes (256 bits).
 */
class LocalCmkProvider extends CmkProvider {
  /**
   * @param {Buffer|string} cmk - 32-byte CMK key or 64-char hex string
   */
  constructor(cmk) {
    super();
    if (typeof cmk === 'string') {
      if (!/^[0-9a-fA-F]{64}$/.test(cmk)) {
        throw new Error('CMK must be exactly 64 hex characters (32 bytes). Check LCL_CMK_KEY environment variable.');
      }
      this._cmk = Buffer.from(cmk, 'hex');
    } else if (Buffer.isBuffer(cmk)) {
      if (cmk.length !== 32) {
        throw new Error('CMK must be exactly 32 bytes. Check LCL_CMK_KEY environment variable.');
      }
      this._cmk = cmk;
    } else {
      throw new Error('CMK must be a hex string or Buffer. Check LCL_CMK_KEY environment variable.');
    }

    // Compute public reference: SHA-256 hash first 8 hex chars
    const hash = crypto.createHash('sha256').update(this._cmk).digest('hex');
    this._publicReference = `local-cmk-sha256:${hash.substring(0, 8)}`;
  }

  getProviderId() {
    return PROVIDER_ID;
  }

  getPublicReference() {
    return this._publicReference;
  }

  supportsAlgorithm(lclAlgorithm) {
    return lclAlgorithm === LclAlgorithms.AES_256_GCM;
  }

  mapAlgorithm(lclAlgorithm) {
    if (lclAlgorithm === LclAlgorithms.AES_256_GCM) {
      return ALGORITHM;
    }
    return null;
  }

  /**
   * Wrap a key using AES-256-GCM.
   * @param {Buffer} plaintextKey - Key to wrap
   * @returns {Promise<{ciphertext: Buffer, algorithm: string, metadata: Object}>}
   */
  async wrap(plaintextKey) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this._cmk, iv);
    const encrypted = Buffer.concat([cipher.update(plaintextKey), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const ciphertext = Buffer.concat([iv, encrypted, authTag]);

    return {
      ciphertext,
      algorithm: LclAlgorithms.AES_256_GCM,
      metadata: {}
    };
  }

  /**
   * Unwrap a key using AES-256-GCM.
   * @param {{ciphertext: Buffer, algorithm: string, metadata: Object}} wrappedKey
   * @returns {Promise<Buffer>}
   * @throws {Error} If wrapped key is malformed
   */
  async unwrap(wrappedKey) {
    if (!wrappedKey || !Buffer.isBuffer(wrappedKey.ciphertext)) {
      throw new Error('Invalid wrapped key: ciphertext must be a Buffer');
    }
    if (!this.supportsAlgorithm(wrappedKey.algorithm)) {
      throw new Error(`Invalid algorithm: ${wrappedKey.algorithm}`);
    }
    const data = wrappedKey.ciphertext;
    const minLength = IV_LENGTH + AUTH_TAG_LENGTH;
    if (data.length < minLength) {
      throw new Error(
        `Invalid wrapped key: expected at least ${minLength} bytes, got ${data.length}`
      );
    }

    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(data.length - AUTH_TAG_LENGTH);
    const ciphertext = data.subarray(IV_LENGTH, data.length - AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, this._cmk, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}

module.exports = LocalCmkProvider;

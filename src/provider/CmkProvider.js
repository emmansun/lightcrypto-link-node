'use strict';

/**
 * Base class for Customer Master Key (CMK) providers.
 * Subclasses must implement getProviderId(), getPublicReference(), wrap(), and unwrap().
 */
class CmkProvider {
  /**
   * @returns {string} Unique provider identifier
   */
  getProviderId() {
    throw new Error('getProviderId() must be implemented by subclass');
  }

  /**
   * @returns {string} Public reference for audit/verification (e.g., "local-cmk-sha256:abcd1234")
   */
  getPublicReference() {
    throw new Error('getPublicReference() must be implemented by subclass');
  }

  /**
   * Get the current CMK key version.
   * Returns the version identifier used for wrap/unwrap operations.
   * Providers without versioning (e.g., local CMK) return null.
   * @returns {string|null} CMK version identifier, or null if not versioned
   */
  getCmkVersion() {
    return null;
  }

  /**
   * Ensure key metadata (cmkVersion, publicKeyPem) is resolved.
   * Cloud KMS providers override this to auto-resolve metadata from the KMS API
   * when not explicitly configured. Called at the start of wrap().
   * Default implementation is a no-op for providers that don't need resolution (e.g., local CMK).
   * @returns {Promise<void>}
   */
  async _ensureResolved() {
    // no-op by default
  }

  /**
   * Wrap (encrypt) a plaintext key using the CMK.
   * @param {Buffer} plaintextKey - The key to wrap
   * @returns {Promise<{ciphertext: Buffer, algorithm: string, metadata: Object}>}
   */
  async wrap(plaintextKey) {
    throw new Error('wrap() must be implemented by subclass');
  }

  /**
   * Unwrap (decrypt) a wrapped key using the CMK.
   * @param {{ciphertext: Buffer, algorithm: string, metadata: Object}} wrappedKey - The wrapped key info
   * @returns {Promise<Buffer>} The unwrapped plaintext key
   */
  async unwrap(wrappedKey) {
    throw new Error('unwrap() must be implemented by subclass');
  }
}

module.exports = CmkProvider;

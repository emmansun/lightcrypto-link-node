'use strict';

const crypto = require('crypto');

const HKDF_INFO = 'lcl-blind-index-v1';
const HKDF_KEY_LEN = 32;

/**
 * BlindIndexEngine — derives per-namespace HMAC key via HKDF-SHA256
 * and computes blind indexes as Base64URL HMAC-SHA256.
 * Matches Java BlindIndexEngine exactly.
 */
class BlindIndexEngine {
  constructor() {
    /** @type {Map<string, Buffer>} derived key cache keyed by canonical namespace */
    this._cache = new Map();
  }

  /**
   * Derive a namespace-scoped HMAC key via HKDF-SHA256.
   * @param {Buffer} masterHmacKey - Master HMAC key (IKM)
   * @param {import('../namespace/Namespace')} namespace - Namespace instance
   * @returns {Buffer} 32-byte derived key
   */
  deriveKey(masterHmacKey, namespace) {
    const cacheKey = namespace.canonical();
    const cached = this._cache.get(cacheKey);
    if (cached) return cached;

    const salt = crypto.createHash('sha256').update(namespace.canonicalBytes()).digest();
    const derivedKey = Buffer.from(
      crypto.hkdfSync('sha256', masterHmacKey, salt, HKDF_INFO, HKDF_KEY_LEN)
    );

    this._cache.set(cacheKey, derivedKey);
    return derivedKey;
  }

  /**
   * Compute blind index for a value.
   * @param {Buffer} masterHmacKey - Master HMAC key
   * @param {import('../namespace/Namespace')} namespace - Namespace instance
   * @param {string} fieldName - Field name for isolation
   * @param {string|Buffer} value - Value to index (string normalized, Buffer raw)
   * @returns {string} Base64URL (no padding) blind index
   */
  compute(masterHmacKey, namespace, fieldName, value) {
    const derivedKey = this.deriveKey(masterHmacKey, namespace);

    let normalizedValue;
    if (Buffer.isBuffer(value)) {
      normalizedValue = value;
    } else {
      // String normalization: trim + lowercase
      normalizedValue = String(value).trim().toLowerCase();
    }

    const input = Buffer.isBuffer(normalizedValue)
      ? Buffer.concat([Buffer.from(`${fieldName}:`, 'utf8'), normalizedValue])
      : `${fieldName}:${normalizedValue}`;

    const hmac = crypto.createHmac('sha256', derivedKey);
    hmac.update(input, Buffer.isBuffer(input) ? undefined : 'utf8');
    return hmac.digest().toString('base64url');
  }
}

module.exports = BlindIndexEngine;

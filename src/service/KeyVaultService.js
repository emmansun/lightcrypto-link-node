'use strict';

const crypto = require('crypto');
const CryptoCodec = require('../crypto/CryptoCodec');

const DEFAULT_CACHE_TTL = 3600000; // 1 hour

/**
 * KeyVaultService - Manages per-namespace DEK/HMAC key pairs with versioning,
 * rotation, KCV verification, and in-memory caching.
 *
 * Aligned with Java KeyVaultService: each namespace (canonical form, e.g.
 * "default.default.User#phone") gets its own vault document and DEK/HMAC key pair.
 */
class KeyVaultService {
  /**
   * @param {Object} options
   * @param {VaultStore} options.vaultStore - VaultStore implementation for vault persistence
   * @param {CmkProvider} options.cmkProvider - CMK provider for key wrapping
   * @param {number} [options.cacheTtl=3600000] - Cache TTL in milliseconds
   */
  constructor(options) {
    this._vaultStore = options.vaultStore;
    this._cmkProvider = options.cmkProvider;
    this._cacheTtl = options.cacheTtl || DEFAULT_CACHE_TTL;
    this._codec = new CryptoCodec();
    /** @type {Map<string, Object>} Per-namespace key contexts: canonicalNamespace -> cache entry */
    this._cache = new Map();
  }

  /**
   * Ensure the vault is initialized for the given namespace.
   * Creates vault document with initial DEK/HMAC key pair if not exists.
   * @param {string} namespace - Canonical namespace (e.g., "default.default.User#phone")
   * @returns {Promise<void>}
   */
  async ensureVaultInitialized(namespace) {
    const cached = this._getFromCache(namespace);
    if (cached) return;

    let vaultDoc = await this._vaultStore.load(namespace);

    if (!vaultDoc) {
      vaultDoc = await this._initializeVault(namespace);
    }

    await this._verifyAndLoadKeys(vaultDoc, namespace);
  }

  /**
   * Get the active kid for a namespace.
   * @param {string} namespace - Canonical namespace
   * @returns {Promise<string>}
   */
  async getActiveKid(namespace) {
    const entry = await this._ensureCached(namespace);
    return entry.activeKid;
  }

  /**
   * Get the active DEK version for a namespace.
   * @param {string} namespace - Canonical namespace
   * @returns {Promise<number>}
   */
  async getActiveDekVersion(namespace) {
    const entry = await this._ensureCached(namespace);
    return entry.activeDekVersion;
  }

  /**
   * Get the unwrapped DEK for a specific kid.
   * Searches across all cached namespaces.
   * @param {string} kid - Key identifier
   * @returns {Promise<Buffer>}
   */
  async getDek(kid) {
    for (const [, entry] of this._cache) {
      const pair = entry.resolvedKeys.get(kid);
      if (pair) return pair.dek;
    }
    throw new Error(`Unknown kid: ${kid}`);
  }

  /**
   * Get the unwrapped HMAC key for a specific kid.
   * Searches across all cached namespaces.
   * @param {string} kid - Key identifier
   * @returns {Promise<Buffer>}
   */
  async getHmacKey(kid) {
    for (const [, entry] of this._cache) {
      const pair = entry.resolvedKeys.get(kid);
      if (pair) return pair.hmacKey;
    }
    throw new Error(`Unknown kid: ${kid}`);
  }

  /**
   * Get the active HMAC key for the given namespace.
   * @param {string} namespace - Canonical namespace
   * @returns {Promise<Buffer>}
   */
  async getActiveHmacKey(namespace) {
    const kid = await this.getActiveKid(namespace);
    return this.getHmacKey(kid);
  }

  /**
   * Get the unwrapped DEK for a specific namespace and DEK version.
   * @param {string} namespace - Canonical namespace
   * @param {number} dekVersion - DEK version number
   * @returns {Promise<Buffer>}
   */
  async getDekByVersion(namespace, dekVersion) {
    const entry = await this._ensureCached(namespace);
    const pair = entry.resolvedKeysByVersion.get(dekVersion);
    if (!pair) {
      throw new Error(`No key found for namespace ${namespace} with dekVersion ${dekVersion}`);
    }
    return pair.dek;
  }

  /**
   * Rotate the DEK for the given namespace.
   * Marks all ACTIVE keys as ROTATED and creates a new ACTIVE key.
   * @param {string} namespace - Canonical namespace
   * @returns {Promise<void>}
   */
  async rotateDek(namespace) {
    const vaultDoc = await this._vaultStore.load(namespace);
    if (!vaultDoc) {
      throw new Error(`Vault not found for namespace: ${namespace}`);
    }

    const expectedVersion = vaultDoc.v;
    let maxVersion = 0;

    // Mark all ACTIVE keys as ROTATED, find max version from kids
    for (const keyEntry of vaultDoc.keys) {
      if (keyEntry.status === 'ACTIVE') {
        keyEntry.status = 'ROTATED';
      }
      const ver = this._parseVersion(keyEntry.kid);
      if (ver > maxVersion) maxVersion = ver;
    }

    // Generate new key pair
    const newVersion = maxVersion + 1;
    const newKid = this._generateKid(newVersion);

    const newDek = crypto.randomBytes(32);
    const newHmacKey = crypto.randomBytes(32);

    const wrappedDek = await this._cmkProvider.wrap(newDek);
    const wrappedHmk = await this._cmkProvider.wrap(newHmacKey);

    const dekKcv = this._codec.computeKcv(newDek, 'AES_256_GCM');
    const hmkKcv = this._codec.computeKcv(newHmacKey, 'AES_256_GCM');
    const binding = this._codec.computeBinding(newHmacKey, newDek);

    vaultDoc.keys.push({
      kid: newKid,
      status: 'ACTIVE',
      dek: {
        wrapped: wrappedDek.ciphertext,
        algorithm: wrappedDek.algorithm,
        kcv: dekKcv,
        cmkVersion: wrappedDek.metadata?.cmkVersion || ''
      },
      hmk: {
        wrapped: wrappedHmk.ciphertext,
        algorithm: wrappedHmk.algorithm,
        kcv: hmkKcv,
        cmkVersion: wrappedHmk.metadata?.cmkVersion || ''
      },
      binding,
      createdAt: new Date()
    });

    vaultDoc.activeKid = newKid;
    vaultDoc.v = expectedVersion + 1;

    // CAS update via vaultStore.rotate() — throws OptimisticLockError on conflict
    try {
      await this._vaultStore.rotate(vaultDoc);
    } catch (e) {
      if (e.name === 'OptimisticLockError') {
        throw new Error(
          `Concurrent vault rotation detected for namespace: ${namespace}. Please retry.`
        );
      }
      throw e;
    }

    // Reload keys into cache
    await this._verifyAndLoadKeys(vaultDoc, namespace);
  }

  /**
   * Flush the DEK cache, securely destroying key material.
   */
  flushCache() {
    for (const [, entry] of this._cache) {
      this._destroyKeyMaterial(entry);
    }
    this._cache.clear();
  }

  // ===== Internal methods =====

  /**
   * Initialize a new vault for a namespace.
   * @private
   */
  async _initializeVault(namespace) {
    const dek = crypto.randomBytes(32);
    const hmacKey = crypto.randomBytes(32);

    const wrappedDek = await this._cmkProvider.wrap(dek);
    const wrappedHmk = await this._cmkProvider.wrap(hmacKey);

    const dekKcv = this._codec.computeKcv(dek, 'AES_256_GCM');
    const hmkKcv = this._codec.computeKcv(hmacKey, 'AES_256_GCM');
    const binding = this._codec.computeBinding(hmacKey, dek);

    const kid = this._generateKid(1);

    const now = new Date();
    const vaultDoc = {
      id: namespace,
      v: 1,
      status: 'ACTIVE',
      activeKid: kid,
      keys: [{
        kid,
        status: 'ACTIVE',
        dek: {
          wrapped: wrappedDek.ciphertext,
          algorithm: wrappedDek.algorithm,
          kcv: dekKcv,
          cmkVersion: wrappedDek.metadata?.cmkVersion || ''
        },
        hmk: {
          wrapped: wrappedHmk.ciphertext,
          algorithm: wrappedHmk.algorithm,
          kcv: hmkKcv,
          cmkVersion: wrappedHmk.metadata?.cmkVersion || ''
        },
        binding,
        createdAt: new Date()
      }],
      cmk: {
        provider: this._cmkProvider.getProviderId(),
        id: this._cmkProvider.getPublicReference()
      },
      createdAt: now,
      updatedAt: now
    };

    try {
      await this._vaultStore.save(vaultDoc);
    } catch (e) {
      if (e.code === 11000) {
        return this._vaultStore.load(namespace);
      }
      throw e;
    }

    return vaultDoc;
  }

  /**
   * Verify vault integrity (KCV + binding) and load keys into cache.
   * Aligned with Java verifyAndLoadKeys().
   * @private
   */
  async _verifyAndLoadKeys(vaultDoc, namespace) {
    if (!vaultDoc.keys || vaultDoc.keys.length === 0) {
      throw new Error(`Vault has no key entries for namespace: ${namespace}`);
    }

    const resolvedKeys = new Map();
    const resolvedKeysByVersion = new Map();
    let activeKid = null;
    let activeDekVersion = 0;
    let activeCount = 0;

    for (const keyEntry of vaultDoc.keys) {
      // Unwrap DEK
      const dek = await this._cmkProvider.unwrap({
        ciphertext: keyEntry.dek.wrapped,
        algorithm: keyEntry.dek.algorithm,
        metadata: { cmkVersion: keyEntry.dek.cmkVersion }
      });

      // Unwrap HMAC key
      const hmacKey = await this._cmkProvider.unwrap({
        ciphertext: keyEntry.hmk.wrapped,
        algorithm: keyEntry.hmk.algorithm,
        metadata: { cmkVersion: keyEntry.hmk.cmkVersion }
      });

      // Verify DEK KCV
      const dekKcv = this._codec.computeKcv(dek, 'AES_256_GCM');
      if (dekKcv !== keyEntry.dek.kcv) {
        throw new Error(
          `DEK KCV mismatch for kid ${keyEntry.kid}! Vault integrity compromised.`
        );
      }

      // Verify HMAC KCV
      const hmkKcv = this._codec.computeKcv(hmacKey, 'AES_256_GCM');
      if (hmkKcv !== keyEntry.hmk.kcv) {
        throw new Error(
          `HMAC Key KCV mismatch for kid ${keyEntry.kid}! Vault integrity compromised.`
        );
      }

      // Verify binding
      const binding = this._codec.computeBinding(hmacKey, dek);
      if (binding !== keyEntry.binding) {
        throw new Error(
          `Key binding mismatch for kid ${keyEntry.kid}! DEK/HMAC key pair corrupted.`
        );
      }

      const pair = { dek, hmacKey };
      resolvedKeys.set(keyEntry.kid, pair);

      const version = this._parseVersion(keyEntry.kid);
      resolvedKeysByVersion.set(version, pair);

      if (keyEntry.status === 'ACTIVE') {
        activeKid = keyEntry.kid;
        activeDekVersion = version;
        activeCount++;
      }
    }

    if (activeCount === 0) {
      throw new Error(`Vault has no ACTIVE key entry for namespace: ${namespace}`);
    }
    if (activeCount > 1) {
      throw new Error(`Vault has multiple ACTIVE key entries for namespace: ${namespace}`);
    }

    const cacheEntry = {
      activeKid,
      activeDekVersion,
      resolvedKeys,
      resolvedKeysByVersion,
      expiresAt: Date.now() + this._cacheTtl
    };

    this._cache.set(namespace, cacheEntry);
  }

  /**
   * Ensure a namespace is cached and return its entry.
   * @private
   */
  async _ensureCached(namespace) {
    const cached = this._getFromCache(namespace);
    if (cached) return cached;
    await this.ensureVaultInitialized(namespace);
    const entry = this._cache.get(namespace);
    if (!entry) {
      throw new Error(`Vault not initialized for namespace: ${namespace}`);
    }
    return entry;
  }

  /**
   * Get cache entry if valid (not expired).
   * @private
   */
  _getFromCache(namespace) {
    const entry = this._cache.get(namespace);
    if (entry && entry.expiresAt > Date.now()) {
      return entry;
    }
    if (entry) {
      this._destroyKeyMaterial(entry);
      this._cache.delete(namespace);
    }
    return null;
  }

  /**
   * Securely destroy key material in a cache entry.
   * @private
   */
  _destroyKeyMaterial(entry) {
    if (entry.resolvedKeys) {
      for (const [, pair] of entry.resolvedKeys) {
        if (pair.dek) crypto.randomFillSync(pair.dek);
        if (pair.hmacKey) crypto.randomFillSync(pair.hmacKey);
      }
    }
  }

  /**
   * Generate a kid in format "v{version}-{8 hex chars}".
   * @param {number} version
   * @returns {string}
   * @private
   */
  _generateKid(version) {
    const hex = crypto.randomBytes(4).toString('hex');
    return `v${version}-${hex}`;
  }

  /**
   * Parse version number from kid (e.g., "v1-a3b2c1d4" -> 1).
   * @param {string} kid
   * @returns {number}
   * @private
   */
  _parseVersion(kid) {
    const dashIdx = kid.indexOf('-');
    if (dashIdx < 2 || kid[0] !== 'v') {
      throw new Error(`Invalid kid format: ${kid}`);
    }
    const ver = parseInt(kid.substring(1, dashIdx), 10);
    if (isNaN(ver)) {
      throw new Error(`Invalid kid format: ${kid}`);
    }
    return ver;
  }
}

module.exports = KeyVaultService;

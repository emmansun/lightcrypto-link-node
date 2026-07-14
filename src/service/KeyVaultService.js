'use strict';

const crypto = require('crypto');
const { getKeyVaultModel } = require('../model/KeyVaultDocument');
const CryptoCodec = require('../crypto/CryptoCodec');

const DEFAULT_CACHE_TTL = 3600000; // 1 hour

/**
 * KeyVaultService - Manages per-entity DEK/HMAC key pairs with versioning,
 * rotation, KCV verification, and in-memory caching.
 */
class KeyVaultService {
  /**
   * @param {Object} options
   * @param {mongoose.Connection} options.connection - Mongoose connection
   * @param {CmkProvider} options.cmkProvider - CMK provider for key wrapping
   * @param {number} [options.cacheTtl=3600000] - Cache TTL in milliseconds
   */
  constructor(options) {
    this._connection = options.connection;
    this._cmkProvider = options.cmkProvider;
    this._cacheTtl = options.cacheTtl || DEFAULT_CACHE_TTL;
    this._codec = new CryptoCodec();
    this._cache = new Map();
  }

  /**
   * Ensure the vault is initialized for the given entity.
   * Creates vault document with initial DEK/HMAC key pair if not exists.
   * @param {string} entityName - Entity name (e.g., "User")
   * @returns {Promise<Object>} Cache entry with dek, hmacKey, activeKid
   */
  async ensureVaultInitialized(entityName) {
    // Check cache first
    const cached = this._getFromCache(entityName);
    if (cached) return cached;

    const vaultId = `lcl-dek-${entityName}`;
    const VaultModel = getKeyVaultModel(this._connection);

    let vaultDoc = await VaultModel.findById(vaultId);

    if (!vaultDoc) {
      // Initialize new vault
      vaultDoc = await this._initializeVault(VaultModel, vaultId, entityName);
    }

    // Load and cache keys
    return this._loadAndCacheKeys(vaultDoc, entityName);
  }

  /**
   * Get the active kid for an entity.
   * @param {string} entityName
   * @returns {Promise<string>}
   */
  async getActiveKid(entityName) {
    const entry = await this.ensureVaultInitialized(entityName);
    return entry.activeKid;
  }

  /**
   * Get the DEK for a specific kid.
   * @param {string} entityName
   * @param {string} kid
   * @returns {Promise<Buffer>}
   */
  async getDek(entityName, kid) {
    const entry = await this.ensureVaultInitialized(entityName);
    if (kid === entry.activeKid) {
      return entry.dek;
    }
    // Look up historical key
    const keyInfo = entry.allKeys?.get(kid);
    if (!keyInfo) {
      throw new Error(`Key not found for kid: ${kid} in vault for entity: ${entityName}`);
    }
    return keyInfo.dek;
  }

  /**
   * Get the HMAC key for a specific kid.
   * @param {string} entityName
   * @param {string} kid
   * @returns {Promise<Buffer>}
   */
  async getHmacKey(entityName, kid) {
    const entry = await this.ensureVaultInitialized(entityName);
    if (kid === entry.activeKid) {
      return entry.hmacKey;
    }
    const keyInfo = entry.allKeys?.get(kid);
    if (!keyInfo) {
      throw new Error(`Key not found for kid: ${kid} in vault for entity: ${entityName}`);
    }
    return keyInfo.hmacKey;
  }

  /**
   * Rotate the DEK for the given entity.
   * Marks current ACTIVE key as ROTATED and creates new ACTIVE key.
   * @param {string} entityName
   * @returns {Promise<Object>} New cache entry
   */
  async rotateDek(entityName) {
    const vaultId = `lcl-dek-${entityName}`;
    const VaultModel = getKeyVaultModel(this._connection);

    const vaultDoc = await VaultModel.findById(vaultId);
    if (!vaultDoc) {
      throw new Error(`Vault not found for entity: ${entityName}`);
    }

    // Find current active key
    const activeKey = vaultDoc.keys.find(k => k.status === 'ACTIVE');
    if (!activeKey) {
      throw new Error('No active key found in vault');
    }

    // Mark current as ROTATED
    activeKey.status = 'ROTATED';

    // Generate new key pair
    const newDek = crypto.randomBytes(32);
    const newHmacKey = crypto.randomBytes(32);

    // Wrap new keys
    const wrappedDek = await this._cmkProvider.wrap(newDek);
    const wrappedHmk = await this._cmkProvider.wrap(newHmacKey);

    // Compute KCV and binding
    const dekKcv = this._codec.computeKcv(newDek, 'AES_256_GCM');
    const hmkKcv = this._codec.computeKcv(newHmacKey, 'AES_256_GCM');
    const binding = this._codec.computeBinding(newHmacKey, newDek);

    // Generate new kid
    const newVersion = vaultDoc.v + 1;
    const newKid = this._generateKid(newVersion);

    // Add new key entry
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
    vaultDoc.v = newVersion;

    // Optimistic locking: update only if activeKid and v match
    const result = await VaultModel.updateOne(
      { _id: vaultId, activeKid: activeKey.kid, v: newVersion - 1 },
      {
        $set: {
          activeKid: newKid,
          v: newVersion,
          updatedAt: new Date(),
          'keys': vaultDoc.keys
        }
      }
    );

    if (result.modifiedCount === 0) {
      throw new Error(`Concurrent key rotation detected for entity: ${entityName}. Another rotation may be in progress.`);
    }

    // Update cache
    const cacheEntry = {
      dek: newDek,
      hmacKey: newHmacKey,
      activeKid: newKid,
      expiresAt: Date.now() + this._cacheTtl,
      allKeys: new Map()
    };

    // Populate allKeys for backward compatibility
    for (const keyEntry of vaultDoc.keys) {
      if (keyEntry.kid === newKid) {
        cacheEntry.allKeys.set(keyEntry.kid, { dek: newDek, hmacKey: newHmacKey });
      }
    }

    this._cache.set(entityName, cacheEntry);
    return cacheEntry;
  }

  /**
   * Flush the DEK cache, securely destroying key material.
   */
  flushCache() {
    for (const [entityName, entry] of this._cache) {
      // Securely destroy key buffers
      if (entry.dek) crypto.randomFillSync(entry.dek);
      if (entry.hmacKey) crypto.randomFillSync(entry.hmacKey);
      if (entry.allKeys) {
        for (const [, keyInfo] of entry.allKeys) {
          if (keyInfo.dek) crypto.randomFillSync(keyInfo.dek);
          if (keyInfo.hmacKey) crypto.randomFillSync(keyInfo.hmacKey);
        }
      }
    }
    this._cache.clear();
  }

  /**
   * Initialize a new vault for an entity.
   * @private
   */
  async _initializeVault(VaultModel, vaultId, entityName) {
    const dek = crypto.randomBytes(32);
    const hmacKey = crypto.randomBytes(32);

    // Wrap keys with CMK
    const wrappedDek = await this._cmkProvider.wrap(dek);
    const wrappedHmk = await this._cmkProvider.wrap(hmacKey);

    // Compute KCV and binding
    const dekKcv = this._codec.computeKcv(dek, 'AES_256_GCM');
    const hmkKcv = this._codec.computeKcv(hmacKey, 'AES_256_GCM');
    const binding = this._codec.computeBinding(hmacKey, dek);

    // Generate kid
    const kid = this._generateKid(1);

    const vaultDoc = new VaultModel({
      _id: vaultId,
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
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Use insertOne with ordered:false to handle race conditions
    try {
      await vaultDoc.save();
    } catch (e) {
      if (e.code === 11000) {
        // Duplicate key - another instance already initialized
        return VaultModel.findById(vaultId);
      }
      throw e;
    }

    return vaultDoc;
  }

  /**
   * Load vault document and cache the unwrapped keys.
   * @private
   */
  async _loadAndCacheKeys(vaultDoc, entityName) {
    const allKeys = new Map();
    let activeDek = null;
    let activeHmacKey = null;

    for (const keyEntry of vaultDoc.keys) {
      // Unwrap DEK — pass stored cmkVersion in metadata for CMK rotation support
      const dek = await this._cmkProvider.unwrap({
        ciphertext: keyEntry.dek.wrapped,
        algorithm: keyEntry.dek.algorithm,
        metadata: { cmkVersion: keyEntry.dek.cmkVersion }
      });

      // Unwrap HMAC key — pass stored cmkVersion in metadata for CMK rotation support
      const hmacKey = await this._cmkProvider.unwrap({
        ciphertext: keyEntry.hmk.wrapped,
        algorithm: keyEntry.hmk.algorithm,
        metadata: { cmkVersion: keyEntry.hmk.cmkVersion }
      });

      // Verify KCV
      const dekKcv = this._codec.computeKcv(dek, 'AES_256_GCM');
      if (dekKcv !== keyEntry.dek.kcv) {
        throw new Error(`KCV mismatch for DEK (kid: ${keyEntry.kid}) in vault: ${entityName}. Expected: ${keyEntry.dek.kcv}, got: ${dekKcv}`);
      }

      const hmkKcv = this._codec.computeKcv(hmacKey, 'AES_256_GCM');
      if (hmkKcv !== keyEntry.hmk.kcv) {
        throw new Error(`KCV mismatch for HMAC key (kid: ${keyEntry.kid}) in vault: ${entityName}. Expected: ${keyEntry.hmk.kcv}, got: ${hmkKcv}`);
      }

      // Verify binding
      const binding = this._codec.computeBinding(hmacKey, dek);
      if (binding !== keyEntry.binding) {
        throw new Error(`Binding mismatch for key (kid: ${keyEntry.kid}) in vault: ${entityName}. Expected: ${keyEntry.binding}, got: ${binding}`);
      }

      allKeys.set(keyEntry.kid, { dek, hmacKey });

      if (keyEntry.kid === vaultDoc.activeKid) {
        activeDek = dek;
        activeHmacKey = hmacKey;
      }
    }

    if (!activeDek) {
      throw new Error(`No active DEK found for entity: ${entityName}`);
    }

    const cacheEntry = {
      dek: activeDek,
      hmacKey: activeHmacKey,
      activeKid: vaultDoc.activeKid,
      expiresAt: Date.now() + this._cacheTtl,
      allKeys
    };

    this._cache.set(entityName, cacheEntry);
    return cacheEntry;
  }

  /**
   * Get cache entry if valid (not expired).
   * @private
   */
  _getFromCache(entityName) {
    const entry = this._cache.get(entityName);
    if (entry && entry.expiresAt > Date.now()) {
      return entry;
    }
    if (entry) {
      // Expired - destroy key material
      if (entry.dek) crypto.randomFillSync(entry.dek);
      if (entry.hmacKey) crypto.randomFillSync(entry.hmacKey);
      this._cache.delete(entityName);
    }
    return null;
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
}

module.exports = KeyVaultService;

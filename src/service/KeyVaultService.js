'use strict';

const crypto = require('crypto');
const CryptoCodec = require('../crypto/CryptoCodec');
const NoOpEventBus = require('../event/NoOpEventBus');
const LclEvent = require('../event/LclEvent');
const EventTier = require('../event/EventTier');
const KeyResolutionError = require('../error/KeyResolutionError');

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
   * @param {EventBus} [options.eventBus] - EventBus for observability events (default NoOpEventBus)
   */
  constructor(options) {
    this._vaultStore = options.vaultStore;
    this._cmkProvider = options.cmkProvider;
    this._cacheTtl = options.cacheTtl || DEFAULT_CACHE_TTL;
    this._eventBus = options.eventBus || NoOpEventBus.INSTANCE;
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

    await this._populateCache(vaultDoc, namespace);
  }

  /**
   * Get the active kid for a namespace.
   * @param {string} namespace - Canonical namespace
   * @returns {Promise<string>}
   */
  async getActiveKid(namespace) {
    const entry = await this._ensureCachedForEncrypt(namespace);
    return entry.activeKid;
  }

  /**
   * Get the active DEK version for a namespace.
   * @param {string} namespace - Canonical namespace
   * @returns {Promise<number>}
   */
  async getActiveDekVersion(namespace) {
    const entry = await this._ensureCachedForEncrypt(namespace);
    return entry.activeDekVersion;
  }

  /**
   * Get active key pair metadata for a namespace.
   * @param {string} namespace - Canonical namespace
   * @returns {Promise<{activeKid: string, activeDekVersion: number, dek: Buffer, hmacKey: Buffer}>}
   */
  async getActiveKeyPair(namespace) {
    const entry = await this._ensureCachedForEncrypt(namespace);
    const pair = entry.resolvedKeys.get(entry.activeKid);
    if (!pair) {
      throw new KeyResolutionError(`Active key pair not found for namespace: ${namespace}`, {
        namespace,
        kid: entry.activeKid,
        vaultExists: true
      });
    }
    return {
      activeKid: entry.activeKid,
      activeDekVersion: entry.activeDekVersion,
      dek: pair.dek,
      hmacKey: pair.hmacKey
    };
  }

  /**
   * Get key pair for a specific namespace and kid.
   * @param {string} namespace - Canonical namespace
   * @param {string} kid - Key identifier
   * @returns {Promise<{dek: Buffer, hmacKey: Buffer}>}
   */
  async getKeyPair(namespace, kid) {
    const entry = await this._ensureCachedForDecrypt(namespace);
    const pair = entry.resolvedKeys.get(kid);
    if (!pair) {
      throw new KeyResolutionError(`Unknown kid for namespace ${namespace}: ${kid}`, {
        namespace,
        kid,
        vaultExists: true
      });
    }
    return pair;
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
    throw new KeyResolutionError(`Unknown kid: ${kid}`, { kid, vaultExists: true });
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
    throw new KeyResolutionError(`Unknown kid: ${kid}`, { kid, vaultExists: true });
  }

  /**
   * Get the active HMAC key for the given namespace.
   * @param {string} namespace - Canonical namespace
   * @returns {Promise<Buffer>}
   */
  async getActiveHmacKey(namespace) {
    const pair = await this.getActiveKeyPair(namespace);
    return pair.hmacKey;
  }

  /**
   * Get the unwrapped DEK for a specific namespace and DEK version.
   * @param {string} namespace - Canonical namespace
   * @param {number} dekVersion - DEK version number
   * @returns {Promise<Buffer>}
   * @throws {KeyResolutionError} If the key entry has been retired
   */
  async getDekByVersion(namespace, dekVersion) {
    const entry = await this._ensureCachedForDecrypt(namespace);
    const pair = entry.resolvedKeysByVersion.get(dekVersion);
    if (!pair) {
      throw new KeyResolutionError(`No key found for namespace ${namespace} with dekVersion ${dekVersion}`, {
        namespace,
        dekVersion,
        vaultExists: true
      });
    }
    // Check if the key has been retired
    const kid = entry.versionToKid.get(dekVersion);
    if (kid && entry.keyStatuses.get(kid) === 'RETIRED') {
      throw new KeyResolutionError(
        `Key for namespace ${namespace} with dekVersion ${dekVersion} has been retired`,
        { namespace, dekVersion, kid, vaultExists: true }
      );
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
    await this._populateCache(vaultDoc, namespace);
  }

  /**
   * Re-wrap all key entries in a namespace's vault under a new CMK provider.
   * Does NOT generate new DEK/HMAC key material — only changes the wrapping layer.
   *
   * @param {string} namespace - Canonical namespace (e.g., "default.default.User#phone")
   * @param {CmkProvider} targetProvider - The target CMK provider to re-wrap keys with
   * @param {Object} [options] - Optional parameters
   * @param {boolean} [options.dryRun=false] - If true, perform validation only without persisting
   * @returns {Promise<Object>} RewrapResult: { namespace, success, skipped, dryRun, keyCount, error, durationMicros }
   */
  async rewrapVault(namespace, targetProvider, options = {}) {
    const startTime = process.hrtime.bigint();
    const dryRun = options.dryRun === true;

    try {
      // Load vault document
      const vaultDoc = await this._vaultStore.load(namespace);
      if (!vaultDoc) {
        throw new Error(`Vault not found for namespace: ${namespace}`);
      }

      // Same-provider skip: both providerId AND publicReference must match
      const targetProviderId = targetProvider.getProviderId();
      const targetPublicRef = targetProvider.getPublicReference();
      if (vaultDoc.cmk.provider === targetProviderId && vaultDoc.cmk.id === targetPublicRef) {
        const durationMicros = Number(process.hrtime.bigint() - startTime) / 1000;
        return {
          namespace,
          success: true,
          skipped: true,
          dryRun,
          keyCount: vaultDoc.keys.length,
          error: null,
          durationMicros
        };
      }

      // Unwrap all entries and verify KCV/binding invariance
      const unwrappedEntries = [];
      for (const keyEntry of vaultDoc.keys) {
        const dek = await this._cmkProvider.unwrap({
          ciphertext: keyEntry.dek.wrapped,
          algorithm: keyEntry.dek.algorithm,
          metadata: { cmkVersion: keyEntry.dek.cmkVersion }
        });

        const hmacKey = await this._cmkProvider.unwrap({
          ciphertext: keyEntry.hmk.wrapped,
          algorithm: keyEntry.hmk.algorithm,
          metadata: { cmkVersion: keyEntry.hmk.cmkVersion }
        });

        // Verify KCV invariance
        const dekKcv = this._codec.computeKcv(dek, 'AES_256_GCM');
        if (dekKcv !== keyEntry.dek.kcv) {
          throw new Error(
            `DEK KCV mismatch for kid ${keyEntry.kid} during re-wrap! Vault integrity compromised.`
          );
        }

        const hmkKcv = this._codec.computeKcv(hmacKey, 'AES_256_GCM');
        if (hmkKcv !== keyEntry.hmk.kcv) {
          throw new Error(
            `HMAC Key KCV mismatch for kid ${keyEntry.kid} during re-wrap! Vault integrity compromised.`
          );
        }

        // Verify binding invariance
        const binding = this._codec.computeBinding(hmacKey, dek);
        if (binding !== keyEntry.binding) {
          throw new Error(
            `Key binding mismatch for kid ${keyEntry.kid} during re-wrap! DEK/HMAC key pair corrupted.`
          );
        }

        unwrappedEntries.push({ keyEntry, dek, hmacKey });
      }

      // Re-wrap with target provider and perform post-rewrap roundtrip verification
      const rewrappedKeys = [];
      for (const { keyEntry, dek, hmacKey } of unwrappedEntries) {
        const wrappedDek = await targetProvider.wrap(dek);
        const wrappedHmk = await targetProvider.wrap(hmacKey);

        // Post-rewrap roundtrip verification: unwrap with target and confirm material matches
        const verifyDek = await targetProvider.unwrap({
          ciphertext: wrappedDek.ciphertext,
          algorithm: wrappedDek.algorithm,
          metadata: wrappedDek.metadata || {}
        });
        if (!verifyDek.equals(dek)) {
          throw new Error(
            `Post-rewrap DEK roundtrip verification failed for kid ${keyEntry.kid}! Target provider misconfigured.`
          );
        }

        const verifyHmk = await targetProvider.unwrap({
          ciphertext: wrappedHmk.ciphertext,
          algorithm: wrappedHmk.algorithm,
          metadata: wrappedHmk.metadata || {}
        });
        if (!verifyHmk.equals(hmacKey)) {
          throw new Error(
            `Post-rewrap HMAC key roundtrip verification failed for kid ${keyEntry.kid}! Target provider misconfigured.`
          );
        }

        rewrappedKeys.push({
          kid: keyEntry.kid,
          status: keyEntry.status,
          dek: {
            wrapped: wrappedDek.ciphertext,
            algorithm: wrappedDek.algorithm,
            kcv: keyEntry.dek.kcv,
            cmkVersion: wrappedDek.metadata?.cmkVersion || ''
          },
          hmk: {
            wrapped: wrappedHmk.ciphertext,
            algorithm: wrappedHmk.algorithm,
            kcv: keyEntry.hmk.kcv,
            cmkVersion: wrappedHmk.metadata?.cmkVersion || ''
          },
          binding: keyEntry.binding,
          createdAt: keyEntry.createdAt
        });
      }

      // Dry-run: validation complete, do not persist
      if (dryRun) {
        const durationMicros = Number(process.hrtime.bigint() - startTime) / 1000;
        return {
          namespace,
          success: true,
          skipped: false,
          dryRun: true,
          keyCount: vaultDoc.keys.length,
          error: null,
          durationMicros
        };
      }

      // Build updated vault document
      vaultDoc.keys = rewrappedKeys;
      vaultDoc.cmk = {
        provider: targetProviderId,
        id: targetPublicRef
      };
      vaultDoc.v = vaultDoc.v + 1;
      vaultDoc.updatedAt = new Date();

      // Persist via VaultStore.rotate() with optimistic locking
      try {
        await this._vaultStore.rotate(vaultDoc);
      } catch (e) {
        if (e.name === 'OptimisticLockError') {
          throw new Error(
            `Concurrent modification detected during re-wrap for namespace: ${namespace}. ` +
            `Another rotation or re-wrap may be in progress. Please retry.`
          );
        }
        throw e;
      }

      // Evict cache entry so subsequent operations reload with new provider
      const cached = this._cache.get(namespace);
      if (cached) {
        this._destroyKeyMaterial(cached);
        this._cache.delete(namespace);
      }

      const durationMicros = Number(process.hrtime.bigint() - startTime) / 1000;

      // Emit success event
      this._eventBus.emit(
        LclEvent.builder()
          .event('lcl.rewrap.namespace.completed')
          .tier(EventTier.L2)
          .result('success')
          .namespace(namespace)
          .durationMicros(durationMicros)
          .build()
      );

      return {
        namespace,
        success: true,
        skipped: false,
        dryRun: false,
        keyCount: vaultDoc.keys.length,
        error: null,
        durationMicros
      };
    } catch (err) {
      const durationMicros = Number(process.hrtime.bigint() - startTime) / 1000;

      // Emit failure event
      this._eventBus.emit(
        LclEvent.builder()
          .event('lcl.rewrap.namespace.failed')
          .tier(EventTier.L2)
          .result('failed')
          .namespace(namespace)
          .errorType(err.name || 'Error')
          .durationMicros(durationMicros)
          .build()
      );

      return {
        namespace,
        success: false,
        skipped: false,
        dryRun,
        keyCount: 0,
        error: err.message,
        durationMicros
      };
    }
  }

  /**
   * Re-wrap all vaults under a new CMK provider with per-namespace error isolation.
   *
   * @param {CmkProvider} targetProvider - The target CMK provider to re-wrap keys with
   * @param {Object} [options] - Optional parameters
   * @param {boolean} [options.dryRun=false] - If true, perform validation only without persisting
   * @returns {Promise<Object[]>} Array of RewrapResult objects
   */
  async rewrapAllVaults(targetProvider, options = {}) {
    const batchStart = process.hrtime.bigint();

    const allDocs = await this._vaultStore.loadAll();
    const results = [];

    for (const doc of allDocs) {
      const result = await this.rewrapVault(doc.id, targetProvider, options);
      results.push(result);
    }

    const totalDurationMicros = Number(process.hrtime.bigint() - batchStart) / 1000;
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    // Emit batch completion event
    this._eventBus.emit(
      LclEvent.builder()
        .event('lcl.rewrap.batch.completed')
        .tier(EventTier.L2)
        .result('success')
        .durationMicros(totalDurationMicros)
        .attributes(new Map([
          ['totalCount', String(results.length)],
          ['successCount', String(successCount)],
          ['failedCount', String(failedCount)],
          ['totalDurationMicros', String(totalDurationMicros)]
        ]))
        .build()
    );

    return results;
  }

  /**
   * Mark specified ROTATED key entries as RETIRED.
   * Only ROTATED keys can be retired; ACTIVE keys are skipped without error.
   * @param {string} namespace - Canonical namespace
   * @param {string[]} kids - Array of key identifiers to retire
   * @returns {Promise<void>}
   */
  async markKeysRetired(namespace, kids) {
    const vaultDoc = await this._vaultStore.load(namespace);
    if (!vaultDoc) {
      throw new Error(`Vault not found for namespace: ${namespace}`);
    }

    const kidSet = new Set(kids);
    let modified = false;

    for (const keyEntry of vaultDoc.keys) {
      if (kidSet.has(keyEntry.kid) && keyEntry.status === 'ROTATED') {
        keyEntry.status = 'RETIRED';
        modified = true;
      }
    }

    if (!modified) return;

    vaultDoc.v = vaultDoc.v + 1;
    vaultDoc.updatedAt = new Date();

    try {
      await this._vaultStore.rotate(vaultDoc);
    } catch (e) {
      if (e.name === 'OptimisticLockError') {
        throw new Error(
          `Concurrent modification detected during markKeysRetired for namespace: ${namespace}. Please retry.`
        );
      }
      throw e;
    }

    // Reload cache
    await this._populateCache(vaultDoc, namespace);
  }

  /**
   * Permanently remove all RETIRED key entries from the vault document.
   * @param {string} namespace - Canonical namespace
   * @returns {Promise<number>} Number of pruned entries
   */
  async pruneRetiredKeys(namespace) {
    const vaultDoc = await this._vaultStore.load(namespace);
    if (!vaultDoc) {
      throw new Error(`Vault not found for namespace: ${namespace}`);
    }

    const retiredCount = vaultDoc.keys.filter(k => k.status === 'RETIRED').length;
    if (retiredCount === 0) return 0;

    vaultDoc.keys = vaultDoc.keys.filter(k => k.status !== 'RETIRED');
    vaultDoc.v = vaultDoc.v + 1;
    vaultDoc.updatedAt = new Date();

    try {
      await this._vaultStore.rotate(vaultDoc);
    } catch (e) {
      if (e.name === 'OptimisticLockError') {
        throw new Error(
          `Concurrent modification detected during pruneRetiredKeys for namespace: ${namespace}. Please retry.`
        );
      }
      throw e;
    }

    // Reload cache
    await this._populateCache(vaultDoc, namespace);
    return retiredCount;
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
   * @param {Object} vaultDoc - Vault document
   * @param {string} namespace - Canonical namespace
   * @returns {Object} Cache entry
   * @private
   */
  async _populateCache(vaultDoc, namespace) {
    if (!vaultDoc.keys || vaultDoc.keys.length === 0) {
      throw new Error(`Vault has no key entries for namespace: ${namespace}`);
    }

    const resolvedKeys = new Map();
    const resolvedKeysByVersion = new Map();
    const keyStatuses = new Map();
    const versionToKid = new Map();
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
      keyStatuses.set(keyEntry.kid, keyEntry.status);
      versionToKid.set(version, keyEntry.kid);

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
      keyStatuses,
      versionToKid,
      expiresAt: Date.now() + this._cacheTtl
    };

    this._cache.set(namespace, cacheEntry);
    return cacheEntry;
  }

  /**
   * Ensure a namespace is cached for encryption operations.
   * May create vault if not exists (encrypt path behavior).
   * @param {string} namespace - Canonical namespace
   * @returns {Promise<Object>} Cache entry
   * @private
   */
  async _ensureCachedForEncrypt(namespace) {
    const cached = this._getFromCache(namespace);
    if (cached) return cached;
    await this.ensureVaultInitialized(namespace);
    const entry = this._cache.get(namespace);
    if (!entry) {
      throw new KeyResolutionError(`Vault not initialized for namespace: ${namespace}`, {
        namespace,
        vaultExists: false
      });
    }
    return entry;
  }

  /**
   * Ensure a namespace is cached for decryption operations.
   * Read-only: throws KeyResolutionError if vault does not exist.
   * @param {string} namespace - Canonical namespace
   * @returns {Promise<Object>} Cache entry
   * @private
   */
  async _ensureCachedForDecrypt(namespace) {
    const cached = this._getFromCache(namespace);
    if (cached) return cached;
    const vaultDoc = await this._vaultStore.load(namespace);
    if (!vaultDoc) {
      throw new KeyResolutionError(`Vault not found for namespace: ${namespace}`, {
        namespace,
        vaultExists: false
      });
    }
    return this._populateCache(vaultDoc, namespace);
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

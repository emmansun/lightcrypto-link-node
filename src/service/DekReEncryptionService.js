'use strict';

const CryptoCodec = require('../crypto/CryptoCodec');
const WireFormatDecoder = require('../format/WireFormatDecoder');
const BlindIndexEngine = require('../blindindex/BlindIndexEngine');
const Namespace = require('../namespace/Namespace');
const NoOpEventBus = require('../event/NoOpEventBus');
const LclEvent = require('../event/LclEvent');
const EventTier = require('../event/EventTier');
const { createScanOptions } = require('../spi/ScanOptions');

const DEFAULT_CHECKPOINT_INTERVAL = 10; // batches

/**
 * DekReEncryptionService — orchestration engine for DEK re-encryption.
 *
 * Scans documents via DocumentRewriteStore, decrypts fields with old DEK,
 * re-encrypts with active DEK, recomputes blind index, and writes back
 * via CAS-protected replacement.
 *
 * Aligned with Java DekReEncryptionService.
 */
class DekReEncryptionService {
  /**
   * @param {Object} options
   * @param {import('./KeyVaultService')} options.keyVaultService - KeyVaultService instance
   * @param {import('../spi/StorageAdapter')} options.storageAdapter - StorageAdapter for payload format
   * @param {import('../spi/StructuredValueCodec')} [options.structuredValueCodec] - Codec for structured types
   * @param {import('../spi/DocumentRewriteStore')} options.rewriteStore - DocumentRewriteStore implementation
   * @param {import('../event/EventBus')} [options.eventBus] - EventBus for observability
   */
  constructor(options) {
    if (!options.keyVaultService) throw new Error('keyVaultService is required');
    if (!options.storageAdapter) throw new Error('storageAdapter is required');
    if (!options.rewriteStore) throw new Error('rewriteStore is required');

    this._keyVaultService = options.keyVaultService;
    this._storageAdapter = options.storageAdapter;
    this._structuredValueCodec = options.structuredValueCodec || null;
    this._rewriteStore = options.rewriteStore;
    this._eventBus = options.eventBus || NoOpEventBus.INSTANCE;
    this._codec = new CryptoCodec();
    this._blindIndexEngine = new BlindIndexEngine();
  }

  /**
   * Re-encrypt all documents in a collection for the specified field configs.
   *
   * @param {string} collection - Collection name/hint for the rewrite store
   * @param {Object[]} fieldConfigs - Array of field config objects
   * @param {string} fieldConfigs[].path - Document field path
   * @param {string} fieldConfigs[].namespace - Full canonical namespace
   * @param {boolean} [fieldConfigs[].blindIndex=false] - Whether to recompute blind index
   * @param {string} [fieldConfigs[].blindIndexFieldName] - Field name for blind index
   * @param {string|null} [fieldConfigs[].structuredType=null] - null=scalar, 'DOC', 'COL', 'MAP'
   * @param {Object} [options] - Options
   * @param {boolean} [options.dryRun=false] - Scan + count without writes
   * @param {string} [options.taskId] - Task ID for checkpoint resume
   * @param {number} [options.batchSize=500] - Documents per batch
   * @param {number} [options.checkpointInterval=10] - Save checkpoint every N batches
   * @param {string} [options.algorithm='AES_256_GCM'] - Encryption algorithm
   * @returns {Promise<Object>} ReEncryptResult
   */
  async reEncrypt(collection, fieldConfigs, options = {}) {
    const startTime = process.hrtime.bigint();
    const dryRun = options.dryRun === true;
    const algorithm = options.algorithm || 'AES_256_GCM';
    const batchSize = options.batchSize || 500;
    const checkpointInterval = options.checkpointInterval || DEFAULT_CHECKPOINT_INTERVAL;
    const taskId = options.taskId || null;

    // Resolve namespaces and active key info per field config
    const resolvedConfigs = [];
    for (const fc of fieldConfigs) {
      const ns = Namespace.parse(fc.namespace);
      const canonical = ns.canonical();
      await this._keyVaultService.ensureVaultInitialized(canonical);
      const activeKeyPair = await this._keyVaultService.getActiveKeyPair(canonical);
      resolvedConfigs.push({
        path: fc.path,
        namespace: ns,
        canonical,
        blindIndex: fc.blindIndex === true,
        blindIndexFieldName: fc.blindIndexFieldName || fc.path,
        structuredType: fc.structuredType || null,
        activeKid: activeKeyPair.activeKid,
        activeDekVersion: activeKeyPair.activeDekVersion,
        activeDek: activeKeyPair.dek,
        activeHmacKey: activeKeyPair.hmacKey
      });
    }

    // Load checkpoint if taskId provided
    let resumeAfter = null;
    if (taskId) {
      resumeAfter = await this._rewriteStore.loadCheckpoint(taskId);
    }

    const scanOptions = createScanOptions({
      collectionHint: collection,
      batchSize,
      resumeAfter
    });

    let docsProcessed = 0;
    let docsSkipped = 0;
    let docsFailed = 0;
    let fieldsReEncrypted = 0;
    const oldKids = new Set();
    let batchCount = 0;
    let pendingBatch = [];

    for await (const rawDoc of this._rewriteStore.scan(scanOptions)) {
      docsProcessed++;
      let docModified = false;
      const updatedFields = {};
      const casConditions = {};

      for (const config of resolvedConfigs) {
        const fieldValue = rawDoc.fields[config.path];

        // Skip non-encrypted or missing fields
        if (!fieldValue || typeof fieldValue !== 'object' || fieldValue._e !== 1) {
          continue;
        }

        // Extract blob and decode wire format to get dekVersion
        const blob = this._storageAdapter.extractBlob(fieldValue);
        if (!blob) continue;

        let decoded;
        try {
          decoded = typeof blob === 'string'
            ? WireFormatDecoder.decodeFromBase64Url(blob)
            : WireFormatDecoder.decode(blob);
        } catch {
          docsFailed++;
          continue;
        }

        // Skip if already at active version
        if (decoded.dekVersion === config.activeDekVersion) {
          continue;
        }

        if (dryRun) {
          fieldsReEncrypted++;
          docModified = true;
          oldKids.add(fieldValue._k);
          continue;
        }

        try {
          // Decrypt with old DEK
          const oldDek = await this._keyVaultService.getDekByVersion(config.canonical, decoded.dekVersion);
          const plaintext = this._codec.decrypt(oldDek, blob, decoded.algorithm);

          // Re-encrypt with active DEK
          const newBlob = this._codec.encrypt(
            config.activeDek,
            plaintext,
            algorithm,
            config.namespace,
            config.activeDekVersion
          );

          // Recompute blind index if enabled
          let newBlindIndex = null;
          if (config.blindIndex) {
            const plaintextStr = plaintext.toString('utf8');
            newBlindIndex = this._blindIndexEngine.compute(
              config.activeHmacKey,
              config.namespace,
              config.blindIndexFieldName,
              plaintextStr
            );
          }

          // Build new payload
          const typeMarker = this._storageAdapter.extractTypeMarker(fieldValue) || 'STR';
          const newPayload = this._storageAdapter.buildEncryptedPayload(newBlob, typeMarker, newBlindIndex);
          newPayload._k = config.activeKid;
          newPayload._a = algorithm;

          updatedFields[config.path] = newPayload;
          casConditions[config.path] = fieldValue._k; // old kid for CAS
          docModified = true;
          fieldsReEncrypted++;
          oldKids.add(fieldValue._k);
        } catch {
          docsFailed++;
        }
      }

      if (docModified && !dryRun) {
        // Build updated raw document for replace
        const replaceDoc = {
          id: rawDoc.id,
          fields: updatedFields,
          casConditions,
          _collectionHint: collection
        };
        pendingBatch.push(replaceDoc);
      } else if (!docModified) {
        docsSkipped++;
      }

      // Flush batch
      if (pendingBatch.length >= batchSize) {
        const successCount = await this._rewriteStore.replaceBatch(pendingBatch);
        docsSkipped += (pendingBatch.length - successCount);
        batchCount++;

        this._emitBatchEvent(collection, docsProcessed, docsSkipped, docsFailed);

        // Checkpoint
        if (taskId && batchCount % checkpointInterval === 0) {
          await this._rewriteStore.saveCheckpoint(taskId, String(rawDoc.id));
        }

        pendingBatch = [];
      }
    }

    // Flush remaining batch
    if (pendingBatch.length > 0) {
      const successCount = await this._rewriteStore.replaceBatch(pendingBatch);
      docsSkipped += (pendingBatch.length - successCount);
      batchCount++;

      this._emitBatchEvent(collection, docsProcessed, docsSkipped, docsFailed);

      pendingBatch = [];
    }

    // Final checkpoint
    if (taskId && !dryRun) {
      await this._rewriteStore.saveCheckpoint(taskId, '__COMPLETED__');
    }

    // Mark keys retired on full success
    if (docsFailed === 0 && !dryRun && oldKids.size > 0) {
      // Group old kids by namespace and mark retired
      const namespaceKids = new Map();
      for (const config of resolvedConfigs) {
        if (!namespaceKids.has(config.canonical)) {
          namespaceKids.set(config.canonical, []);
        }
      }
      for (const kid of oldKids) {
        for (const [ns] of namespaceKids) {
          namespaceKids.get(ns).push(kid);
        }
      }
      for (const [ns, kids] of namespaceKids) {
        await this._keyVaultService.markKeysRetired(ns, kids);
      }
    }

    const durationMicros = Number(process.hrtime.bigint() - startTime) / 1000;

    // Emit completion event
    this._emitCompletionEvent(collection, docsProcessed, docsSkipped, docsFailed, fieldsReEncrypted, durationMicros);

    return {
      namespace: collection,
      docsProcessed,
      docsSkipped,
      docsFailed,
      fieldsReEncrypted,
      durationMicros,
      dryRun
    };
  }

  /**
   * Re-encrypt multiple collections with per-collection error isolation.
   *
   * @param {Object[]} fieldConfigSets - Array of { collection, fieldConfigs } objects
   * @param {Object} [options] - Shared options (same as reEncrypt)
   * @returns {Promise<Object[]>} Array of ReEncryptResult objects
   */
  async reEncryptAll(fieldConfigSets, options = {}) {
    const results = [];

    for (const { collection, fieldConfigs } of fieldConfigSets) {
      try {
        const result = await this.reEncrypt(collection, fieldConfigs, options);
        results.push(result);
      } catch (err) {
        results.push({
          namespace: collection,
          docsProcessed: 0,
          docsSkipped: 0,
          docsFailed: 0,
          fieldsReEncrypted: 0,
          durationMicros: 0,
          dryRun: options.dryRun === true,
          error: err.message
        });
      }
    }

    return results;
  }

  /**
   * Emit batch completed event.
   * @private
   */
  _emitBatchEvent(collection, docsProcessed, docsSkipped, docsFailed) {
    this._eventBus.emit(
      LclEvent.builder()
        .event('lcl.reencrypt.batch.completed')
        .tier(EventTier.L2)
        .result('success')
        .namespace(collection)
        .attributes(new Map([
          ['docsProcessed', String(docsProcessed)],
          ['docsSkipped', String(docsSkipped)],
          ['docsFailed', String(docsFailed)]
        ]))
        .build()
    );
  }

  /**
   * Emit namespace completed event.
   * @private
   */
  _emitCompletionEvent(collection, docsProcessed, docsSkipped, docsFailed, fieldsReEncrypted, durationMicros) {
    this._eventBus.emit(
      LclEvent.builder()
        .event('lcl.reencrypt.namespace.completed')
        .tier(EventTier.L2)
        .result('success')
        .namespace(collection)
        .durationMicros(durationMicros)
        .attributes(new Map([
          ['docsProcessed', String(docsProcessed)],
          ['docsSkipped', String(docsSkipped)],
          ['docsFailed', String(docsFailed)],
          ['fieldsReEncrypted', String(fieldsReEncrypted)]
        ]))
        .build()
    );
  }
}

module.exports = DekReEncryptionService;

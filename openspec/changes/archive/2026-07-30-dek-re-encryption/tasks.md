## 1. SPI Layer — DocumentRewriteStore

- [x] 1.1 Create `src/spi/DocumentRewriteStore.js` — abstract class with `scan(scanOptions)` (AsyncIterator), `replace(rawDocument)`, `replaceBatch(rawDocuments)`, `saveCheckpoint(taskId, cursorState)`, `loadCheckpoint(taskId)`
- [x] 1.2 Create `src/spi/RawDocument.js` — plain object factory: `{ id, fields, casConditions }` (casConditions: map of field path → old kid for CAS)
- [x] 1.3 Create `src/spi/ScanOptions.js` — plain object factory: `{ collectionHint, batchSize (default 500), resumeAfter, maxScanTimeMs }`

## 2. Key Status — RETIRED

- [x] 2.1 Add `RETIRED` status handling in `KeyVaultService`: `getDekByVersion` throws `KeyResolutionError` if resolved entry status is RETIRED
- [x] 2.2 Implement `KeyVaultService.markKeysRetired(namespace, kids)` — transition ROTATED → RETIRED, persist via `VaultStore.rotate()`
- [x] 2.3 Implement `KeyVaultService.pruneRetiredKeys(namespace)` — remove RETIRED entries from keys[], persist atomically
- [x] 2.4 Unit tests for RETIRED lifecycle (mark, prune, guard on getDekByVersion)

## 3. DekReEncryptionService Engine

- [x] 3.1 Create `src/service/DekReEncryptionService.js` — constructor accepts `{ keyVaultService, storageAdapter, structuredValueCodec, rewriteStore, eventBus }`
- [x] 3.2 Implement `reEncrypt(collection, fieldConfigs, options)` — scan → per-field: decode wire format → skip if active version → decrypt(old DEK) → encrypt(active DEK) → recompute blind index → build new payload → CAS replace → checkpoint
- [x] 3.3 Implement `reEncryptAll(fieldConfigSets, options)` — iterate multiple collections, per-collection error isolation, return `ReEncryptResult[]`
- [x] 3.4 Support `options.dryRun` — full scan + count but no writes
- [x] 3.5 Support `options.taskId` + checkpoint interval — save checkpoint every N batches via `rewriteStore.saveCheckpoint()`
- [x] 3.6 On completion (docsFailed === 0 && !dryRun): call `keyVaultService.markKeysRetired()` for old kids
- [x] 3.7 Emit `lcl.reencrypt.batch.completed` (L2) per batch and `lcl.reencrypt.namespace.completed` (L2) on completion

## 4. MongoDB Adapter — MongoDocumentRewriteStore

- [x] 4.1 Create `src/adapter/MongoDocumentRewriteStore.js` — constructor accepts `{ db }` (native mongodb Db instance)
- [x] 4.2 Implement `scan(scanOptions)` — `collection.find(filter).sort({ _id: 1 }).batchSize(N)`, yield RawDocument with casConditions from encrypted fields' `_k`
- [x] 4.3 Implement `replace(rawDocument)` — `updateOne({ _id, ...casFilter }, { $set: updatedFields })`, return `modifiedCount > 0`
- [x] 4.4 Implement `replaceBatch(rawDocuments)` — `bulkWrite(ordered: false)` with per-doc CAS filters, return successful count
- [x] 4.5 Implement checkpoint: `saveCheckpoint` upserts to `__lcl_checkpoints` collection; `loadCheckpoint` returns cursorState or null
- [x] 4.6 Resume: when `scanOptions.resumeAfter` is set, add `{ _id: { $gt: resumeAfter } }` to scan filter

## 5. Unit Tests

- [x] 5.1 Create `test/unit/service/DekReEncryptionService.test.js` — mock DocumentRewriteStore + InMemoryVaultStore: verify decrypt → re-encrypt → BI recompute → replace flow
- [x] 5.2 Test: dekVersion == active → skip (no replace call)
- [x] 5.3 Test: CAS conflict (replace returns false) → docsSkipped incremented
- [x] 5.4 Test: checkpoint save/load → resume skips processed docs
- [x] 5.5 Test: completion → markKeysRetired called with old kids
- [x] 5.6 Test: dryRun → no replace calls, result.dryRun === true
- [x] 5.7 Test: blind index recomputed with active HMAC key (assert new `b` value differs from old)
- [x] 5.8 Create `test/unit/adapter/MongoDocumentRewriteStore.test.js` — mock mongodb collection: verify scan filter, CAS updateOne, bulkWrite, checkpoint upsert

## 6. Public API & Documentation

- [x] 6.1 Update `src/index.js` and `src/index.mjs`: export `DekReEncryptionService`, `DocumentRewriteStore`, `MongoDocumentRewriteStore`, `RawDocument`, `ScanOptions`
- [x] 6.2 Create `docs/key-lifecycle.md` — unified guide: CMK re-wrap vs DEK rotation vs DEK re-encryption (scope, cost, when to use, sequence diagram, programmatic API examples)
- [x] 6.3 Create `examples/dek-re-encryption.js` — runnable example with InMemoryVaultStore demonstrating rotation → re-encryption → prune lifecycle

## 7. Quality Gates

- [x] 7.1 Run `npm run lint` and fix any issues
- [x] 7.2 Run full test suite `npm test` and confirm all pass

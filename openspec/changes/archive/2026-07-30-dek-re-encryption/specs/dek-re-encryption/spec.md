## ADDED Requirements

### Requirement: DocumentRewriteStore SPI
The system SHALL provide a `DocumentRewriteStore` abstract class in `src/spi/` enabling adapter-agnostic batch document scanning, atomic replacement, and checkpoint persistence.

#### Scenario: Batch scan returns raw documents
- **WHEN** `scan(scanOptions)` is invoked with a collection hint and batch size
- **THEN** the implementation SHALL yield `RawDocument` objects via AsyncIterator in stable `_id` order without decrypting any fields

#### Scenario: Atomic replace with CAS
- **WHEN** `replace(rawDocument)` is invoked
- **THEN** the implementation SHALL atomically replace the document ONLY IF the CAS condition matches (encrypted field `_k` equals old kid), returning `true` on success and `false` on conflict

#### Scenario: Batch replace optimization
- **WHEN** `replaceBatch(rawDocuments)` is invoked
- **THEN** the implementation MAY use database-specific bulk operations for throughput, returning the count of successfully replaced documents

#### Scenario: Checkpoint save and load
- **WHEN** `saveCheckpoint(taskId, cursorState)` is invoked
- **THEN** the implementation SHALL persist the cursor state such that a subsequent `loadCheckpoint(taskId)` returns it, enabling resume after interruption

### Requirement: DekReEncryptionService orchestration
The system SHALL provide a `DekReEncryptionService` that re-encrypts all documents in a collection under the active DEK, recomputing blind index values with the active HMAC key.

#### Scenario: Re-encrypt collection with field configs
- **WHEN** `reEncrypt(collection, fieldConfigs, options)` is invoked
- **THEN** the engine SHALL scan all documents, and for each encrypted field whose wire format dekVersion differs from the active dekVersion, decrypt with the old DEK, re-encrypt with the active DEK, recompute blind index with the active HMAC key (if enabled), and write back via `DocumentRewriteStore.replace()`

#### Scenario: Skip already-current documents
- **WHEN** a document's encrypted field already has dekVersion equal to the active dekVersion
- **THEN** the engine SHALL skip that field without modification

#### Scenario: CAS conflict handling
- **WHEN** `DocumentRewriteStore.replace()` returns `false` (document was modified concurrently)
- **THEN** the engine SHALL count it as `docsSkipped` and continue processing without error

#### Scenario: Checkpoint-based resume
- **WHEN** re-encryption is interrupted and restarted with the same `taskId`
- **THEN** the engine SHALL resume from the last saved checkpoint, not re-processing already-completed documents

#### Scenario: Dry-run mode
- **WHEN** `options.dryRun === true`
- **THEN** the engine SHALL perform full scan and validation but SHALL NOT call `replace()` or `replaceBatch()`, returning estimated counts

#### Scenario: Completion marks keys RETIRED
- **WHEN** re-encryption completes for a namespace with zero docsFailed and dryRun is false
- **THEN** the engine SHALL mark all ROTATED key entries for that namespace as RETIRED via `KeyVaultService.markKeysRetired()`

#### Scenario: Event emission — batch
- **WHEN** a batch is flushed
- **THEN** the engine SHALL emit `lcl.reencrypt.batch.completed` (L2) with docsProcessed, docsSkipped, docsFailed

#### Scenario: Event emission — completion
- **WHEN** re-encryption completes for a collection
- **THEN** the engine SHALL emit `lcl.reencrypt.namespace.completed` (L2) with docsProcessed, docsSkipped, docsFailed, fieldsReEncrypted, durationMicros

### Requirement: ReEncryptResult structure
The system SHALL return a result object from re-encryption operations.

#### Scenario: Result fields
- **WHEN** re-encryption completes
- **THEN** the result SHALL contain: `namespace` (string), `docsProcessed` (number), `docsSkipped` (number), `docsFailed` (number), `fieldsReEncrypted` (number), `durationMicros` (number), `dryRun` (boolean)

### Requirement: MongoDocumentRewriteStore adapter
The system SHALL provide a MongoDB implementation of `DocumentRewriteStore` using the native mongodb driver.

#### Scenario: Scan with stable order
- **WHEN** `scan(scanOptions)` is invoked
- **THEN** the adapter SHALL use `collection.find().sort({ _id: 1 }).batchSize(N)` with optional `noCursorTimeout`

#### Scenario: CAS replace via _k field
- **WHEN** `replace(rawDocument)` is invoked for a document with field `phone` previously at kid `v1-abcd`
- **THEN** the adapter SHALL execute `updateOne({ _id: doc.id, 'phone._k': 'v1-abcd' }, { $set: { phone: newPayload } })` and return `modifiedCount > 0`

#### Scenario: Checkpoint persistence
- **WHEN** `saveCheckpoint(taskId, cursorState)` is invoked
- **THEN** the adapter SHALL upsert `{ _id: taskId, cursorState, updatedAt }` into `__lcl_checkpoints` collection

#### Scenario: Resume from checkpoint
- **WHEN** `loadCheckpoint(taskId)` returns a previous `_id` value
- **THEN** `scan()` SHALL add filter `{ _id: { $gt: resumeAfter } }` to skip already-processed documents

'use strict';

/**
 * ScanOptions — plain object factory for configuring document scan behavior.
 *
 * Aligned with Java ScanOptions model.
 */

const DEFAULT_BATCH_SIZE = 500;

/**
 * Create a ScanOptions plain object.
 * @param {Object} params
 * @param {string} params.collectionHint - Collection name or hint for the data store
 * @param {number} [params.batchSize=500] - Number of documents per batch
 * @param {*} [params.resumeAfter] - Cursor state to resume from (e.g., last processed _id)
 * @param {number} [params.maxScanTimeMs] - Maximum scan time in milliseconds (optional)
 * @returns {{collectionHint: string, batchSize: number, resumeAfter: *, maxScanTimeMs: number|undefined}}
 */
function createScanOptions({ collectionHint, batchSize, resumeAfter, maxScanTimeMs }) {
  return {
    collectionHint,
    batchSize: batchSize || DEFAULT_BATCH_SIZE,
    resumeAfter: resumeAfter !== undefined ? resumeAfter : null,
    maxScanTimeMs
  };
}

module.exports = { createScanOptions, DEFAULT_BATCH_SIZE };

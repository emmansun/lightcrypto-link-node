'use strict';

/**
 * VaultDocument — storage-agnostic plain data model for vault persistence.
 *
 * Provides validation for required fields and structure.
 * This is a pure JavaScript object, not tied to any ORM or database.
 */

const REQUIRED_FIELDS = ['id', 'v', 'status', 'activeKid', 'keys', 'cmk', 'createdAt', 'updatedAt'];
const VALID_KEY_STATUSES = ['ACTIVE', 'ROTATED', 'REVOKED'];

/**
 * Validate a VaultDocument plain object.
 *
 * @param {Object} doc - The document to validate
 * @throws {Error} If required fields are missing or invalid
 */
function validateVaultDocument(doc) {
  if (!doc || typeof doc !== 'object') {
    throw new Error('VaultDocument must be a non-null object');
  }

  for (const field of REQUIRED_FIELDS) {
    if (doc[field] === undefined || doc[field] === null) {
      throw new Error(`VaultDocument missing required field: ${field}`);
    }
  }

  if (typeof doc.id !== 'string') {
    throw new Error('VaultDocument.id must be a String');
  }

  if (typeof doc.v !== 'number' || doc.v < 1) {
    throw new Error('VaultDocument.v must be a Number >= 1');
  }

  if (typeof doc.status !== 'string') {
    throw new Error('VaultDocument.status must be a String');
  }

  if (typeof doc.activeKid !== 'string') {
    throw new Error('VaultDocument.activeKid must be a String');
  }

  if (!Array.isArray(doc.keys)) {
    throw new Error('VaultDocument.keys must be an Array');
  }

  if (typeof doc.cmk !== 'object' || !doc.cmk.provider || !doc.cmk.id) {
    throw new Error('VaultDocument.cmk must be an Object with provider and id');
  }

  if (!(doc.createdAt instanceof Date)) {
    throw new Error('VaultDocument.createdAt must be a Date');
  }

  if (!(doc.updatedAt instanceof Date)) {
    throw new Error('VaultDocument.updatedAt must be a Date');
  }

  // Validate key entries
  for (let i = 0; i < doc.keys.length; i++) {
    validateKeyEntry(doc.keys[i], i);
  }
}

/**
 * Validate a single key entry in the keys array.
 *
 * @param {Object} entry - Key entry to validate
 * @param {number} index - Array index for error messages
 * @throws {Error} If the key entry is invalid
 */
function validateKeyEntry(entry, index) {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`VaultDocument.keys[${index}] must be a non-null object`);
  }

  if (typeof entry.kid !== 'string') {
    throw new Error(`VaultDocument.keys[${index}].kid must be a String`);
  }

  if (!VALID_KEY_STATUSES.includes(entry.status)) {
    throw new Error(`VaultDocument.keys[${index}].status must be one of: ${VALID_KEY_STATUSES.join(', ')}`);
  }

  validateWrappedKeyInfo(entry.dek, `keys[${index}].dek`);
  validateWrappedKeyInfo(entry.hmk, `keys[${index}].hmk`);

  if (typeof entry.binding !== 'string') {
    throw new Error(`VaultDocument.keys[${index}].binding must be a String`);
  }

  if (!(entry.createdAt instanceof Date)) {
    throw new Error(`VaultDocument.keys[${index}].createdAt must be a Date`);
  }
}

/**
 * Validate a WrappedKeyInfo structure.
 *
 * @param {Object} info - Wrapped key info to validate
 * @param {string} path - Field path for error messages
 * @throws {Error} If the wrapped key info is invalid
 */
function validateWrappedKeyInfo(info, path) {
  if (!info || typeof info !== 'object') {
    throw new Error(`VaultDocument.${path} must be a non-null object`);
  }

  if (!Buffer.isBuffer(info.wrapped)) {
    throw new Error(`VaultDocument.${path}.wrapped must be a Buffer`);
  }

  if (typeof info.algorithm !== 'string') {
    throw new Error(`VaultDocument.${path}.algorithm must be a String`);
  }

  if (typeof info.kcv !== 'string') {
    throw new Error(`VaultDocument.${path}.kcv must be a String`);
  }

  if (typeof info.cmkVersion !== 'string') {
    throw new Error(`VaultDocument.${path}.cmkVersion must be a String`);
  }
}

/**
 * Create a validated VaultDocument.
 *
 * @param {Object} data - Plain object with vault document data
 * @returns {Object} The same object (validated)
 * @throws {Error} If validation fails
 */
function createVaultDocument(data) {
  validateVaultDocument(data);
  return data;
}

module.exports = {
  validateVaultDocument,
  createVaultDocument,
  REQUIRED_FIELDS,
  VALID_KEY_STATUSES
};

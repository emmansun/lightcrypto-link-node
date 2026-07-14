'use strict';

const mongoose = require('mongoose');

/**
 * Wrapped key sub-document schema.
 * Stores the CMK-wrapped key with algorithm and KCV info.
 */
const WrappedKeyInfoSchema = new mongoose.Schema({
  wrapped: { type: Buffer, required: true },
  algorithm: { type: String, required: true },
  kcv: { type: String, required: true },
  cmkVersion: { type: String, default: '' }
}, { _id: false });

/**
 * Key version entry sub-document schema.
 * Represents a single DEK/HMAC key version in the vault.
 */
const KeyVersionEntrySchema = new mongoose.Schema({
  kid: { type: String, required: true },
  status: { type: String, required: true, enum: ['ACTIVE', 'ROTATED', 'REVOKED'] },
  dek: { type: WrappedKeyInfoSchema, required: true },
  hmk: { type: WrappedKeyInfoSchema, required: true },
  binding: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

/**
 * Key vault document schema.
 * Stored in __lcl_keyvault collection with per-entity DEK versioning.
 */
const KeyVaultDocumentSchema = new mongoose.Schema({
  _id: { type: String },
  v: { type: Number, required: true, default: 1 },
  status: { type: String, required: true, default: 'ACTIVE' },
  activeKid: { type: String, required: true },
  keys: { type: [KeyVersionEntrySchema], required: true },
  cmk: {
    provider: { type: String, required: true },
    id: { type: String, required: true }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: '__lcl_keyvault', versionKey: false });

// Update updatedAt on save
KeyVaultDocumentSchema.pre('save', function () {
  this.updatedAt = new Date();
});

/**
 * Create or get a KeyVault model for the given connection.
 * @param {mongoose.Connection} connection - Mongoose connection
 * @returns {mongoose.Model}
 */
function getKeyVaultModel(connection) {
  if (connection.models.KeyVaultDocument) {
    return connection.models.KeyVaultDocument;
  }
  return connection.model('KeyVaultDocument', KeyVaultDocumentSchema, '__lcl_keyvault');
}

module.exports = {
  KeyVaultDocumentSchema,
  KeyVersionEntrySchema,
  WrappedKeyInfoSchema,
  getKeyVaultModel
};

'use strict';

/**
 * RawDocument — plain object factory representing a raw document
 * scanned from a data store, with CAS conditions for atomic replacement.
 *
 * Aligned with Java RawDocument model.
 */

/**
 * Create a RawDocument plain object.
 * @param {Object} params
 * @param {*} params.id - Document identifier (e.g., MongoDB _id)
 * @param {Object<string, *>} params.fields - Map of field path → current encrypted payload
 * @param {Object<string, string>} params.casConditions - Map of field path → old kid for CAS verification
 * @returns {{id: *, fields: Object<string, *>, casConditions: Object<string, string>}}
 */
function createRawDocument({ id, fields, casConditions }) {
  return {
    id,
    fields: fields || {},
    casConditions: casConditions || {}
  };
}

module.exports = { createRawDocument };

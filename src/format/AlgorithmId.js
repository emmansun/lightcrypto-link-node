'use strict';

/**
 * Algorithm registry for Wire Format V1.
 * Maps algorithm names to 1-byte wire identifiers and cryptographic parameters.
 */
const AlgorithmId = Object.freeze({
  AES_256_GCM: {
    id: 0x01,
    ivLength: 12,
    keyLength: 32,
    isGcm: true,
    name: 'AES_256_GCM'
  },
  AES_256_CBC: {
    id: 0x02,
    ivLength: 16,
    keyLength: 32,
    isGcm: false,
    name: 'AES_256_CBC'
  },
  SM4_GCM: {
    id: 0x03,
    ivLength: 12,
    keyLength: 16,
    isGcm: true,
    name: 'SM4_GCM'
  },
  SM4_CBC: {
    id: 0x04,
    ivLength: 16,
    keyLength: 16,
    isGcm: false,
    name: 'SM4_CBC'
  }
});

// Reverse map: byte id → algorithm entry
const _byByte = new Map();
for (const entry of Object.values(AlgorithmId)) {
  _byByte.set(entry.id, entry);
}

/**
 * Look up algorithm entry by name.
 * @param {string} name - Algorithm name (e.g. "AES_256_GCM")
 * @returns {Object} Algorithm entry
 * @throws {Error} If unknown algorithm
 */
function fromName(name) {
  const entry = AlgorithmId[name];
  if (!entry) {
    throw new Error(`Unknown algorithm: ${name}`);
  }
  return entry;
}

/**
 * Look up algorithm entry by byte identifier.
 * @param {number} byte - 1-byte wire identifier
 * @returns {Object} Algorithm entry
 * @throws {Error} If unknown byte identifier
 */
function fromByte(byte) {
  const entry = _byByte.get(byte);
  if (!entry) {
    throw new Error(`Unknown algorithm byte: 0x${byte.toString(16).padStart(2, '0')}`);
  }
  return entry;
}

module.exports = { AlgorithmId, fromName, fromByte };

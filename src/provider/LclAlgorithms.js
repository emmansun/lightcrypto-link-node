'use strict';

/**
 * Standard, cloud-neutral algorithm identifiers for LightCrypto-Link (LCL).
 */
const LclAlgorithms = Object.freeze({
  AES_256_GCM: 'AES-256-GCM',
  SM4_GCM: 'SM4-GCM',
  SM4_CBC: 'SM4-CBC',
  RSA_OAEP_256: 'RSA-OAEP-256',
  KMS_DATA_KEY: 'KMS-DATA-KEY'
});

module.exports = { LclAlgorithms };

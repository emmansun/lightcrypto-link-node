'use strict';

/**
 * Multi-Algorithm Example: Using AES-256-GCM, AES-256-CBC, SM4-CBC on different fields
 */

const crypto = require('crypto');
const { FieldCryptoService } = require('../src');

const fieldService = new FieldCryptoService();

// Keys for different algorithms
const aes256Key = crypto.randomBytes(32); // AES-256 needs 32 bytes
const sm4Key = crypto.randomBytes(16);    // SM4 needs 16 bytes
const hmacKey = crypto.randomBytes(32);
const kid = 'v1-demo0001';

console.log('=== Multi-Algorithm Encryption Demo ===\n');

// AES-256-GCM (recommended default)
const gcmDoc = fieldService.encryptField(
  'GCM encrypted data', 'field1', aes256Key, hmacKey, kid, 'AES_256_GCM',
  { blindIndex: true }
);
console.log('AES-256-GCM:');
console.log('  Algorithm:', gcmDoc._a);
console.log('  Type:', gcmDoc._t);
console.log('  Ciphertext length:', gcmDoc.c.length, 'bytes');
console.log('  Blind index:', gcmDoc.b);

const gcmDecrypted = fieldService.decryptField(gcmDoc, aes256Key, hmacKey, 'AES_256_GCM');
console.log('  Decrypted:', gcmDecrypted);

// AES-256-CBC (legacy compatibility)
const cbcDoc = fieldService.encryptField(
  'CBC encrypted data', 'field2', aes256Key, hmacKey, kid, 'AES_256_CBC'
);
console.log('\nAES-256-CBC:');
console.log('  Algorithm:', cbcDoc._a);
console.log('  Ciphertext length:', cbcDoc.c.length, 'bytes');

const cbcDecrypted = fieldService.decryptField(cbcDoc, aes256Key, hmacKey, 'AES_256_CBC');
console.log('  Decrypted:', cbcDecrypted);

// SM4-CBC (China compliance)
const sm4Doc = fieldService.encryptField(
  'SM4 encrypted data', 'field3', sm4Key, hmacKey, kid, 'SM4_CBC',
  { blindIndex: true }
);
console.log('\nSM4-CBC:');
console.log('  Algorithm:', sm4Doc._a);
console.log('  Ciphertext length:', sm4Doc.c.length, 'bytes');
console.log('  Blind index:', sm4Doc.b);

const sm4Decrypted = fieldService.decryptField(sm4Doc, sm4Key, hmacKey, 'SM4_CBC');
console.log('  Decrypted:', sm4Decrypted);

console.log('\n=== All algorithms working correctly ===');

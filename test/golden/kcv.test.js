'use strict';

const crypto = require('crypto');
const path = require('path');
const AesGcmEncryptor = require('../../src/crypto/AesGcmEncryptor');
const AesCbcEncryptor = require('../../src/crypto/AesCbcEncryptor');
const Sm4CbcEncryptor = require('../../src/crypto/Sm4CbcEncryptor');
const CryptoCodec = require('../../src/crypto/CryptoCodec');

const VECTORS_FILE = path.join(__dirname, '..', 'vectors', 'kcv', 'kcv.json');

const ENCRYPTORS = {
  AES_256_GCM: new AesGcmEncryptor(),
  AES_256_CBC: new AesCbcEncryptor(),
  SM4_CBC: new Sm4CbcEncryptor()
};

describe('Golden Vector: KCV & Binding', () => {
  const vectors = JSON.parse(require('fs').readFileSync(VECTORS_FILE, 'utf8'));

  for (const vec of vectors) {
    if (vec.type === 'DEK_KCV') {
      if (vec.algorithm === 'SM4_GCM') {
        test.skip(`${vec.id}: SM4_GCM KCV skipped (sm4-gcm not in Node.js crypto)`, () => {});
        continue;
      }

      test(`${vec.id}: ${vec.algorithm} KCV matches Java output`, () => {
        const key = Buffer.from(vec.keyHex, 'hex');
        const encryptor = ENCRYPTORS[vec.algorithm];
        const kcv = encryptor.computeKcv(key);
        expect(kcv).toBe(vec.expectedKcvHex);
      });
    }

    if (vec.type === 'BINDING') {
      test(`${vec.id}: HMAC-DEK binding hash matches Java output`, () => {
        const hmacKey = Buffer.from(vec.hmacKeyHex, 'hex');
        const dek = Buffer.from(vec.dekHex, 'hex');
        const codec = new CryptoCodec();
        const binding = codec.computeBinding(hmacKey, dek);
        expect(binding).toBe(vec.expectedBindingHex);
      });
    }

    if (vec.type === 'HMAC_KCV') {
      // HMAC KCV computation requires Java-specific key check logic
      // Skipped until HMAC KCV algorithm is documented in the spec
      test.skip(`${vec.id}: HMAC KCV (requires Java KCV algorithm spec)`, () => {});
    }
  }
});

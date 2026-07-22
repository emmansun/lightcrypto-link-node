'use strict';

const crypto = require('crypto');
const path = require('path');
const { fromName } = require('../../src/format/AlgorithmId');
const WireFormatEncoder = require('../../src/format/WireFormatEncoder');
const Namespace = require('../../src/namespace/Namespace');
const AesGcmEncryptor = require('../../src/crypto/AesGcmEncryptor');
const AesCbcEncryptor = require('../../src/crypto/AesCbcEncryptor');
const Sm4CbcEncryptor = require('../../src/crypto/Sm4CbcEncryptor');

const VECTORS_DIR = path.join(__dirname, '..', 'vectors', 'encryption');

const ENCRYPTORS = {
  AES_256_GCM: new AesGcmEncryptor(),
  AES_256_CBC: new AesCbcEncryptor(),
  SM4_CBC: new Sm4CbcEncryptor()
};

function loadVectors(filename) {
  return JSON.parse(
    require('fs').readFileSync(path.join(VECTORS_DIR, filename), 'utf8')
  );
}

describe('Golden Vector: Encryption', () => {
  describe('AES-256-GCM', () => {
    const vectors = loadVectors('aes-256-gcm.json');

    for (const vec of vectors) {
      test(`${vec.id}: wire format hex matches Java output`, () => {
        const key = Buffer.from(vec.input.keyHex, 'hex');
        const plaintext = Buffer.from(vec.input.plaintextHex, 'hex');
        const iv = Buffer.from(vec.input.ivHex, 'hex');
        const namespace = Namespace.parse(vec.input.namespace);
        const dekVersion = vec.input.dekVersion;

        const algInfo = fromName(vec.algorithm);
        const encryptor = ENCRYPTORS[vec.algorithm];

        // Build AAD for GCM
        const aad = algInfo.isGcm
          ? WireFormatEncoder.buildAad(vec.algorithm, namespace, dekVersion)
          : null;

        // Encrypt with fixed IV
        const ciphertext = encryptor.encrypt(key, iv, plaintext, aad);

        // Verify ciphertext matches
        expect(ciphertext.toString('hex')).toBe(vec.expected.ciphertextHex);

        // Build wire format blob
        const blob = WireFormatEncoder.encode(vec.algorithm, namespace, dekVersion, iv, ciphertext);
        expect(blob.toString('hex')).toBe(vec.expected.wireFormatHex);
      });
    }
  });

  describe('AES-256-CBC', () => {
    const vectors = loadVectors('aes-256-cbc.json');

    for (const vec of vectors) {
      test(`${vec.id}: wire format hex matches Java output`, () => {
        const key = Buffer.from(vec.input.keyHex, 'hex');
        const plaintext = Buffer.from(vec.input.plaintextHex, 'hex');
        const iv = Buffer.from(vec.input.ivHex, 'hex');
        const namespace = Namespace.parse(vec.input.namespace);
        const dekVersion = vec.input.dekVersion;

        const encryptor = ENCRYPTORS[vec.algorithm];

        // Encrypt with fixed IV (no AAD for CBC)
        const ciphertext = encryptor.encrypt(key, iv, plaintext, null);

        expect(ciphertext.toString('hex')).toBe(vec.expected.ciphertextHex);

        const blob = WireFormatEncoder.encode(vec.algorithm, namespace, dekVersion, iv, ciphertext);
        expect(blob.toString('hex')).toBe(vec.expected.wireFormatHex);
      });
    }
  });

  describe('SM4-CBC', () => {
    const vectors = loadVectors('sm4-cbc.json');

    for (const vec of vectors) {
      test(`${vec.id}: wire format hex matches Java output`, () => {
        const key = Buffer.from(vec.input.keyHex, 'hex');
        const plaintext = Buffer.from(vec.input.plaintextHex, 'hex');
        const iv = Buffer.from(vec.input.ivHex, 'hex');
        const namespace = Namespace.parse(vec.input.namespace);
        const dekVersion = vec.input.dekVersion;

        const encryptor = ENCRYPTORS[vec.algorithm];

        const ciphertext = encryptor.encrypt(key, iv, plaintext, null);
        expect(ciphertext.toString('hex')).toBe(vec.expected.ciphertextHex);

        const blob = WireFormatEncoder.encode(vec.algorithm, namespace, dekVersion, iv, ciphertext);
        expect(blob.toString('hex')).toBe(vec.expected.wireFormatHex);
      });
    }
  });

  describe('SM4-GCM (skipped — sm4-gcm not available in Node.js crypto)', () => {
    const vectors = loadVectors('sm4-gcm.json');

    for (const vec of vectors) {
      test.skip(`${vec.id}: skipped (sm4-gcm not supported by Node.js OpenSSL)`, () => {});
    }
  });
});

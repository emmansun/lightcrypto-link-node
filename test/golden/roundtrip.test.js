'use strict';

const path = require('path');
const { fromName } = require('../../src/format/AlgorithmId');
const WireFormatEncoder = require('../../src/format/WireFormatEncoder');
const WireFormatDecoder = require('../../src/format/WireFormatDecoder');
const Namespace = require('../../src/namespace/Namespace');
const AesGcmEncryptor = require('../../src/crypto/AesGcmEncryptor');
const AesCbcEncryptor = require('../../src/crypto/AesCbcEncryptor');
const Sm4CbcEncryptor = require('../../src/crypto/Sm4CbcEncryptor');

const VECTORS_FILE = path.join(__dirname, '..', 'vectors', 'roundtrip', 'roundtrip.json');

const ENCRYPTORS = {
  AES_256_GCM: new AesGcmEncryptor(),
  AES_256_CBC: new AesCbcEncryptor(),
  SM4_CBC: new Sm4CbcEncryptor()
};

describe('Golden Vector: Roundtrip', () => {
  const vectors = JSON.parse(require('fs').readFileSync(VECTORS_FILE, 'utf8'));

  for (const vec of vectors) {
    if (vec.algorithm === 'SM4_GCM') {
      test.skip(`${vec.id}: SM4_GCM roundtrip skipped (sm4-gcm not in Node.js crypto)`, () => {});
      continue;
    }

    describe(vec.id, () => {
      const key = Buffer.from(vec.input.keyHex, 'hex');
      const plaintext = Buffer.from(vec.input.plaintextHex, 'hex');
      const namespace = Namespace.parse(vec.input.namespace);
      const dekVersion = vec.input.dekVersion;
      const expectedBase64Url = vec.expected.wireFormatBase64url;

      test('encrypt with extracted IV produces identical wire format', () => {
        // Decode Java's wire format to extract IV
        const decoded = WireFormatDecoder.decodeFromBase64Url(expectedBase64Url);
        const encryptor = ENCRYPTORS[vec.algorithm];
        const algInfo = fromName(vec.algorithm);

        // Build AAD for GCM
        const aad = algInfo.isGcm
          ? WireFormatEncoder.buildAad(vec.algorithm, namespace, dekVersion)
          : null;

        // Encrypt with same IV → must produce identical ciphertext
        const ciphertext = encryptor.encrypt(key, decoded.iv, plaintext, aad);

        // Build our wire format
        const ourBlob = WireFormatEncoder.encodeToBase64Url(
          vec.algorithm, namespace, dekVersion, decoded.iv, ciphertext
        );

        expect(ourBlob).toBe(expectedBase64Url);
      });

      test('decrypt Java wire format reproduces original plaintext', () => {
        const decoded = WireFormatDecoder.decodeFromBase64Url(expectedBase64Url);
        const encryptor = ENCRYPTORS[vec.algorithm];
        const algInfo = fromName(decoded.algorithm);

        // Reconstruct AAD for GCM
        const aad = algInfo.isGcm
          ? WireFormatDecoder.reconstructAad(decoded)
          : null;

        // Decrypt Java's ciphertext
        const decrypted = encryptor.decrypt(key, decoded.iv, decoded.ciphertext, aad);

        expect(decrypted.toString('hex')).toBe(vec.input.plaintextHex);
      });

      test('wire format metadata matches expected values', () => {
        const decoded = WireFormatDecoder.decodeFromBase64Url(expectedBase64Url);

        expect(decoded.version).toBe(1);
        expect(decoded.algorithm).toBe(vec.algorithm);
        expect(decoded.namespace).toBe(vec.input.namespace);
        expect(decoded.dekVersion).toBe(dekVersion);
        expect(decoded.iv.length).toBe(fromName(vec.algorithm).ivLength);
      });
    });
  }
});

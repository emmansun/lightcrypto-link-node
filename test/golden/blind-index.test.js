'use strict';

const path = require('path');
const BlindIndexEngine = require('../../src/blindindex/BlindIndexEngine');
const Namespace = require('../../src/namespace/Namespace');

const VECTORS_FILE = path.join(__dirname, '..', 'vectors', 'blind-index', 'hmac-sha256.json');

describe('Golden Vector: Blind Index (HMAC-SHA256)', () => {
  const vectors = JSON.parse(require('fs').readFileSync(VECTORS_FILE, 'utf8'));
  let engine;

  beforeEach(() => {
    engine = new BlindIndexEngine();
  });

  for (const vec of vectors) {
    describe(vec.id, () => {
      test('derived HMAC key matches Java output', () => {
        const masterHmacKey = Buffer.from(vec.input.masterHmacKeyHex, 'hex');
        const namespace = Namespace.parse(vec.input.namespace);

        const derivedKey = engine.deriveKey(masterHmacKey, namespace);
        expect(derivedKey.toString('hex')).toBe(vec.expected.derivedHmacKeyHex);
      });

      test('blind index Base64URL matches Java output', () => {
        const masterHmacKey = Buffer.from(vec.input.masterHmacKeyHex, 'hex');
        const namespace = Namespace.parse(vec.input.namespace);

        const blindIndex = engine.compute(
          masterHmacKey,
          namespace,
          vec.input.fieldName,
          vec.input.plaintext
        );
        expect(blindIndex).toBe(vec.expected.blindIndexBase64url);
      });
    });
  }
});

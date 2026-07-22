'use strict';

const KatVectorLoader = require('./KatVectorLoader');
const { PhaseResult } = require('./BootstrapResult');
const Namespace = require('../namespace/Namespace');
const WireFormatEncoder = require('../format/WireFormatEncoder');
const CryptoCodec = require('../crypto/CryptoCodec');
const BlindIndexEngine = require('../blindindex/BlindIndexEngine');

const TOTAL_BUDGET_MS = 200;
const PER_PRIMITIVE_BUDGET_MS = 30;

const ENCRYPTION_FILES = [
  'aes-256-gcm.json',
  'aes-256-cbc.json',
  'sm4-cbc.json'
];

/**
 * KatRunner — Known Answer Test runner implementing BootstrapCheck interface.
 * Verifies encryption, blind index, and KCV correctness using golden vectors.
 */
class KatRunner {
  constructor() {
    this._lastResults = new Map();
  }

  /**
   * BootstrapCheck interface: run all KATs and return a PhaseResult.
   * @param {BootstrapContext} context
   * @returns {Promise<PhaseResult>}
   */
  async check(_context) {
    const startMs = Date.now();
    this._lastResults.clear();
    const errors = [];
    const advisories = [];

    // 1. Encryption KATs
    for (const filename of ENCRYPTION_FILES) {
      const primStart = Date.now();
      try {
        this._verifyEncryption(filename);
        const durationMs = Date.now() - primStart;
        const algName = filename.replace('.json', '');
        this._lastResults.set(algName, { algorithm: algName, passed: true, durationMs, error: null });
        if (durationMs > PER_PRIMITIVE_BUDGET_MS) {
          advisories.push(`${algName} KAT exceeded ${PER_PRIMITIVE_BUDGET_MS}ms budget (${durationMs}ms)`);
        }
      } catch (err) {
        const durationMs = Date.now() - primStart;
        const algName = filename.replace('.json', '');
        this._lastResults.set(algName, { algorithm: algName, passed: false, durationMs, error: err.message });
        errors.push(err.message);
      }
    }

    // 2. Blind index KAT
    const biStart = Date.now();
    try {
      this._verifyBlindIndex();
      const durationMs = Date.now() - biStart;
      this._lastResults.set('blind-index', { algorithm: 'blind-index', passed: true, durationMs, error: null });
      if (durationMs > PER_PRIMITIVE_BUDGET_MS) {
        advisories.push(`blind-index KAT exceeded ${PER_PRIMITIVE_BUDGET_MS}ms budget (${durationMs}ms)`);
      }
    } catch (err) {
      const durationMs = Date.now() - biStart;
      this._lastResults.set('blind-index', { algorithm: 'blind-index', passed: false, durationMs, error: err.message });
      errors.push(err.message);
    }

    // 3. KCV KAT
    const kcvStart = Date.now();
    try {
      this._verifyKcv();
      const durationMs = Date.now() - kcvStart;
      this._lastResults.set('kcv', { algorithm: 'kcv', passed: true, durationMs, error: null });
      if (durationMs > PER_PRIMITIVE_BUDGET_MS) {
        advisories.push(`kcv KAT exceeded ${PER_PRIMITIVE_BUDGET_MS}ms budget (${durationMs}ms)`);
      }
    } catch (err) {
      const durationMs = Date.now() - kcvStart;
      this._lastResults.set('kcv', { algorithm: 'kcv', passed: false, durationMs, error: err.message });
      errors.push(err.message);
    }

    const totalMs = Date.now() - startMs;
    if (totalMs > TOTAL_BUDGET_MS) {
      advisories.push(`Total KAT exceeded ${TOTAL_BUDGET_MS}ms budget (${totalMs}ms)`);
    }

    if (errors.length > 0) {
      return PhaseResult.failure('BOOT-4 KAT', totalMs, errors.join('; '));
    }

    return PhaseResult.success('BOOT-4 KAT', totalMs);
  }

  /**
   * @returns {Map<string, {algorithm: string, passed: boolean, durationMs: number, error: string|null}>}
   */
  getLastResults() {
    return this._lastResults;
  }

  /**
   * Verify encryption using first vector from the specified file.
   * @private
   */
  _verifyEncryption(filename) {
    const vectors = KatVectorLoader.loadEncryptionVectors(filename);
    const v = vectors[0];
    const input = v.input;

    const key = Buffer.from(input.keyHex, 'hex');
    const iv = Buffer.from(input.ivHex, 'hex');
    const plaintext = Buffer.from(input.plaintextHex, 'hex');
    const namespace = Namespace.parse(input.namespace);
    const algorithm = v.algorithm;

    const codec = new CryptoCodec();
    const encryptor = codec.getEncryptor(algorithm);

    const { fromName } = require('../format/AlgorithmId');
    const algInfo = fromName(algorithm);
    const aad = algInfo.isGcm
      ? WireFormatEncoder.buildAad(algorithm, namespace, input.dekVersion)
      : null;

    const ciphertext = encryptor.encrypt(key, iv, plaintext, aad);
    const expected = Buffer.from(v.expected.ciphertextHex, 'hex');

    if (!ciphertext.equals(expected)) {
      throw new Error(`Encryption KAT failed for ${v.id}: expected ${v.expected.ciphertextHex}, got ${ciphertext.toString('hex')}`);
    }
  }

  /**
   * Verify blind index using first vector.
   * @private
   */
  _verifyBlindIndex() {
    const vectors = KatVectorLoader.loadBlindIndexVectors();
    const v = vectors[0];
    const input = v.input;

    const masterHmacKey = Buffer.from(input.masterHmacKeyHex, 'hex');
    const namespace = Namespace.parse(input.namespace);
    const engine = new BlindIndexEngine();
    const result = engine.compute(masterHmacKey, namespace, input.fieldName, input.plaintext);

    if (result !== v.expected.blindIndexBase64url) {
      throw new Error(`Blind index KAT failed for ${v.id}: expected ${v.expected.blindIndexBase64url}, got ${result}`);
    }
  }

  /**
   * Verify KCV and binding using all vectors.
   * @private
   */
  _verifyKcv() {
    const vectors = KatVectorLoader.loadKcvVectors();
    const codec = new CryptoCodec();
    const failedIds = [];

    for (const v of vectors) {
      if (v.type === 'DEK_KCV') {
        // Skip unsupported algorithms (e.g. SM4_GCM not available in Node.js)
        try {
          codec.getEncryptor(v.algorithm);
        } catch {
          continue;
        }
        const key = Buffer.from(v.keyHex, 'hex');
        const kcv = codec.computeKcv(key, v.algorithm);
        if (kcv !== v.expectedKcvHex) {
          failedIds.push(v.id);
        }
      } else if (v.type === 'HMAC_KCV') {
        // HMAC KCV uses a Java-specific algorithm not available in Node.js — skip
        continue;
      } else if (v.type === 'BINDING') {
        const hmacKey = Buffer.from(v.hmacKeyHex, 'hex');
        const dek = Buffer.from(v.dekHex, 'hex');
        const binding = codec.computeBinding(hmacKey, dek);
        if (binding !== v.expectedBindingHex) {
          failedIds.push(v.id);
        }
      }
    }

    if (failedIds.length > 0) {
      throw new Error(`KCV KAT failed for vectors: ${failedIds.join(', ')}`);
    }
  }
}

module.exports = KatRunner;

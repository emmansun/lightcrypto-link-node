'use strict';

const crypto = require('crypto');
const BlindIndexEngine = require('../../../src/blindindex/BlindIndexEngine');
const Namespace = require('../../../src/namespace/Namespace');

describe('BlindIndexEngine', () => {
  let engine;
  const masterHmacKey = Buffer.alloc(32, 0xAB);

  beforeEach(() => {
    engine = new BlindIndexEngine();
  });

  describe('deriveKey()', () => {
    it('returns a 32-byte derived key', () => {
      const ns = Namespace.parse('User#phone');
      const key = engine.deriveKey(masterHmacKey, ns);
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });

    it('different namespaces produce different keys', () => {
      const ns1 = Namespace.parse('User#phone');
      const ns2 = Namespace.parse('User#email');
      const key1 = engine.deriveKey(masterHmacKey, ns1);
      const key2 = engine.deriveKey(masterHmacKey, ns2);
      expect(key1).not.toEqual(key2);
    });

    it('same namespace produces same key (deterministic)', () => {
      const ns = Namespace.parse('User#phone');
      const key1 = engine.deriveKey(masterHmacKey, ns);
      const key2 = engine.deriveKey(masterHmacKey, ns);
      expect(key1).toEqual(key2);
    });

    it('caches derived keys', () => {
      const ns = Namespace.parse('User#phone');
      const key1 = engine.deriveKey(masterHmacKey, ns);
      const key2 = engine.deriveKey(masterHmacKey, ns);
      expect(key1).toBe(key2); // Same reference (cached)
    });
  });

  describe('compute()', () => {
    it('returns Base64URL string without padding', () => {
      const ns = Namespace.parse('User#phone');
      const result = engine.compute(masterHmacKey, ns, 'phone', 'test@example.com');
      expect(typeof result).toBe('string');
      expect(result).not.toContain('=');
    });

    it('normalizes strings with trim + lowercase', () => {
      const ns = Namespace.parse('User#email');
      const result1 = engine.compute(masterHmacKey, ns, 'email', '  Test@Example.COM  ');
      const result2 = engine.compute(masterHmacKey, ns, 'email', 'test@example.com');
      expect(result1).toBe(result2);
    });

    it('does not normalize Buffer input', () => {
      const ns = Namespace.parse('User#data');
      const buf = Buffer.from('Hello');
      const result1 = engine.compute(masterHmacKey, ns, 'data', buf);
      const result2 = engine.compute(masterHmacKey, ns, 'data', 'hello');
      expect(result1).not.toBe(result2);
    });

    it('same inputs produce same blind index (deterministic)', () => {
      const ns = Namespace.parse('User#phone');
      const r1 = engine.compute(masterHmacKey, ns, 'phone', '12345');
      const r2 = engine.compute(masterHmacKey, ns, 'phone', '12345');
      expect(r1).toBe(r2);
    });

    it('different namespaces produce different blind indexes for same value', () => {
      const ns1 = Namespace.parse('User#phone');
      const ns2 = Namespace.parse('Order#phone');
      const r1 = engine.compute(masterHmacKey, ns1, 'phone', '12345');
      const r2 = engine.compute(masterHmacKey, ns2, 'phone', '12345');
      expect(r1).not.toBe(r2);
    });
  });
});

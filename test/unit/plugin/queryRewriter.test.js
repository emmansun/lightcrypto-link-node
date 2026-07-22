'use strict';

const crypto = require('crypto');
const { rewriteQuery } = require('../../../src/plugin/queryRewriter');
const CryptoCodec = require('../../../src/crypto/CryptoCodec');
const TypeSerializer = require('../../../src/service/TypeSerializer');
const Namespace = require('../../../src/namespace/Namespace');

describe('queryRewriter', () => {
  let codec;
  let serializer;
  let hmacKey;
  let encryptedFields;

  beforeEach(() => {
    codec = new CryptoCodec();
    serializer = new TypeSerializer();
    hmacKey = crypto.randomBytes(32);

    encryptedFields = new Map([
      ['phone', { encrypt: true, blindIndex: true, customFieldName: null, mongooseType: 'String' }],
      ['ssn', { encrypt: true, blindIndex: false, customFieldName: null, mongooseType: 'String' }],
      ['email', { encrypt: true, blindIndex: true, customFieldName: 'email_addr', mongooseType: 'String' }]
    ]);
  });

  test('returns null/undefined query as-is', () => {
    expect(rewriteQuery(null, encryptedFields, codec, hmacKey, serializer)).toBeNull();
    expect(rewriteQuery(undefined, encryptedFields, codec, hmacKey, serializer)).toBeUndefined();
  });

  test('returns non-object query as-is', () => {
    expect(rewriteQuery('string', encryptedFields, codec, hmacKey, serializer)).toBe('string');
  });

  test('does not modify query without encrypted fields', () => {
    const query = { name: 'John', age: 30 };
    const result = rewriteQuery(query, encryptedFields, codec, hmacKey, serializer);
    expect(result).toEqual({ name: 'John', age: 30 });
  });

  test('rewrites exact match to blind index', () => {
    const query = { phone: '13800138000' };
    const result = rewriteQuery(query, encryptedFields, codec, hmacKey, serializer);

    expect(result.phone).toBeUndefined();
    expect(result['phone.b']).toBeDefined();
    expect(typeof result['phone.b']).toBe('string');
    expect(result['phone.b'].length).toBe(43); // Base64URL SHA-256
  });

  test('blind index is deterministic', () => {
    const query1 = { phone: '13800138000' };
    const query2 = { phone: '13800138000' };
    const result1 = rewriteQuery(query1, encryptedFields, codec, hmacKey, serializer);
    const result2 = rewriteQuery(query2, encryptedFields, codec, hmacKey, serializer);
    expect(result1['phone.b']).toBe(result2['phone.b']);
  });

  test('different values produce different blind indexes', () => {
    const query1 = { phone: '13800138000' };
    const query2 = { phone: '13900139000' };
    const result1 = rewriteQuery(query1, encryptedFields, codec, hmacKey, serializer);
    const result2 = rewriteQuery(query2, encryptedFields, codec, hmacKey, serializer);
    expect(result1['phone.b']).not.toBe(result2['phone.b']);
  });

  test('throws for encrypted field without blindIndex', () => {
    const query = { ssn: '123-45-6789' };
    expect(() => rewriteQuery(query, encryptedFields, codec, hmacKey, serializer)).toThrow(
      /Cannot query encrypted field 'ssn' without blindIndex/
    );
  });

  test('uses customFieldName for blind index generation', () => {
    const query = { email: 'test@example.com' };
    const result = rewriteQuery(query, encryptedFields, codec, hmacKey, serializer, 'email');

    // Verify it uses 'email_addr' as the field name in HMAC computation
    const expectedIndex = codec.generateBlindIndex(hmacKey, Namespace.parse('email#email_addr'), 'email_addr', 'test@example.com');
    expect(result['email.b']).toBe(expectedIndex);
  });

  test('handles $in operator', () => {
    const query = { phone: { $in: ['13800138000', '13900139000'] } };
    const result = rewriteQuery(query, encryptedFields, codec, hmacKey, serializer);

    expect(result.phone).toBeUndefined();
    expect(result['phone.b']).toBeDefined();
    expect(result['phone.b'].$in).toBeDefined();
    expect(Array.isArray(result['phone.b'].$in)).toBe(true);
    expect(result['phone.b'].$in.length).toBe(2);
    // Each element should be a blind index string
    for (const idx of result['phone.b'].$in) {
      expect(typeof idx).toBe('string');
      expect(idx.length).toBe(43);
    }
  });

  test('$in blind indexes match individual exact match indexes', () => {
    const queryIn = { phone: { $in: ['13800138000'] } };
    const queryExact = { phone: '13800138000' };
    const resultIn = rewriteQuery(queryIn, encryptedFields, codec, hmacKey, serializer);
    const resultExact = rewriteQuery(queryExact, encryptedFields, codec, hmacKey, serializer);
    expect(resultIn['phone.b'].$in[0]).toBe(resultExact['phone.b']);
  });

  test('does not rewrite range operators ($gt, $lt, $gte, $lte)', () => {
    const query = { phone: { $gt: '13800000000' } };
    const result = rewriteQuery(query, encryptedFields, codec, hmacKey, serializer);
    // Range operators are left as-is (no blind index possible)
    expect(result.phone).toEqual({ $gt: '13800000000' });
    expect(result['phone.b']).toBeUndefined();
  });

  test('handles number values in query', () => {
    const fieldsWithAge = new Map([
      ['age', { encrypt: true, blindIndex: true, customFieldName: null, mongooseType: 'Number' }]
    ]);
    const query = { age: 42 };
    const result = rewriteQuery(query, fieldsWithAge, codec, hmacKey, serializer);

    const expectedIndex = codec.generateBlindIndex(hmacKey, Namespace.parse('age#age'), 'age', '42');
    expect(result['age.b']).toBe(expectedIndex);
  });

  test('handles boolean values in query', () => {
    const fieldsWithActive = new Map([
      ['active', { encrypt: true, blindIndex: true, customFieldName: null, mongooseType: 'Boolean' }]
    ]);
    const query = { active: true };
    const result = rewriteQuery(query, fieldsWithActive, codec, hmacKey, serializer);

    const expectedIndex = codec.generateBlindIndex(hmacKey, Namespace.parse('active#active'), 'active', 'true');
    expect(result['active.b']).toBe(expectedIndex);
  });

  test('does not mutate original query object', () => {
    const query = { phone: '13800138000', name: 'John' };
    const original = { ...query };
    rewriteQuery(query, encryptedFields, codec, hmacKey, serializer);
    expect(query).toEqual(original);
  });

  test('handles empty encryptedFields map', () => {
    const query = { phone: '13800138000' };
    const result = rewriteQuery(query, new Map(), codec, hmacKey, serializer);
    expect(result).toEqual({ phone: '13800138000' });
  });

  test('handles multiple encrypted fields in same query', () => {
    const query = { phone: '13800138000', email: 'test@example.com' };
    const result = rewriteQuery(query, encryptedFields, codec, hmacKey, serializer);

    expect(result.phone).toBeUndefined();
    expect(result.email).toBeUndefined();
    expect(result['phone.b']).toBeDefined();
    expect(result['email.b']).toBeDefined();
  });
});

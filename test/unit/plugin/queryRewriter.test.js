'use strict';

const crypto = require('crypto');
const { rewriteQuery } = require('../../../src/plugin/queryRewriter');
const CryptoCodec = require('../../../src/crypto/CryptoCodec');
const TypeSerializer = require('../../../src/service/TypeSerializer');
const Namespace = require('../../../src/namespace/Namespace');

describe('queryRewriter', () => {
  let codec;
  let serializer;
  let mockKeyVaultService;
  let hmacKey;
  let encryptedFields;

  beforeEach(() => {
    codec = new CryptoCodec();
    serializer = new TypeSerializer();
    hmacKey = crypto.randomBytes(32);

    mockKeyVaultService = {
      ensureVaultInitialized: jest.fn().mockResolvedValue(undefined),
      getActiveHmacKey: jest.fn().mockResolvedValue(hmacKey)
    };

    encryptedFields = new Map([
      ['phone', { encrypt: true, blindIndex: true, customFieldName: null, mongooseType: 'String' }],
      ['ssn', { encrypt: true, blindIndex: false, customFieldName: null, mongooseType: 'String' }],
      ['email', { encrypt: true, blindIndex: true, customFieldName: 'email_addr', mongooseType: 'String' }]
    ]);
  });

  test('returns null/undefined query as-is', async () => {
    expect(await rewriteQuery(null, encryptedFields, codec, mockKeyVaultService, serializer)).toBeNull();
    expect(await rewriteQuery(undefined, encryptedFields, codec, mockKeyVaultService, serializer)).toBeUndefined();
  });

  test('returns non-object query as-is', async () => {
    expect(await rewriteQuery('string', encryptedFields, codec, mockKeyVaultService, serializer)).toBe('string');
  });

  test('does not modify query without encrypted fields', async () => {
    const query = { name: 'John', age: 30 };
    const result = await rewriteQuery(query, encryptedFields, codec, mockKeyVaultService, serializer);
    expect(result).toEqual({ name: 'John', age: 30 });
  });

  test('rewrites exact match to blind index', async () => {
    const query = { phone: '13800138000' };
    const result = await rewriteQuery(query, encryptedFields, codec, mockKeyVaultService, serializer);

    expect(result.phone).toBeUndefined();
    expect(result['phone.b']).toBeDefined();
    expect(typeof result['phone.b']).toBe('string');
    expect(result['phone.b'].length).toBe(43);
  });

  test('blind index is deterministic', async () => {
    const query1 = { phone: '13800138000' };
    const query2 = { phone: '13800138000' };
    const result1 = await rewriteQuery(query1, encryptedFields, codec, mockKeyVaultService, serializer);
    const result2 = await rewriteQuery(query2, encryptedFields, codec, mockKeyVaultService, serializer);
    expect(result1['phone.b']).toBe(result2['phone.b']);
  });

  test('different values produce different blind indexes', async () => {
    const query1 = { phone: '13800138000' };
    const query2 = { phone: '13900139000' };
    const result1 = await rewriteQuery(query1, encryptedFields, codec, mockKeyVaultService, serializer);
    const result2 = await rewriteQuery(query2, encryptedFields, codec, mockKeyVaultService, serializer);
    expect(result1['phone.b']).not.toBe(result2['phone.b']);
  });

  test('throws for encrypted field without blindIndex', async () => {
    const query = { ssn: '123-45-6789' };
    await expect(
      rewriteQuery(query, encryptedFields, codec, mockKeyVaultService, serializer)
    ).rejects.toThrow(/Cannot query encrypted field 'ssn' without blindIndex/);
  });

  test('uses customFieldName for blind index generation', async () => {
    const query = { email: 'test@example.com' };
    const result = await rewriteQuery(query, encryptedFields, codec, mockKeyVaultService, serializer, 'User');

    const ns = Namespace.parse('User#email_addr');
    const expectedIndex = codec.generateBlindIndex(hmacKey, ns, 'email_addr', 'test@example.com');
    expect(result['email.b']).toBe(expectedIndex);
  });

  test('handles $in operator', async () => {
    const query = { phone: { $in: ['13800138000', '13900139000'] } };
    const result = await rewriteQuery(query, encryptedFields, codec, mockKeyVaultService, serializer);

    expect(result.phone).toBeUndefined();
    expect(result['phone.b']).toBeDefined();
    expect(result['phone.b'].$in).toBeDefined();
    expect(Array.isArray(result['phone.b'].$in)).toBe(true);
    expect(result['phone.b'].$in.length).toBe(2);
    for (const idx of result['phone.b'].$in) {
      expect(typeof idx).toBe('string');
      expect(idx.length).toBe(43);
    }
  });

  test('$in blind indexes match individual exact match indexes', async () => {
    const queryIn = { phone: { $in: ['13800138000'] } };
    const queryExact = { phone: '13800138000' };
    const resultIn = await rewriteQuery(queryIn, encryptedFields, codec, mockKeyVaultService, serializer);
    const resultExact = await rewriteQuery(queryExact, encryptedFields, codec, mockKeyVaultService, serializer);
    expect(resultIn['phone.b'].$in[0]).toBe(resultExact['phone.b']);
  });

  test('does not rewrite range operators ($gt, $lt, $gte, $lte)', async () => {
    const query = { phone: { $gt: '13800000000' } };
    const result = await rewriteQuery(query, encryptedFields, codec, mockKeyVaultService, serializer);
    expect(result.phone).toEqual({ $gt: '13800000000' });
    expect(result['phone.b']).toBeUndefined();
  });

  test('handles number values in query', async () => {
    const fieldsWithAge = new Map([
      ['age', { encrypt: true, blindIndex: true, customFieldName: null, mongooseType: 'Number' }]
    ]);
    const query = { age: 42 };
    const result = await rewriteQuery(query, fieldsWithAge, codec, mockKeyVaultService, serializer);

    const ns = Namespace.parse('undefined#age');
    const expectedIndex = codec.generateBlindIndex(hmacKey, ns, 'age', '42');
    expect(result['age.b']).toBe(expectedIndex);
  });

  test('handles boolean values in query', async () => {
    const fieldsWithActive = new Map([
      ['active', { encrypt: true, blindIndex: true, customFieldName: null, mongooseType: 'Boolean' }]
    ]);
    const query = { active: true };
    const result = await rewriteQuery(query, fieldsWithActive, codec, mockKeyVaultService, serializer);

    const ns = Namespace.parse('undefined#active');
    const expectedIndex = codec.generateBlindIndex(hmacKey, ns, 'active', 'true');
    expect(result['active.b']).toBe(expectedIndex);
  });

  test('does not mutate original query object', async () => {
    const query = { phone: '13800138000', name: 'John' };
    const original = { ...query };
    await rewriteQuery(query, encryptedFields, codec, mockKeyVaultService, serializer);
    expect(query).toEqual(original);
  });

  test('handles empty encryptedFields map', async () => {
    const query = { phone: '13800138000' };
    const result = await rewriteQuery(query, new Map(), codec, mockKeyVaultService, serializer);
    expect(result).toEqual({ phone: '13800138000' });
  });

  test('handles multiple encrypted fields in same query', async () => {
    const query = { phone: '13800138000', email: 'test@example.com' };
    const result = await rewriteQuery(query, encryptedFields, codec, mockKeyVaultService, serializer);

    expect(result.phone).toBeUndefined();
    expect(result.email).toBeUndefined();
    expect(result['phone.b']).toBeDefined();
    expect(result['email.b']).toBeDefined();
  });

  test('calls ensureVaultInitialized with canonical namespace', async () => {
    const query = { phone: '13800138000' };
    await rewriteQuery(query, encryptedFields, codec, mockKeyVaultService, serializer, 'User');

    expect(mockKeyVaultService.ensureVaultInitialized).toHaveBeenCalledWith(
      'default.default.User#phone'
    );
    expect(mockKeyVaultService.getActiveHmacKey).toHaveBeenCalledWith(
      'default.default.User#phone'
    );
  });
});

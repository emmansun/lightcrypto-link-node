'use strict';

const MongooseQueryTransformer = require('../../../src/adapter/MongooseQueryTransformer');

describe('MongooseQueryTransformer', () => {
  let transformer;
  let mockCodec;
  let mockKeyVaultService;
  let mockSerializer;

  beforeEach(() => {
    mockCodec = {
      generateBlindIndex: jest.fn().mockReturnValue('blind-hash-123')
    };

    mockKeyVaultService = {
      ensureVaultInitialized: jest.fn().mockResolvedValue(undefined),
      getActiveHmacKey: jest.fn().mockResolvedValue(Buffer.alloc(32))
    };

    mockSerializer = {
      serializeToString: jest.fn(v => String(v))
    };

    transformer = new MongooseQueryTransformer({
      codec: mockCodec,
      keyVaultService: mockKeyVaultService,
      serializer: mockSerializer,
      entityName: 'TestEntity'
    });
  });

  describe('rewriteFieldName', () => {
    test('appends .b suffix', () => {
      expect(transformer.rewriteFieldName('phone')).toBe('phone.b');
    });

    test('works with nested field', () => {
      expect(transformer.rewriteFieldName('address.city')).toBe('address.city.b');
    });
  });

  describe('supportsField', () => {
    test('returns true when field has blindIndex: true', () => {
      const fields = new Map([['phone', { encrypt: true, blindIndex: true }]]);
      expect(transformer.supportsField('phone', fields)).toBe(true);
    });

    test('returns false when field has blindIndex: false', () => {
      const fields = new Map([['name', { encrypt: true, blindIndex: false }]]);
      expect(transformer.supportsField('name', fields)).toBe(false);
    });

    test('returns false when field is not in encryptedFields', () => {
      const fields = new Map();
      expect(transformer.supportsField('phone', fields)).toBe(false);
    });

    test('returns false when encryptedFields is null', () => {
      expect(transformer.supportsField('phone', null)).toBe(false);
    });
  });

  describe('rewriteQueryValue', () => {
    test('computes blind index hash', async () => {
      const result = await transformer.rewriteQueryValue('test-value', 'TestEntity#phone');
      expect(result).toBe('blind-hash-123');
      expect(mockKeyVaultService.ensureVaultInitialized).toHaveBeenCalled();
      expect(mockKeyVaultService.getActiveHmacKey).toHaveBeenCalled();
      expect(mockCodec.generateBlindIndex).toHaveBeenCalled();
    });
  });

  describe('rewriteQuery', () => {
    test('rewrites exact match query', async () => {
      const query = { phone: '123-456' };
      const fields = new Map([['phone', { encrypt: true, blindIndex: true }]]);

      const result = await transformer.rewriteQuery(query, fields);
      expect(result).toEqual({ 'phone.b': 'blind-hash-123' });
      expect(result).not.toHaveProperty('phone');
    });

    test('rewrites $in query', async () => {
      const query = { phone: { $in: ['111', '222'] } };
      const fields = new Map([['phone', { encrypt: true, blindIndex: true }]]);

      const result = await transformer.rewriteQuery(query, fields);
      expect(result).toEqual({ 'phone.b': { $in: ['blind-hash-123', 'blind-hash-123'] } });
      expect(result).not.toHaveProperty('phone');
    });

    test('skips range operators', async () => {
      const query = { phone: { $gt: '100' } };
      const fields = new Map([['phone', { encrypt: true, blindIndex: true }]]);

      const result = await transformer.rewriteQuery(query, fields);
      expect(result).toEqual({ phone: { $gt: '100' } });
    });

    test('throws for encrypted field without blindIndex', async () => {
      const query = { name: 'Alice' };
      const fields = new Map([['name', { encrypt: true, blindIndex: false }]]);

      await expect(transformer.rewriteQuery(query, fields)).rejects.toThrow(
        /without blindIndex: true/
      );
    });

    test('returns non-object query as-is', async () => {
      const result = await transformer.rewriteQuery(null, new Map());
      expect(result).toBeNull();
    });

    test('ignores non-encrypted fields', async () => {
      const query = { name: 'Alice' };
      const fields = new Map();

      const result = await transformer.rewriteQuery(query, fields);
      expect(result).toEqual({ name: 'Alice' });
    });

    test('handles customFieldName', async () => {
      const query = { phone: '123' };
      const fields = new Map([['phone', { encrypt: true, blindIndex: true, customFieldName: 'phoneNumber' }]]);

      await transformer.rewriteQuery(query, fields);
      expect(mockCodec.generateBlindIndex).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.any(Object),
        'phoneNumber',
        '123'
      );
    });
  });

  describe('constructor defaults', () => {
    test('creates with empty deps', () => {
      const t = new MongooseQueryTransformer();
      expect(t._codec).toBeUndefined();
    });
  });
});

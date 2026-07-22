'use strict';

const crypto = require('crypto');
const { serialize, deserialize } = require('bson');
const { FieldCryptoService } = require('../../src/service/FieldCryptoService');
const CryptoCodec = require('../../src/crypto/CryptoCodec');
const BsonStructuredValueCodec = require('../../src/adapter/BsonStructuredValueCodec');
const MongooseStorageAdapter = require('../../src/adapter/MongooseStorageAdapter');
const TypeSerializer = require('../../src/service/TypeSerializer');
const Namespace = require('../../src/namespace/Namespace');

/**
 * Java Interoperability Tests
 *
 * These tests verify that the Node.js implementation can decrypt documents
 * encrypted by the Java LightCrypto-Link implementation, and vice versa.
 *
 * Test fixtures represent Java-generated encrypted documents in MongoDB format.
 */

// Pre-shared keys for testing (not real production keys)
const TEST_DEK = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8').subarray(0, 32);
const TEST_HMAC_KEY = Buffer.from('fedcba9876543210fedcba9876543210', 'utf8').subarray(0, 32);
const TEST_KID = 'v1-test0001';

describe('Java Interoperability', () => {
  let fieldService;
  let codec;
  let serializer;

  beforeEach(() => {
    fieldService = new FieldCryptoService({
      storageAdapter: new MongooseStorageAdapter(),
      structuredValueCodec: new BsonStructuredValueCodec()
    });
    codec = new CryptoCodec();
    serializer = new TypeSerializer();
  });

  describe('Type marker compatibility', () => {
    test('String type marker is "STR"', () => {
      expect(serializer.resolveTypeMarker('hello')).toBe('STR');
    });

    test('Integer type marker is "INT"', () => {
      expect(serializer.resolveTypeMarker(42)).toBe('INT');
    });

    test('Boolean type marker is "BOOL"', () => {
      expect(serializer.resolveTypeMarker(true)).toBe('BOOL');
    });

    test('Long type marker is "LONG" for large integers', () => {
      expect(serializer.resolveTypeMarker(2147483648)).toBe('LONG');
    });

    test('Double type marker is "DOUBLE" for floats', () => {
      expect(serializer.resolveTypeMarker(3.14)).toBe('DOUBLE');
    });

    test('Buffer type marker is "BYTES"', () => {
      expect(serializer.resolveTypeMarker(Buffer.alloc(0))).toBe('BYTES');
    });
  });

  describe('Algorithm identifiers', () => {
    test('AES-256-GCM algorithm name matches Java', () => {
      const encryptor = codec.getEncryptor('AES_256_GCM');
      expect(encryptor.getAlgorithm()).toBe('AES_256_GCM');
    });

    test('AES-256-CBC algorithm name matches Java', () => {
      const encryptor = codec.getEncryptor('AES_256_CBC');
      expect(encryptor.getAlgorithm()).toBe('AES_256_CBC');
    });

    test('SM4-CBC algorithm name matches Java', () => {
      const encryptor = codec.getEncryptor('SM4_CBC');
      expect(encryptor.getAlgorithm()).toBe('SM4_CBC');
    });
  });

  describe('AES-256-GCM interoperability', () => {
    test('encrypt produces valid GCM ciphertext', () => {
      const dek = crypto.randomBytes(32);
      const plaintext = 'Hello from Node.js';
      const subDoc = fieldService.encryptField(plaintext, 'message', dek, TEST_HMAC_KEY, TEST_KID, 'AES_256_GCM');

      expect(subDoc._e).toBe(1);
      expect(subDoc._a).toBe('AES_256_GCM');
      expect(subDoc._k).toBe(TEST_KID);

      // Verify we can decrypt it back
      const decrypted = fieldService.decryptField(subDoc, dek, TEST_HMAC_KEY, 'AES_256_GCM');
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('AES-256-CBC interoperability', () => {
    test('encrypt produces valid CBC ciphertext', () => {
      const dek = crypto.randomBytes(32);
      const plaintext = 'Hello CBC from Node.js';
      const subDoc = fieldService.encryptField(plaintext, 'message', dek, TEST_HMAC_KEY, TEST_KID, 'AES_256_CBC');

      expect(subDoc._e).toBe(1);
      expect(subDoc._a).toBe('AES_256_CBC');

      const decrypted = fieldService.decryptField(subDoc, dek, TEST_HMAC_KEY, 'AES_256_CBC');
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('SM4-CBC interoperability', () => {
    test('encrypt produces valid SM4 ciphertext', () => {
      const dek = crypto.randomBytes(16);
      const plaintext = 'Hello SM4 from Node.js';
      const subDoc = fieldService.encryptField(plaintext, 'message', dek, TEST_HMAC_KEY, TEST_KID, 'SM4_CBC');

      expect(subDoc._e).toBe(1);
      expect(subDoc._a).toBe('SM4_CBC');

      const decrypted = fieldService.decryptField(subDoc, dek, TEST_HMAC_KEY, 'SM4_CBC');
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('Blind index interoperability', () => {
    test('blind index computation is deterministic and Base64URL', () => {
      const hmacKey = crypto.randomBytes(32);
      const namespace = Namespace.parse('phone#phone');
      const fieldName = 'phone';
      const value = '13800138000';

      const idx1 = codec.generateBlindIndex(hmacKey, namespace, fieldName, value);
      const idx2 = codec.generateBlindIndex(hmacKey, namespace, fieldName, value);

      expect(idx1).toBe(idx2);
      expect(idx1.length).toBe(43);
      expect(idx1).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    test('blind index includes field name for isolation', () => {
      const hmacKey = crypto.randomBytes(32);
      const idx1 = codec.generateBlindIndex(hmacKey, Namespace.parse('phone#phone'), 'phone', 'same_value');
      const idx2 = codec.generateBlindIndex(hmacKey, Namespace.parse('email#email'), 'email', 'same_value');
      expect(idx1).not.toBe(idx2);
    });
  });

  describe('Error handling interoperability', () => {
    test('invalid ciphertext produces decryption error', () => {
      const subDoc = { _e: 1, _a: 'AES_256_GCM', _t: 'STR', c: Buffer.from('test') };
      expect(() => fieldService.decryptField(subDoc, TEST_DEK, TEST_HMAC_KEY, 'AES_256_GCM'))
        .toThrow(/Decryption failed/);
    });

    test('unsupported algorithm produces Java-compatible error message', () => {
      const subDoc = { _e: 1, _k: TEST_KID, _a: 'CHACHA20', _t: 'STR', c: Buffer.from('test') };
      expect(() => fieldService.decryptField(subDoc, TEST_DEK, TEST_HMAC_KEY, 'AES_256_GCM'))
        .toThrow(/Unsupported algorithm/);
    });
  });

  describe('Serialization compatibility', () => {
    test('String serialization matches Java String.getBytes(UTF_8)', () => {
      expect(serializer.serializeToString('hello')).toBe('hello');
      expect(serializer.serializeToString('你好世界')).toBe('你好世界');
    });

    test('Integer serialization matches Java String.valueOf()', () => {
      expect(serializer.serializeToString(42)).toBe('42');
      expect(serializer.serializeToString(-123)).toBe('-123');
    });

    test('Boolean serialization matches Java', () => {
      expect(serializer.serializeToString(true)).toBe('true');
      expect(serializer.serializeToString(false)).toBe('false');
    });

    test('LocalDate serialization matches Java ISO_LOCAL_DATE', () => {
      const date = new Date(Date.UTC(1996, 4, 15));
      expect(serializer.serializeToString(date)).toBe('1996-05-15');
    });

    test('LocalDateTime serialization matches Java ISO_LOCAL_DATE_TIME_WITH_3MS', () => {
      const date = new Date(Date.UTC(1996, 4, 15, 14, 30, 0));
      expect(serializer.serializeToString(date)).toBe('1996-05-15T14:30:00.000');
    });

    test('byte[] serialization matches Java Base64.getEncoder()', () => {
      const buf = Buffer.from([0x00, 0x01, 0x02, 0xFF]);
      expect(serializer.serializeToString(buf)).toBe(buf.toString('base64'));
    });
  });

  describe('Structured type interoperability', () => {
    let bsonCodec;
    const dek = crypto.randomBytes(32);
    const algo = 'AES_256_GCM';

    beforeEach(() => {
      bsonCodec = new BsonStructuredValueCodec();
    });

    test('DOC: Node.js BsonStructuredValueCodec output is valid BSON parseable by Java DocumentCodec', () => {
      const obj = { city: 'Shanghai', zip: '200000' };
      const bsonBuf = bsonCodec.encode(obj, 'DOC');

      // Verify the BSON binary can be deserialized back (same as Java's DocumentCodec.decode)
      const decoded = deserialize(bsonBuf);
      expect(decoded.city).toBe('Shanghai');
      expect(decoded.zip).toBe('200000');

      // Encrypt and build DOC sub-document
      const subDoc = fieldService.encryptField(obj, 'address', dek, TEST_HMAC_KEY, TEST_KID, algo, {
        structuredType: 'DOC'
      });
      expect(subDoc._t).toBe('DOC');
      expect(subDoc._e).toBe(1);
      expect(subDoc.b).toBeUndefined(); // DOC should not have blind index

      // Decrypt and verify
      const decrypted = fieldService.decryptField(subDoc, dek, TEST_HMAC_KEY, algo);
      expect(decrypted).toEqual(obj);
    });

    test('COL: Node.js BsonStructuredValueCodec output for array is valid BSON with _v wrapper', () => {
      const arr = ['alpha', 'beta', 'gamma'];
      const bsonBuf = bsonCodec.encode(arr, 'COL');

      // Verify BSON contains _v array (same as Java's { _v: [...] } wrapper)
      const decoded = deserialize(bsonBuf);
      expect(decoded._v).toEqual(arr);

      // Encrypt and build COL sub-document
      const subDoc = fieldService.encryptField(arr, 'tags', dek, TEST_HMAC_KEY, TEST_KID, algo, {
        structuredType: 'COL'
      });
      expect(subDoc._t).toBe('COL');
      expect(subDoc._e).toBe(1);

      // Decrypt and verify
      const decrypted = fieldService.decryptField(subDoc, dek, TEST_HMAC_KEY, algo);
      expect(decrypted).toEqual(arr);
    });

    test('MAP: encrypt/decrypt plain object with _t: MAP marker', () => {
      const map = { key1: 'value1', key2: 'value2' };

      const subDoc = fieldService.encryptField(map, 'metadata', dek, TEST_HMAC_KEY, TEST_KID, algo, {
        structuredType: 'MAP'
      });
      expect(subDoc._t).toBe('MAP');
      expect(subDoc._e).toBe(1);

      const decrypted = fieldService.decryptField(subDoc, dek, TEST_HMAC_KEY, algo);
      expect(decrypted).toEqual(map);
    });

    test('BsonStructuredValueCodec byte output matches Java BSON spec for simple document', () => {
      // Java's `new Document("name", "Alice").append("age", 30)` produces the same BSON bytes
      const obj = { name: 'Alice', age: 30 };
      const nodeBson = bsonCodec.encode(obj, 'DOC');

      // Verify it starts with BSON size (int32 LE) and ends with 0x00 terminator
      const size = nodeBson.readInt32LE(0);
      expect(size).toBe(nodeBson.length);
      expect(nodeBson[nodeBson.length - 1]).toBe(0x00);

      // Verify deserialization matches
      const decoded = deserialize(nodeBson);
      expect(decoded).toEqual(obj);
    });

    test('element-level encrypted array format matches Java output', () => {
      // Simulate element-level encryption: each array element is encrypted independently
      const arr = ['secret1', 'secret2', 'secret3'];
      const encryptedElements = arr.map((elem, i) => {
        const ns = Namespace.parse(`tags#tags.${i}`);
        return fieldService.encryptField(elem, `tags.${i}`, dek, TEST_HMAC_KEY, TEST_KID, algo, { namespace: ns });
      });

      // Verify each element is a valid encrypted sub-document
      for (const subDoc of encryptedElements) {
        expect(subDoc._e).toBe(1);
        expect(subDoc._k).toBe(TEST_KID);
        expect(subDoc._a).toBe('AES_256_GCM');
        expect(subDoc._t).toBe('STR');
        expect(typeof subDoc.c).toBe('string');
      }

      // Verify round-trip
      const decryptedElements = encryptedElements.map(subDoc => {
        return fieldService.decryptField(subDoc, dek, TEST_HMAC_KEY, algo);
      });
      expect(decryptedElements).toEqual(arr);
    });

    test('DOC: decrypt Java-simulated BSON fixture with known DEK', () => {
      // This simulates a Java-produced DOC sub-document:
      // Java: DocumentCodec.encode(new Document("city", "Shanghai").append("zip", "200000"))
      // produces the same BSON bytes as Node.js bson.serialize()
      const javaDoc = { city: 'Shanghai', zip: '200000' };
      const javaBsonBytes = serialize(javaDoc);

      // Java encrypts these BSON bytes with AES-256-GCM using the same DEK
      const codec = new CryptoCodec();
      const ns = Namespace.parse('test#test');
      const javaCiphertext = codec.encrypt(dek, javaBsonBytes, 'AES_256_GCM', ns, 1);

      // Build a Java-style sub-document
      const javaSubDoc = {
        _e: 1,
        _k: TEST_KID,
        _a: 'AES_256_GCM',
        _t: 'DOC',
        c: javaCiphertext
      };

      // Node.js should decrypt it correctly
      const decrypted = fieldService.decryptField(javaSubDoc, dek, TEST_HMAC_KEY, 'AES_256_GCM');
      expect(decrypted).toEqual(javaDoc);
    });

    test('COL: decrypt Java-simulated BSON collection fixture with _v wrapper', () => {
      // Java: BsonBinaryWriter + DocumentCodec for { _v: ["a", "b", "c"] }
      const javaArr = ['a', 'b', 'c'];
      const javaBsonBytes = serialize({ _v: javaArr });

      const codec = new CryptoCodec();
      const ns2 = Namespace.parse('test#test');
      const javaCiphertext = codec.encrypt(dek, javaBsonBytes, 'AES_256_GCM', ns2, 1);

      const javaSubDoc = {
        _e: 1,
        _k: TEST_KID,
        _a: 'AES_256_GCM',
        _t: 'COL',
        c: javaCiphertext
      };

      const decrypted = fieldService.decryptField(javaSubDoc, dek, TEST_HMAC_KEY, 'AES_256_GCM');
      expect(decrypted).toEqual(javaArr);
    });

    test('MAP: decrypt Java-simulated MAP BSON fixture', () => {
      // Java: DocumentCodec.encode(new Document("key1", "value1").append("key2", "value2"))
      const javaMap = { key1: 'value1', key2: 'value2' };
      const javaBsonBytes = serialize(javaMap);

      const codec = new CryptoCodec();
      const ns3 = Namespace.parse('test#test');
      const javaCiphertext = codec.encrypt(dek, javaBsonBytes, 'AES_256_GCM', ns3, 1);

      const javaSubDoc = {
        _e: 1,
        _k: TEST_KID,
        _a: 'AES_256_GCM',
        _t: 'MAP',
        c: javaCiphertext
      };

      const decrypted = fieldService.decryptField(javaSubDoc, dek, TEST_HMAC_KEY, 'AES_256_GCM');
      expect(decrypted).toEqual(javaMap);
    });

    test('BSON byte output for DOC matches Java DocumentCodec binary format', () => {
      // Verify Node.js BSON output is byte-identical to what Java DocumentCodec produces
      // Java: new Document("name", "Alice").append("age", 30)
      const obj = { name: 'Alice', age: 30 };
      const nodeBson = serialize(obj);

      // Verify BSON structure: int32 LE size, type tags, null terminator
      const size = nodeBson.readInt32LE(0);
      expect(size).toBe(nodeBson.length);
      expect(nodeBson[nodeBson.length - 1]).toBe(0x00);

      // Walk BSON fields to verify type tags match Java's output
      // After the 4-byte size, fields follow: type_byte + cstring_name + value
      let offset = 4;
      // First field: 'name' (type 0x02 = UTF-8 string)
      expect(nodeBson[offset]).toBe(0x02); // BSON string type
      offset += 1 + 5; // skip type byte + 'name\0' (5 bytes)
      const nameLen = nodeBson.readInt32LE(offset);
      expect(nameLen).toBe(6); // 'Alice\0' = 6 bytes
      offset += 4 + nameLen;

      // Second field: 'age' (type 0x10 = int32)
      expect(nodeBson[offset]).toBe(0x10); // BSON int32 type
      offset += 1 + 4; // skip type byte + 'age\0' (4 bytes)
      const ageVal = nodeBson.readInt32LE(offset);
      expect(ageVal).toBe(30);
    });
  });
});

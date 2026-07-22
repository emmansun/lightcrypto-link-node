'use strict';

const WireFormatEncoder = require('../../../src/format/WireFormatEncoder');
const WireFormatDecoder = require('../../../src/format/WireFormatDecoder');
const Namespace = require('../../../src/namespace/Namespace');

describe('WireFormatDecoder', () => {
  const ns = Namespace.parse('User#phone');

  describe('decode()', () => {
    it('decodes a valid Wire Format V1 blob', () => {
      const iv = Buffer.alloc(12, 0xCC);
      const ct = Buffer.from('test-ct');
      const blob = WireFormatEncoder.encode('AES_256_GCM', ns, 1, iv, ct);
      const decoded = WireFormatDecoder.decode(blob);

      expect(decoded.version).toBe(0x01);
      expect(decoded.algorithm).toBe('AES_256_GCM');
      expect(decoded.namespace).toBe(ns.canonical());
      expect(decoded.dekVersion).toBe(1);
      expect(decoded.iv).toEqual(iv);
      expect(decoded.aadExt).toEqual(Buffer.alloc(0));
      expect(decoded.ciphertext).toEqual(ct);
    });

    it('throws on unsupported version', () => {
      const blob = Buffer.alloc(20);
      blob[0] = 0x02; // wrong version
      expect(() => WireFormatDecoder.decode(blob)).toThrow('Unsupported wire format version');
    });

    it('throws on truncated blob', () => {
      expect(() => WireFormatDecoder.decode(Buffer.alloc(5))).toThrow('Truncated');
    });

    it('throws on empty ciphertext', () => {
      // Build a valid blob but with 0 ciphertext bytes
      const iv = Buffer.alloc(12, 0xDD);
      const nsBytes = ns.canonicalBytes();
      const blob = Buffer.alloc(1 + 1 + 2 + nsBytes.length + 4 + 1 + 12 + 2);
      let offset = 0;
      blob[offset++] = 0x01;
      blob[offset++] = 0x01;
      blob.writeUInt16BE(nsBytes.length, offset); offset += 2;
      nsBytes.copy(blob, offset); offset += nsBytes.length;
      blob.writeUInt32BE(1, offset); offset += 4;
      blob[offset++] = 12;
      iv.copy(blob, offset); offset += 12;
      blob.writeUInt16BE(0, offset); // aadExtLen = 0
      expect(() => WireFormatDecoder.decode(blob)).toThrow('Empty ciphertext');
    });
  });

  describe('decodeFromBase64Url()', () => {
    it('decodes a Base64URL-encoded blob', () => {
      const iv = Buffer.alloc(12, 0xEE);
      const ct = Buffer.from('payload');
      const b64 = WireFormatEncoder.encodeToBase64Url('AES_256_CBC', ns, 2, iv, ct);
      const decoded = WireFormatDecoder.decodeFromBase64Url(b64);

      expect(decoded.algorithm).toBe('AES_256_CBC');
      expect(decoded.dekVersion).toBe(2);
      expect(decoded.iv).toEqual(iv);
      expect(decoded.ciphertext).toEqual(ct);
    });
  });

  describe('reconstructAad()', () => {
    it('reconstructs AAD identical to the original', () => {
      const iv = Buffer.alloc(12, 0xFF);
      const ct = Buffer.from('data');
      const blob = WireFormatEncoder.encode('AES_256_GCM', ns, 3, iv, ct);
      const decoded = WireFormatDecoder.decode(blob);
      const aad = WireFormatDecoder.reconstructAad(decoded);
      const originalAad = WireFormatEncoder.buildAad('AES_256_GCM', ns, 3);
      expect(aad).toEqual(originalAad);
    });
  });
});

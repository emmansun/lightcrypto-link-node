'use strict';

const WireFormatEncoder = require('../../../src/format/WireFormatEncoder');
const Namespace = require('../../../src/namespace/Namespace');

describe('WireFormatEncoder', () => {
  const ns = Namespace.parse('User#phone');

  describe('encode()', () => {
    it('produces correct binary layout', () => {
      const iv = Buffer.alloc(12, 0xAA);
      const ct = Buffer.from('ciphertext');
      const blob = WireFormatEncoder.encode('AES_256_GCM', ns, 1, iv, ct);

      expect(blob[0]).toBe(0x01); // version
      expect(blob[1]).toBe(0x01); // algId for AES_256_GCM
      const nsLen = blob.readUInt16BE(2);
      expect(nsLen).toBe(ns.canonicalBytes().length);
      const nsStr = blob.subarray(4, 4 + nsLen).toString('utf8');
      expect(nsStr).toBe(ns.canonical());
      const dekVersion = blob.readUInt32BE(4 + nsLen);
      expect(dekVersion).toBe(1);
      const ivLen = blob[4 + nsLen + 4];
      expect(ivLen).toBe(12);
      const ivBytes = blob.subarray(4 + nsLen + 4 + 1, 4 + nsLen + 4 + 1 + 12);
      expect(ivBytes).toEqual(iv);
      const aadExtLen = blob.readUInt16BE(4 + nsLen + 4 + 1 + 12);
      expect(aadExtLen).toBe(0);
      const ctBytes = blob.subarray(4 + nsLen + 4 + 1 + 12 + 2);
      expect(ctBytes).toEqual(ct);
    });

    it('throws on empty namespace', () => {
      // Use a namespace with 0-byte canonical would require an invalid ns,
      // so test via direct call with zero-length buffer
      expect(() => {
        WireFormatEncoder.encode('AES_256_GCM', { canonicalBytes: () => Buffer.alloc(0), canonical: () => '' }, 1, Buffer.alloc(12), Buffer.alloc(1));
      }).toThrow();
    });

    it('throws on dekVersion < 1', () => {
      expect(() => {
        WireFormatEncoder.encode('AES_256_GCM', ns, 0, Buffer.alloc(12), Buffer.alloc(1));
      }).toThrow('dekVersion must be >= 1');
    });
  });

  describe('encodeToBase64Url()', () => {
    it('returns a Base64URL string (no padding)', () => {
      const iv = Buffer.alloc(12, 0xBB);
      const ct = Buffer.from('hello');
      const result = WireFormatEncoder.encodeToBase64Url('AES_256_GCM', ns, 1, iv, ct);
      expect(typeof result).toBe('string');
      expect(result).not.toContain('='); // no padding
      expect(result).not.toContain('+'); // no standard base64 chars
    });
  });

  describe('buildAad()', () => {
    it('produces correct AAD layout', () => {
      const aad = WireFormatEncoder.buildAad('AES_256_GCM', ns, 1);
      expect(aad[0]).toBe(0x01); // version
      expect(aad[1]).toBe(0x01); // algId
      const nsBytes = ns.canonicalBytes();
      expect(aad.subarray(2, 2 + nsBytes.length)).toEqual(nsBytes);
      expect(aad.readUInt32BE(2 + nsBytes.length)).toBe(1);
    });

    it('total AAD length is 1 + 1 + nsLen + 4', () => {
      const aad = WireFormatEncoder.buildAad('AES_256_GCM', ns, 1);
      expect(aad.length).toBe(1 + 1 + ns.canonicalBytes().length + 4);
    });
  });
});

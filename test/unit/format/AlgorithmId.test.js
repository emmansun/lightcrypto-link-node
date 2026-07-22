'use strict';

const { AlgorithmId, fromName, fromByte } = require('../../../src/format/AlgorithmId');

describe('AlgorithmId', () => {
  describe('registry entries', () => {
    it('AES_256_GCM maps to 0x01 with ivLen=12, keyLen=32, isGcm=true', () => {
      expect(AlgorithmId.AES_256_GCM.id).toBe(0x01);
      expect(AlgorithmId.AES_256_GCM.ivLength).toBe(12);
      expect(AlgorithmId.AES_256_GCM.keyLength).toBe(32);
      expect(AlgorithmId.AES_256_GCM.isGcm).toBe(true);
      expect(AlgorithmId.AES_256_GCM.name).toBe('AES_256_GCM');
    });

    it('AES_256_CBC maps to 0x02 with ivLen=16, keyLen=32, isGcm=false', () => {
      expect(AlgorithmId.AES_256_CBC.id).toBe(0x02);
      expect(AlgorithmId.AES_256_CBC.ivLength).toBe(16);
      expect(AlgorithmId.AES_256_CBC.keyLength).toBe(32);
      expect(AlgorithmId.AES_256_CBC.isGcm).toBe(false);
      expect(AlgorithmId.AES_256_CBC.name).toBe('AES_256_CBC');
    });

    it('SM4_GCM maps to 0x03 with ivLen=12, keyLen=16, isGcm=true', () => {
      expect(AlgorithmId.SM4_GCM.id).toBe(0x03);
      expect(AlgorithmId.SM4_GCM.ivLength).toBe(12);
      expect(AlgorithmId.SM4_GCM.keyLength).toBe(16);
      expect(AlgorithmId.SM4_GCM.isGcm).toBe(true);
      expect(AlgorithmId.SM4_GCM.name).toBe('SM4_GCM');
    });

    it('SM4_CBC maps to 0x04 with ivLen=16, keyLen=16, isGcm=false', () => {
      expect(AlgorithmId.SM4_CBC.id).toBe(0x04);
      expect(AlgorithmId.SM4_CBC.ivLength).toBe(16);
      expect(AlgorithmId.SM4_CBC.keyLength).toBe(16);
      expect(AlgorithmId.SM4_CBC.isGcm).toBe(false);
      expect(AlgorithmId.SM4_CBC.name).toBe('SM4_CBC');
    });
  });

  describe('fromName()', () => {
    it('returns correct entry for known algorithms', () => {
      expect(fromName('AES_256_GCM').id).toBe(0x01);
      expect(fromName('AES_256_CBC').id).toBe(0x02);
      expect(fromName('SM4_GCM').id).toBe(0x03);
      expect(fromName('SM4_CBC').id).toBe(0x04);
    });

    it('throws for unknown algorithm', () => {
      expect(() => fromName('UNKNOWN')).toThrow('Unknown algorithm');
    });
  });

  describe('fromByte()', () => {
    it('returns correct entry for known byte identifiers', () => {
      expect(fromByte(0x01).name).toBe('AES_256_GCM');
      expect(fromByte(0x02).name).toBe('AES_256_CBC');
      expect(fromByte(0x03).name).toBe('SM4_GCM');
      expect(fromByte(0x04).name).toBe('SM4_CBC');
    });

    it('throws for unknown byte identifier', () => {
      expect(() => fromByte(0xFF)).toThrow('Unknown algorithm byte');
    });
  });
});

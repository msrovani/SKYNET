import { describe, it, expect, beforeEach } from 'vitest';
import { ZipNNCompressor } from '../zipnn-compress.js';
import type { QuantBitWidth } from '../zipnn-compress.js';

describe('ZipNN Compression Tests', () => {
  let compressor: ZipNNCompressor;

  beforeEach(() => {
    compressor = new ZipNNCompressor();
  });

  describe('Compression', () => {
    it('should compress Float32Array and produce correct output structure', async () => {
      const originalData = new Float32Array(1024);
      for (let i = 0; i < originalData.length; i++) originalData[i] = Math.random() * 2 - 1;
      const result = await compressor.compress(originalData);
      expect(result.compressedData).toBeInstanceOf(Uint8Array);
      expect(result.originalSize).toBe(1024 * 4);
      expect(result.compressedSize).toBeGreaterThan(0);
      expect(result.metadata.blockSize).toBe(256);
      expect(result.metadata.quantBits).toBe(4);
      expect(result.metadata.entropyCoder).toBe('huffman');
      expect(result.metadata.originalShape).toEqual([1024]);
      expect(result.metadata.originalDtype).toBe('f32');
    });

    it('should compress large arrays with ratio improvement', async () => {
      const originalData = new Float32Array(10000);
      for (let i = 0; i < originalData.length; i++) {
        originalData[i] = Math.random() * 2 - 1;
      }
      const result = await compressor.compress(originalData);
      expect(result.originalSize).toBe(originalData.length * 4);
      expect(result.compressedSize).toBeLessThan(result.originalSize);
    });
  });

  describe('Decompression', () => {
    it('should decompress and restore data with moderate precision', async () => {
      const originalData = new Float32Array(1024);
      for (let i = 0; i < originalData.length; i++) {
        originalData[i] = Math.random() * 2 - 1;
      }
      const compressedResult = await compressor.compress(originalData);
      const decompressed = await compressor.decompress(compressedResult.compressedData, compressedResult.metadata);
      expect(decompressed.length).toBe(originalData.length);
      let maxError = 0;
      for (let i = 0; i < originalData.length; i++) {
        const err = Math.abs(decompressed[i] - originalData[i]);
        if (err > maxError) maxError = err;
      }
      expect(maxError).toBeLessThan(0.3);
    });
  });

  describe('Round Trip', () => {
    it('should maintain data integrity across compression/decompression cycles', async () => {
      const originalData = new Float32Array(500);
      for (let i = 0; i < originalData.length; i++) originalData[i] = Math.random() * 2 - 1;
      const compressedResult = await compressor.compress(originalData);
      const decompressed1 = await compressor.decompress(compressedResult.compressedData, compressedResult.metadata);
      const recompressed = await compressor.compress(decompressed1);
      const decompressed2 = await compressor.decompress(recompressed.compressedData, recompressed.metadata);
      expect(decompressed2.length).toBe(originalData.length);
      let maxError = 0;
      for (let i = 0; i < originalData.length; i++) {
        const err = Math.abs(decompressed2[i] - decompressed1[i]);
        if (err > maxError) maxError = err;
      }
      expect(maxError).toBeLessThan(0.3);
    });
  });

  describe('Error Handling', () => {
    it('should handle empty arrays', async () => {
      const emptyData = new Float32Array();
      const result = await compressor.compress(emptyData);
      expect(result.originalSize).toBe(0);
      expect(result.compressedSize).toBeGreaterThan(0);
    });

    it('should handle single-element arrays', async () => {
      const singleElement = new Float32Array([1.0]);
      const result = await compressor.compress(singleElement);
      const decompressed = await compressor.decompress(result.compressedData, result.metadata);
      expect(decompressed.length).toBe(1);
    });
  });

  describe('Configurable Parameters', () => {
    it('should accept different quantBits values', async () => {
      const data = new Float32Array(500);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const configs: QuantBitWidth[] = [2, 4, 8];
      for (const bits of configs) {
        const customCompressor = new ZipNNCompressor({ quantBits: bits });
        const result = await customCompressor.compress(data);
        expect(result.metadata.quantBits).toBe(bits);
        expect(result.compressedSize).toBeLessThan(data.length * 4);
      }
    });

    it('should accept different entropyCoders', async () => {
      const data = new Float32Array(500);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const customCompressor = new ZipNNCompressor({ entropyCoder: 'arithmetic' });
      const result = await customCompressor.compress(data);
      expect(result.metadata.entropyCoder).toBe('arithmetic');
      expect(result.compressedSize).toBeLessThan(data.length * 4);
    });
  });

  describe('Compression Ratio', () => {
    it('4-bit should achieve ~8x compression ratio', async () => {
      const data = new Float32Array(10000);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const comp = new ZipNNCompressor({ quantBits: 4 });
      const result = await comp.compress(data);
      expect(result.compressionRatio).toBeGreaterThan(6);
    });

    it('2-bit should achieve ~16x compression ratio', async () => {
      const data = new Float32Array(10000);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const comp = new ZipNNCompressor({ quantBits: 2 });
      const result = await comp.compress(data);
      expect(result.compressionRatio).toBeGreaterThan(12);
    });

    it('8-bit should achieve ~4x compression ratio', async () => {
      const data = new Float32Array(10000);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const comp = new ZipNNCompressor({ quantBits: 8 });
      const result = await comp.compress(data);
      expect(result.compressionRatio).toBeGreaterThan(3);
    });

    it('compression ratio varies inversely with quantBits', async () => {
      const data = new Float32Array(10000);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const r2 = (await new ZipNNCompressor({ quantBits: 2 }).compress(data)).compressionRatio;
      const r4 = (await new ZipNNCompressor({ quantBits: 4 }).compress(data)).compressionRatio;
      const r8 = (await new ZipNNCompressor({ quantBits: 8 }).compress(data)).compressionRatio;
      expect(r2).toBeGreaterThan(r4);
      expect(r4).toBeGreaterThan(r8);
    });
  });
});

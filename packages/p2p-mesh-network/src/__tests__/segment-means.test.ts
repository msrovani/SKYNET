import { describe, it, expect } from 'vitest';

describe('SegmentMeans', () => {
  it('compresses and decompresses data lossily', async () => {
    const { SegmentMeans } = await import('../segment-means.js');
    const sm = new SegmentMeans({ segmentSize: 4 });
    const data = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const compressed = sm.compress(data);
    expect(compressed.means.length).toBe(3);
    expect(compressed.means[0]).toBe(2.5);
    const decompressed = sm.decompress(compressed);
    expect(decompressed.length).toBe(10);
    expect(decompressed[0]).toBe(2.5);
    expect(decompressed[3]).toBe(2.5);
  });

  it('computes compression ratio', async () => {
    const { SegmentMeans } = await import('../segment-means.js');
    const sm = new SegmentMeans({ segmentSize: 16 });
    const data = new Float32Array(256);
    const ratio = sm.getCompressionRatio(data);
    expect(ratio).toBe(16);
  });

  it('handles data not divisible by segment size', async () => {
    const { SegmentMeans } = await import('../segment-means.js');
    const sm = new SegmentMeans({ segmentSize: 3 });
    const data = new Float32Array([1, 2, 3, 4, 5]);
    const compressed = sm.compress(data);
    expect(compressed.means.length).toBe(2);
    expect(compressed.lengths[0]).toBe(3);
    expect(compressed.lengths[1]).toBe(2);
    const decompressed = sm.decompress(compressed);
    expect(decompressed[0]).toBe(2);
    expect(decompressed[4]).toBe(4.5);
  });

  it('adaptive mode adjusts segment size based on data length', async () => {
    const { SegmentMeans } = await import('../segment-means.js');
    const sm = new SegmentMeans({ adaptive: true, minSegments: 4, maxSegments: 16 });
    const data = new Float32Array(256);
    const compressed = sm.compress(data);
    expect(compressed.means.length).toBeGreaterThanOrEqual(4);
    expect(compressed.means.length).toBeLessThanOrEqual(16);
  });

  it('updates config dynamically', async () => {
    const { SegmentMeans } = await import('../segment-means.js');
    const sm = new SegmentMeans({ segmentSize: 8 });
    expect(sm.getCompressionRatio(new Float32Array(64))).toBe(8);
    sm.updateConfig({ segmentSize: 4 });
    expect(sm.getCompressionRatio(new Float32Array(64))).toBe(4);
  });

  it('preserves tensor shape metadata', async () => {
    const { SegmentMeans } = await import('../segment-means.js');
    const sm = new SegmentMeans({ segmentSize: 8 });
    const data = new Float32Array(20);
    const compressed = sm.compress(data);
    expect(compressed.originalLength).toBe(20);
    expect(compressed.segmentSize).toBe(8);
  });
});

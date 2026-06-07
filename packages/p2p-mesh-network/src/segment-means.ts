export interface SegmentMeansConfig {
  segmentSize: number;
  enabled: boolean;
  adaptive: boolean;
  minSegments: number;
  maxSegments: number;
}

export interface CompressedSegment {
  means: Float32Array;
  lengths: Uint32Array;
  originalLength: number;
  segmentSize: number;
}

const DEFAULT_CONFIG: SegmentMeansConfig = {
  segmentSize: 16,
  enabled: true,
  adaptive: false,
  minSegments: 4,
  maxSegments: 1024,
};

export class SegmentMeans {
  private config: SegmentMeansConfig;

  constructor(config: Partial<SegmentMeansConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private estimateOptimalSegmentSize(dataLength: number): number {
    if (!this.config.adaptive) return this.config.segmentSize;
    const targetSegments = Math.max(
      this.config.minSegments,
      Math.min(this.config.maxSegments, Math.floor(Math.sqrt(dataLength))),
    );
    return Math.max(1, Math.floor(dataLength / targetSegments));
  }

  compress(data: Float32Array): CompressedSegment {
    const segSize = this.estimateOptimalSegmentSize(data.length);
    const numSegments = Math.ceil(data.length / segSize);
    const means = new Float32Array(numSegments);
    const lengths = new Uint32Array(numSegments);
    for (let i = 0; i < numSegments; i++) {
      const start = i * segSize;
      const end = Math.min(start + segSize, data.length);
      const len = end - start;
      lengths[i] = len;
      let sum = 0;
      for (let j = start; j < end; j++) sum += data[j];
      means[i] = sum / len;
    }
    return { means, lengths, originalLength: data.length, segmentSize: segSize };
  }

  decompress(compressed: CompressedSegment): Float32Array {
    const result = new Float32Array(compressed.originalLength);
    const segSize = compressed.segmentSize;
    for (let i = 0; i < compressed.means.length; i++) {
      const start = i * segSize;
      const len = compressed.lengths[i];
      const mean = compressed.means[i];
      for (let j = 0; j < len; j++) result[start + j] = mean;
    }
    return result;
  }

  getCompressionRatio(data: Float32Array): number {
    const originalBytes = data.length * 4;
    const compressedBytes = this.compress(data).means.length * 4;
    return originalBytes / Math.max(compressedBytes, 1);
  }

  updateConfig(config: Partial<SegmentMeansConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

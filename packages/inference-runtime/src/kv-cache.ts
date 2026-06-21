export interface P2PKVCacheEntry {
  prefixTokens: number[];
  keyCache: Float32Array;
  valueCache: Float32Array;
  layerIndex: number;
}

export interface PeerKVCacheOffer {
  peerId: string;
  prefixTokenCount: number;
  entryCount: number;
  modelId: string;
  rttMs: number;
}

export interface RegistryTreeNode {
  nodeId: string;
  prefix: string;
  children: Map<string, RegistryTreeNode>;
  entries: P2PKVCacheEntry[];
}

export class LMCacheP2P {
  private localCache: Map<string, P2PKVCacheEntry> = new Map();
  private peerOffers: Map<string, PeerKVCacheOffer[]> = new Map();
  private registryTree: RegistryTreeNode;
  private readonly MAX_LOCAL_ENTRIES = 100;

  constructor() {
    this.registryTree = { nodeId: 'root', prefix: '', children: new Map(), entries: [] };
  }

  addLocalEntry(key: string, entry: P2PKVCacheEntry): void {
    if (this.localCache.size >= this.MAX_LOCAL_ENTRIES) {
      const first = this.localCache.keys().next().value;
      if (first) this.localCache.delete(first);
    }
    this.localCache.set(key, entry);
    this.insertIntoTree(key, entry);
  }

  getLocalEntry(key: string): P2PKVCacheEntry | undefined {
    return this.localCache.get(key);
  }

  registerPeerOffer(peerId: string, offer: PeerKVCacheOffer): void {
    if (!this.peerOffers.has(peerId)) this.peerOffers.set(peerId, []);
    const offers = this.peerOffers.get(peerId)!;
    const existing = offers.findIndex(o => o.prefixTokenCount === offer.prefixTokenCount);
    if (existing >= 0) offers[existing] = offer;
    else offers.push(offer);
    if (offers.length > 20) offers.shift();
  }

  findBestPeer(prefixTokenCount: number, maxRttMs: number): PeerKVCacheOffer | null {
    let best: PeerKVCacheOffer | null = null;
    for (const [, offers] of this.peerOffers) {
      for (const o of offers) {
        if (o.prefixTokenCount >= prefixTokenCount && o.rttMs <= maxRttMs) {
          if (!best || o.rttMs < best.rttMs) best = o;
        }
      }
    }
    return best;
  }

  private insertIntoTree(key: string, entry: P2PKVCacheEntry): void {
    let node = this.registryTree;
    for (let i = 0; i < Math.min(key.length, 4); i++) {
      const char = key[i];
      if (!node.children.has(char)) {
        node.children.set(char, { nodeId: `node_${char}`, prefix: char, children: new Map(), entries: [] });
      }
      node = node.children.get(char)!;
    }
    node.entries.push(entry);
    if (node.entries.length > 10) node.entries.shift();
  }

  searchByPrefix(prefix: string): P2PKVCacheEntry[] {
    let node = this.registryTree;
    for (const char of prefix) {
      if (!node.children.has(char)) return [];
      node = node.children.get(char)!;
    }
    return [...node.entries];
  }

  clear(): void {
    this.localCache.clear();
    this.peerOffers.clear();
    this.registryTree = { nodeId: 'root', prefix: '', children: new Map(), entries: [] };
  }
}

export class DroidSpeakKVSharing {
  private compatibleLayers: Map<string, number[]> = new Map();
  private readonly SHARABLE_LAYER_RATIO = 0.7;

  registerModelLayers(modelId: string, layerCount: number): void {
    const sharableCount = Math.floor(layerCount * this.SHARABLE_LAYER_RATIO);
    const firstSharable = layerCount - sharableCount;
    const layers: number[] = [];
    for (let i = firstSharable; i < layerCount; i++) layers.push(i);
    this.compatibleLayers.set(modelId, layers);
  }

  findCompatibleLayers(modelA: string, modelB: string): number[] {
    const layersA = this.compatibleLayers.get(modelA);
    const layersB = this.compatibleLayers.get(modelB);
    if (!layersA || !layersB) return [];
    return layersA.filter(l => layersB.includes(l));
  }

  getSharableRatio(modelId: string): number {
    return this.compatibleLayers.has(modelId) ? this.SHARABLE_LAYER_RATIO : 0;
  }

  clear(): void {
    this.compatibleLayers.clear();
  }
}

export class KVCompress {
  private readonly targetCompression: number;
  private readonly pageSize: number;

  constructor(targetCompression: number = 4, pageSize: number = 64) {
    this.targetCompression = Math.max(1, targetCompression);
    this.pageSize = pageSize;
  }

  compress(kvCache: Float32Array): { compressed: Float32Array; metadata: Uint8Array } {
    const n = kvCache.length;
    const compressedSize = Math.ceil(n / this.targetCompression);
    const compressed = new Float32Array(compressedSize);
    const metadata = new Uint8Array(Math.ceil(compressedSize / this.pageSize));
    for (let i = 0; i < compressedSize; i++) {
      const startIdx = i * this.targetCompression;
      const endIdx = Math.min(startIdx + this.targetCompression, n);
      let sum = 0;
      let count = 0;
      for (let j = startIdx; j < endIdx; j++) {
        sum += kvCache[j];
        count++;
      }
      compressed[i] = count > 0 ? sum / count : 0;
      if (i % this.pageSize === 0) {
        metadata[Math.floor(i / this.pageSize)] = 1;
      }
    }
    return { compressed, metadata };
  }
}

export type QuantBitWidth = 2 | 4 | 8;

export interface QuantizedKVCache {
  keys: Uint8Array;
  values: Uint8Array;
  scaleK: Float32Array;
  scaleV: Float32Array;
  zeroPointK: Uint8Array;
  zeroPointV: Uint8Array;
  groupSize: number;
  bitWidth: QuantBitWidth;
  numTokens: number;
  headDim: number;
}

export interface KVCacheQuantConfig {
  bitWidth: QuantBitWidth;
  groupSize: number;
  useHadamard: boolean;
}

const HADAMARD_4: readonly number[][] = [
  [1, 1, 1, 1],
  [1, -1, 1, -1],
  [1, 1, -1, -1],
  [1, -1, -1, 1],
];

const DEFAULT_QUANT_CONFIG: KVCacheQuantConfig = {
  bitWidth: 4,
  groupSize: 64,
  useHadamard: true,
};

function packBits(values: Uint8Array, bitWidth: QuantBitWidth): Uint8Array {
  const valsPerByte = 8 / bitWidth;
  const packedLen = Math.ceil(values.length / valsPerByte);
  const packed = new Uint8Array(packedLen);
  const mask = (1 << bitWidth) - 1;
  for (let i = 0; i < values.length; i++) {
    const pos = Math.floor(i / valsPerByte);
    const shift = (i % valsPerByte) * bitWidth;
    packed[pos] = (packed[pos] & ~(mask << shift)) | ((values[i] & mask) << shift);
  }
  return packed;
}

function unpackBits(packed: Uint8Array, numValues: number, bitWidth: QuantBitWidth): Uint8Array {
  const valsPerByte = 8 / bitWidth;
  const values = new Uint8Array(numValues);
  const mask = (1 << bitWidth) - 1;
  for (let i = 0; i < numValues; i++) {
    const pos = Math.floor(i / valsPerByte);
    const shift = (i % valsPerByte) * bitWidth;
    values[i] = (packed[pos] >> shift) & mask;
  }
  return values;
}

function applyHadamard4(data: Float32Array): Float32Array {
  const n = data.length;
  const rounded = Math.floor(n / 4) * 4;
  const out = new Float32Array(data);
  for (let i = 0; i < rounded; i += 4) {
    const a = out[i], b = out[i + 1], c = out[i + 2], d = out[i + 3];
    const h0 = a * HADAMARD_4[0][0] + b * HADAMARD_4[0][1] + c * HADAMARD_4[0][2] + d * HADAMARD_4[0][3];
    const h1 = a * HADAMARD_4[1][0] + b * HADAMARD_4[1][1] + c * HADAMARD_4[1][2] + d * HADAMARD_4[1][3];
    const h2 = a * HADAMARD_4[2][0] + b * HADAMARD_4[2][1] + c * HADAMARD_4[2][2] + d * HADAMARD_4[2][3];
    const h3 = a * HADAMARD_4[3][0] + b * HADAMARD_4[3][1] + c * HADAMARD_4[3][2] + d * HADAMARD_4[3][3];
    out[i] = h0; out[i + 1] = h1; out[i + 2] = h2; out[i + 3] = h3;
  }
  return out;
}

function inverseHadamard4(data: Float32Array): Float32Array {
  const n = data.length;
  const rounded = Math.floor(n / 4) * 4;
  const out = new Float32Array(data);
  for (let i = 0; i < rounded; i += 4) {
    const h0 = out[i], h1 = out[i + 1], h2 = out[i + 2], h3 = out[i + 3];
    const a = (h0 + h1 + h2 + h3) / 4;
    const b = (h0 - h1 + h2 - h3) / 4;
    const c = (h0 + h1 - h2 - h3) / 4;
    const d = (h0 - h1 - h2 + h3) / 4;
    out[i] = a; out[i + 1] = b; out[i + 2] = c; out[i + 3] = d;
  }
  return out;
}

export class KVCacheQuantizer {
  private config: KVCacheQuantConfig;

  constructor(config: Partial<KVCacheQuantConfig> = {}) {
    this.config = { ...DEFAULT_QUANT_CONFIG, ...config };
  }

  setConfig(cfg: Partial<KVCacheQuantConfig>): void {
    this.config = { ...this.config, ...cfg };
  }

  getConfig(): KVCacheQuantConfig {
    return { ...this.config };
  }

  quantizeKV(keyCache: Float32Array, valueCache: Float32Array, headDim: number = 1): QuantizedKVCache {
    const numTokens = Math.floor(keyCache.length / headDim);
    const { bitWidth, groupSize, useHadamard } = this.config;
    const maxVal = (1 << bitWidth) - 1;

    const process = (data: Float32Array): { quantized: Uint8Array; scales: Float32Array; zeroPoints: Uint8Array } => {
      const n = data.length;
      const numGroups = Math.ceil(n / groupSize);
      const scales = new Float32Array(numGroups);
      const zeroPoints = new Uint8Array(numGroups);
      const quantizedFloat = new Float32Array(n);
      let processed = data;
      if (useHadamard) processed = applyHadamard4(data);

      for (let g = 0; g < numGroups; g++) {
        const start = g * groupSize;
        const end = Math.min(start + groupSize, n);
        let minVal = Infinity;
        let maxValLocal = -Infinity;
        for (let i = start; i < end; i++) {
          const v = processed[i];
          if (v < minVal) minVal = v;
          if (v > maxValLocal) maxValLocal = v;
        }
        const range = maxValLocal - minVal;
        if (range < 1e-10) {
          scales[g] = 1;
          zeroPoints[g] = 0;
          for (let i = start; i < end; i++) quantizedFloat[i] = 0;
        } else {
          const scale = range / maxVal;
          scales[g] = scale;
          const zp = Math.round(-minVal / scale);
          zeroPoints[g] = Math.min(maxVal, Math.max(0, zp));
          for (let i = start; i < end; i++) {
            const q = Math.round(processed[i] / scale + zeroPoints[g]);
            quantizedFloat[i] = Math.min(maxVal, Math.max(0, q));
          }
        }
      }
      const quantizedU8 = new Uint8Array(n);
      for (let i = 0; i < n; i++) quantizedU8[i] = Math.round(quantizedFloat[i]);
      const packed = packBits(quantizedU8, bitWidth);
      return { quantized: packed, scales, zeroPoints };
    };

    const kResult = process(keyCache);
    const vResult = process(valueCache);

    return {
      keys: kResult.quantized,
      values: vResult.quantized,
      scaleK: kResult.scales,
      scaleV: vResult.scales,
      zeroPointK: kResult.zeroPoints,
      zeroPointV: vResult.zeroPoints,
      groupSize,
      bitWidth,
      numTokens,
      headDim,
    };
  }

  dequantizeKV(quantized: QuantizedKVCache): { keys: Float32Array; values: Float32Array } {
    const { keys, values, scaleK, scaleV, zeroPointK, zeroPointV, groupSize, bitWidth, numTokens, headDim } = quantized;
    const totalElements = numTokens * headDim;

    const dequantize = (packed: Uint8Array, scales: Float32Array, zeroPoints: Uint8Array): Float32Array => {
      const unpacked = unpackBits(packed, totalElements, bitWidth);
      const result = new Float32Array(totalElements);
      const numGroups = Math.ceil(totalElements / groupSize);
      for (let g = 0; g < numGroups; g++) {
        const start = g * groupSize;
        const end = Math.min(start + groupSize, totalElements);
        for (let i = start; i < end; i++) {
          const dq = (unpacked[i] - zeroPoints[g]) * scales[g];
          result[i] = dq;
        }
      }
      if (this.config.useHadamard) return inverseHadamard4(result);
      return result;
    };

    return {
      keys: dequantize(keys, scaleK, zeroPointK),
      values: dequantize(values, scaleV, zeroPointV),
    };
  }

  compressKVCache(keys: Float32Array, values: Float32Array): { compressed: QuantizedKVCache } {
    const quantized = this.quantizeKV(keys, values, 1);
    return { compressed: quantized };
  }

  compressionRatio(bitWidth: QuantBitWidth): number {
    return 32 / bitWidth;
  }

  estimateMemoryUsage(numTokens: number, headDim: number): { fp32Bytes: number; quantizedBytes: number; ratio: number } {
    const elements = numTokens * headDim;
    const fp32Bytes = 2 * elements * 4;
    const bitsPerElement = this.config.bitWidth;
    const quantBytes = 2 * Math.ceil(elements * bitsPerElement / 8);
    const scaleBytes = 2 * Math.ceil(elements / this.config.groupSize) * 4;
    const zpBytes = 2 * Math.ceil(elements / this.config.groupSize) * 1;
    const totalQuantBytes = quantBytes + scaleBytes + zpBytes;
    return {
      fp32Bytes,
      quantizedBytes: totalQuantBytes,
      ratio: fp32Bytes / Math.max(1, totalQuantBytes),
    };
  }
}

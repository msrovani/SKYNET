export interface KVCacheEntry {
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
  entries: KVCacheEntry[];
}

export class LMCacheP2P {
  private localCache: Map<string, KVCacheEntry> = new Map();
  private peerOffers: Map<string, PeerKVCacheOffer[]> = new Map();
  private registryTree: RegistryTreeNode;
  private readonly MAX_LOCAL_ENTRIES = 100;

  constructor() {
    this.registryTree = { nodeId: 'root', prefix: '', children: new Map(), entries: [] };
  }

  addLocalEntry(key: string, entry: KVCacheEntry): void {
    if (this.localCache.size >= this.MAX_LOCAL_ENTRIES) {
      const first = this.localCache.keys().next().value;
      if (first) this.localCache.delete(first);
    }
    this.localCache.set(key, entry);
    this.insertIntoTree(key, entry);
  }

  getLocalEntry(key: string): KVCacheEntry | undefined {
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

  private insertIntoTree(key: string, entry: KVCacheEntry): void {
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

  searchByPrefix(prefix: string): KVCacheEntry[] {
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

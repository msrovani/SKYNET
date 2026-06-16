import { describe, it, expect, beforeEach } from 'vitest';

describe('LMCacheP2P', () => {
  let LMCacheP2P: any;
  let cache: any;

  beforeEach(async () => {
    const mod = await import('../kv-cache.js');
    LMCacheP2P = mod.LMCacheP2P;
    cache = new LMCacheP2P();
  });

  it('stores and retrieves local entries', () => {
    const entry = { prefixTokens: [1, 2, 3], keyCache: new Float32Array(4), valueCache: new Float32Array(4), layerIndex: 0 };
    cache.addLocalEntry('test-key', entry);
    const retrieved = cache.getLocalEntry('test-key');
    expect(retrieved).toBeDefined();
    expect(retrieved.layerIndex).toBe(0);
    expect(retrieved.prefixTokens).toEqual([1, 2, 3]);
  });

  it('returns undefined for missing key', () => {
    expect(cache.getLocalEntry('nonexistent')).toBeUndefined();
  });

  it('evicts oldest entry when at capacity', () => {
    const entryTemplate = (i: number) => ({
      prefixTokens: [i], keyCache: new Float32Array(2), valueCache: new Float32Array(2), layerIndex: i,
    });
    for (let i = 0; i < 120; i++) cache.addLocalEntry(`key-${i}`, entryTemplate(i));
    expect(cache.getLocalEntry('key-0')).toBeUndefined();
    expect(cache.getLocalEntry('key-119')).toBeDefined();
  });

  it('routes search via registry tree by full key prefix', () => {
    const entry = { prefixTokens: [1], keyCache: new Float32Array(2), valueCache: new Float32Array(2), layerIndex: 0 };
    cache.addLocalEntry('abc', entry);
    const results = cache.searchByPrefix('abc');
    expect(results.length).toBe(1);
    expect(results[0].layerIndex).toBe(0);
  });

  it('returns empty for unmatched prefix', () => {
    expect(cache.searchByPrefix('z')).toEqual([]);
  });

  it('registers and finds best peer by prefix + RTT', () => {
    cache.registerPeerOffer('peer1', { peerId: 'peer1', prefixTokenCount: 100, entryCount: 5, modelId: 'm1', rttMs: 50 });
    cache.registerPeerOffer('peer2', { peerId: 'peer2', prefixTokenCount: 100, entryCount: 5, modelId: 'm1', rttMs: 20 });
    cache.registerPeerOffer('peer3', { peerId: 'peer3', prefixTokenCount: 50, entryCount: 5, modelId: 'm1', rttMs: 10 });
    const best = cache.findBestPeer(100, 100);
    expect(best).not.toBeNull();
    expect(best.peerId).toBe('peer2');
  });

  it('returns null when no peer meets RTT constraint', () => {
    cache.registerPeerOffer('peer1', { peerId: 'peer1', prefixTokenCount: 100, entryCount: 5, modelId: 'm1', rttMs: 200 });
    expect(cache.findBestPeer(100, 50)).toBeNull();
  });

  it('clears all state', () => {
    const entry = { prefixTokens: [1], keyCache: new Float32Array(2), valueCache: new Float32Array(2), layerIndex: 0 };
    cache.addLocalEntry('key', entry);
    cache.registerPeerOffer('p1', { peerId: 'p1', prefixTokenCount: 10, entryCount: 1, modelId: 'm1', rttMs: 10 });
    cache.clear();
    expect(cache.getLocalEntry('key')).toBeUndefined();
    expect(cache.findBestPeer(10, 100)).toBeNull();
  });
});

describe('DroidSpeakKVSharing', () => {
  let DroidSpeakKVSharing: any;
  let sharing: any;

  beforeEach(async () => {
    const mod = await import('../kv-cache.js');
    DroidSpeakKVSharing = mod.DroidSpeakKVSharing;
    sharing = new DroidSpeakKVSharing();
  });

  it('registers model layers and computes sharable ratio', () => {
    sharing.registerModelLayers('model-a', 32);
    expect(sharing.getSharableRatio('model-a')).toBe(0.7);
    expect(sharing.getSharableRatio('unknown')).toBe(0);
  });

  it('finds compatible layers between two models', () => {
    sharing.registerModelLayers('model-a', 32);
    sharing.registerModelLayers('model-b', 32);
    const compatible = sharing.findCompatibleLayers('model-a', 'model-b');
    expect(compatible.length).toBe(22);
    expect(compatible[0]).toBe(10);
    expect(compatible[compatible.length - 1]).toBe(31);
  });

  it('returns empty for unknown model', () => {
    sharing.registerModelLayers('model-a', 32);
    expect(sharing.findCompatibleLayers('model-a', 'unknown')).toEqual([]);
  });

  it('clears all registered models', () => {
    sharing.registerModelLayers('model-a', 8);
    sharing.clear();
    expect(sharing.getSharableRatio('model-a')).toBe(0);
  });
});

describe('KVCompress', () => {
  let KVCompress: any;

  beforeEach(async () => {
    const mod = await import('../kv-cache.js');
    KVCompress = mod.KVCompress;
  });

  it('compresses with default factor', () => {
    const compressor = new KVCompress();
    const input = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const { compressed, metadata } = compressor.compress(input);
    expect(compressed.length).toBe(2);
    expect(metadata.length).toBe(1);
  });

  it('compresses with custom factor', () => {
    const compressor = new KVCompress(2);
    const input = new Float32Array([1, 2, 3, 4]);
    const { compressed } = compressor.compress(input);
    expect(compressed.length).toBe(2);
    expect(compressed[0]).toBe(1.5);
    expect(compressed[1]).toBe(3.5);
  });

  it('handles single element', () => {
    const compressor = new KVCompress(4);
    const input = new Float32Array([42]);
    const { compressed } = compressor.compress(input);
    expect(compressed.length).toBe(1);
    expect(compressed[0]).toBe(42);
  });

  it('sets metadata markers at page boundaries', () => {
    const compressor = new KVCompress(2, 2);
    const input = new Float32Array(8).fill(1);
    const { compressed, metadata } = compressor.compress(input);
    expect(compressed.length).toBe(4);
    expect(metadata.length).toBe(2);
    expect(metadata[0]).toBe(1);
  });
});

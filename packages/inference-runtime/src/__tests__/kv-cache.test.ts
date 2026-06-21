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

describe('KVCacheQuantizer', () => {
  let KVCacheQuantizer: any;

  beforeEach(async () => {
    const mod = await import('../kv-cache.js');
    KVCacheQuantizer = mod.KVCacheQuantizer;
  });

  it('quantizes and dequantizes 4-bit preserving approximate values', () => {
    const quantizer = new KVCacheQuantizer({ bitWidth: 4, groupSize: 64, useHadamard: false });
    const input = new Float32Array([0.5, -0.3, 0.8, -0.1, 0.0, 0.9, -0.7, 0.2]);
    const quantized = quantizer.quantizeKV(input, input);
    const { keys } = quantizer.dequantizeKV(quantized);
    for (let i = 0; i < input.length; i++) {
      const err = Math.abs(keys[i] - input[i]);
      expect(err).toBeLessThan(0.2);
    }
    expect(quantized.bitWidth).toBe(4);
  });

  it('quantizes and dequantizes 2-bit with reasonable fidelity', () => {
    const quantizer = new KVCacheQuantizer({ bitWidth: 2, groupSize: 32, useHadamard: false });
    const input = new Float32Array(32).fill(0).map(() => Math.random() * 2 - 1);
    const quantized = quantizer.quantizeKV(input, input);
    const { keys } = quantizer.dequantizeKV(quantized);
    let mse = 0;
    for (let i = 0; i < input.length; i++) mse += (keys[i] - input[i]) ** 2;
    mse /= input.length;
    expect(mse).toBeLessThan(0.5);
  });

  it('uses Hadamard transform when enabled', () => {
    const withHadamard = new KVCacheQuantizer({ bitWidth: 4, groupSize: 64, useHadamard: true });
    const withoutHadamard = new KVCacheQuantizer({ bitWidth: 4, groupSize: 64, useHadamard: false });
    const input = new Float32Array([1.0, -0.5, 0.3, -0.8, 0.2, 0.7, -0.1, -0.4]);
    const q1 = withHadamard.quantizeKV(input, input);
    const q2 = withoutHadamard.quantizeKV(input, input);
    expect(q1.scaleK.length).toBe(q2.scaleK.length);
    const { keys: k1 } = withHadamard.dequantizeKV(q1);
    const { keys: k2 } = withoutHadamard.dequantizeKV(q2);
    let err1 = 0; let err2 = 0;
    for (let i = 0; i < input.length; i++) {
      err1 += Math.abs(k1[i] - input[i]);
      err2 += Math.abs(k2[i] - input[i]);
    }
    expect(err1).toBeLessThanOrEqual(err2 * 1.5);
  });

  it('compression ratio decreases with bit width', () => {
    const q4 = new KVCacheQuantizer({ bitWidth: 4, groupSize: 64 });
    const q2 = new KVCacheQuantizer({ bitWidth: 2, groupSize: 64 });
    expect(q4.compressionRatio(4)).toBe(8);
    expect(q2.compressionRatio(2)).toBe(16);
  });

  it('estimates memory usage correctly', () => {
    const quantizer = new KVCacheQuantizer({ bitWidth: 4, groupSize: 64 });
    const estimate = quantizer.estimateMemoryUsage(1024, 1);
    expect(estimate.fp32Bytes).toBe(8192);
    expect(estimate.quantizedBytes).toBeLessThan(estimate.fp32Bytes);
    expect(estimate.ratio).toBeGreaterThan(1);
  });

  it('handles empty input gracefully', () => {
    const quantizer = new KVCacheQuantizer({ bitWidth: 4, groupSize: 64 });
    const input = new Float32Array(0);
    const quantized = quantizer.quantizeKV(input, input);
    expect(quantized.scaleK.length).toBe(0);
  });

  it('setConfig updates quantization parameters', () => {
    const quantizer = new KVCacheQuantizer({ bitWidth: 4 });
    expect(quantizer.getConfig().bitWidth).toBe(4);
    quantizer.setConfig({ bitWidth: 2 });
    expect(quantizer.getConfig().bitWidth).toBe(2);
  });
});

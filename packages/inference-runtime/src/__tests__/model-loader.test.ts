import { describe, it, expect, beforeEach } from 'vitest';

describe('ModelLoader', () => {
  let ModelLoader: any;
  let loader: any;

  beforeEach(async () => {
    const mod = await import('../model-loader.js');
    ModelLoader = mod.ModelLoader;
    loader = new ModelLoader();
  });

  it('returns empty cached ids initially', () => {
    expect(loader.getCachedIds()).toEqual([]);
  });

  it('computes metadata correctly', () => {
    const config = { id: 'test', name: 'Test', provider: 'executorch', quantization: 'int4', contextLength: 2048, modelUrl: 'https://example.com/model.pte', parameterCount: 1_000_000_000 };
    const meta = loader.getMetadata(config);
    expect(meta.parameterCount).toBe(1_000_000_000);
    expect(meta.memoryRequiredMb).toBeCloseTo(500_000_000 / (1024 * 1024), 0);
    expect(meta.quantization).toBe('int4');
    expect(meta.supportedBackends).toContain('xnnpack');
    expect(meta.contextLength).toBe(2048);
  });

  it('caches and retrieves model', () => {
    const buffer = new ArrayBuffer(8);
    (loader as any).cache.set('test-id', buffer);
    expect(loader.getCachedModel('test-id')).toBe(buffer);
    expect(loader.getCachedIds()).toEqual(['test-id']);
  });

  it('removes cached model by id', () => {
    const buffer = new ArrayBuffer(8);
    (loader as any).cache.set('test-id', buffer);
    expect(loader.removeCached('test-id')).toBe(true);
    expect(loader.getCachedIds()).toEqual([]);
  });

  it('removeCached returns false for missing id', () => {
    expect(loader.removeCached('nonexistent')).toBe(false);
  });

  it('clearCache empties all entries', () => {
    (loader as any).cache.set('a', new ArrayBuffer(1));
    (loader as any).cache.set('b', new ArrayBuffer(1));
    loader.clearCache();
    expect(loader.getCachedIds()).toEqual([]);
  });
});

describe('estimateMemory', () => {
  it('calculates memory for int4', async () => {
    const { estimateMemory } = await import('../model-loader.js');
    const mem = estimateMemory(1_000_000_000, 'int4');
    expect(mem).toBeCloseTo(500_000_000 / (1024 * 1024), 2);
  });

  it('calculates memory for fp16', async () => {
    const { estimateMemory } = await import('../model-loader.js');
    const mem = estimateMemory(1_000_000_000, 'fp16');
    expect(mem).toBeCloseTo(2_000_000_000 / (1024 * 1024), 2);
  });

  it('calculates memory for fp32', async () => {
    const { estimateMemory } = await import('../model-loader.js');
    const mem = estimateMemory(1_000_000_000, 'fp32');
    expect(mem).toBeCloseTo(4_000_000_000 / (1024 * 1024), 2);
  });

  it('uses fp32 as default for unknown quantization', async () => {
    const { estimateMemory } = await import('../model-loader.js');
    const mem = estimateMemory(1_000_000_000, 'int2' as any);
    expect(mem).toBeCloseTo(4_000_000_000 / (1024 * 1024), 2);
  });
});

describe('DynamicPrecisionController', () => {
  let DynamicPrecisionController: any;

  beforeEach(async () => {
    const mod = await import('../model-loader.js');
    DynamicPrecisionController = mod.DynamicPrecisionController;
  });

  it('starts with base precision', () => {
    const ctrl = new DynamicPrecisionController('int8');
    expect(ctrl.getCurrentPrecision()).toBe('int8');
  });

  it('uses fp32 base by default', () => {
    const ctrl = new DynamicPrecisionController();
    expect(ctrl.getCurrentPrecision()).toBe('int8');
  });

  it('downgrades precision on poor network', () => {
    const ctrl = new DynamicPrecisionController('int8');
    ctrl.adjustForNetwork(5, 200);
    expect(ctrl.getCurrentPrecision()).toBe('int4');
  });

  it('maintains precision on good network', () => {
    const ctrl = new DynamicPrecisionController('int8');
    ctrl.adjustForNetwork(500, 1);
    expect(ctrl.getCurrentPrecision()).toBe('int8');
  });

  it('computes memory multiplier correctly', () => {
    const ctrl = new DynamicPrecisionController('fp32');
    ctrl.adjustForNetwork(5, 200);
    expect(ctrl.getMemoryMultiplier()).toBeCloseTo(0.25, 3);
  });

  it('reset restores base precision', () => {
    const ctrl = new DynamicPrecisionController('int8');
    ctrl.adjustForNetwork(5, 200);
    ctrl.reset();
    expect(ctrl.getCurrentPrecision()).toBe('int8');
  });
});

describe('MatQuantEncoder', () => {
  let MatQuantEncoder: any;

  beforeEach(async () => {
    const mod = await import('../model-loader.js');
    MatQuantEncoder = mod.MatQuantEncoder;
  });

  it('encodes int4 with correct shape', () => {
    const encoder = new MatQuantEncoder(4);
    const data = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const result = encoder.encodeInt4(data);
    expect(result.packed.length).toBe(4);
    expect(result.scales.length).toBe(4);
  });

  it('handles constant value blocks', () => {
    const encoder = new MatQuantEncoder(4);
    const data = new Float32Array([3, 3, 3, 3]);
    const result = encoder.encodeInt4(data, 4);
    expect(result.packed.length).toBe(2);
    expect(result.scales[0]).toBe(3);
    expect(result.scales[1]).toBe(1.0);
  });

  it('extractInt2 produces smaller packed size', () => {
    const encoder = new MatQuantEncoder(4);
    const data = new Float32Array(8).map((_, i) => i * 0.5);
    const encoded = encoder.encodeInt4(data);
    const int2 = encoder.extractInt2(encoded, 8);
    expect(int2.packed.length).toBe(2);
  });

  it('handles empty data gracefully', () => {
    const encoder = new MatQuantEncoder(4);
    const data = new Float32Array(0);
    const result = encoder.encodeInt4(data);
    expect(result.packed.length).toBe(0);
    expect(result.scales.length).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import {
  createTransformerConfig,
  buildPipelinePlan,
  buildShardedPipelinePlan,
  estimateInferenceMemory,
  estimatePeerMemory,
  createKvCache,
  inferenceCheckpointForward,
} from '../index.js';

describe('TransformerConfig', () => {
  it('creates a config with correct dimensions', () => {
    const cfg = createTransformerConfig(32, 4096, 32, 128, 14336, 128256, 4096);
    expect(cfg.numLayers).toBe(32);
    expect(cfg.hiddenDim).toBe(4096);
    expect(cfg.numHeads).toBe(32);
    expect(cfg.headDim).toBe(128);
    expect(cfg.ffnHiddenDim).toBe(14336);
    expect(cfg.vocabSize).toBe(128256);
    expect(cfg.maxSeqLen).toBe(4096);
  });
});

describe('buildPipelinePlan', () => {
  it('distributes layers round-robin across hosts', () => {
    const cfg = createTransformerConfig(8, 1024, 8, 64, 2048, 32000, 1024);
    const plan = buildPipelinePlan(cfg, ['host-a', 'host-b']);
    expect(plan.layerAssignments).toHaveLength(8);
    expect(plan.numHosts).toBe(2);
    expect(plan.layerAssignments[0].hostId).toBe('host-a');
    expect(plan.layerAssignments[1].hostId).toBe('host-b');
    expect(plan.layerAssignments[2].hostId).toBe('host-a');
  });

  it('handles single host', () => {
    const cfg = createTransformerConfig(4, 512, 4, 64, 1024, 32000, 512);
    const plan = buildPipelinePlan(cfg, ['single-host']);
    const allSame = plan.layerAssignments.every(a => a.hostId === 'single-host');
    expect(allSame).toBe(true);
    expect(plan.layerAssignments).toHaveLength(4);
  });

  it('handles more hosts than layers', () => {
    const cfg = createTransformerConfig(2, 512, 4, 64, 1024, 32000, 512);
    const plan = buildPipelinePlan(cfg, ['h1', 'h2', 'h3']);
    expect(plan.layerAssignments).toHaveLength(2);
    expect(plan.numHosts).toBe(3);
  });
});

describe('buildShardedPipelinePlan', () => {
  it('creates sharded assignments per layer', () => {
    const cfg = createTransformerConfig(4, 512, 4, 64, 1024, 32000, 512);
    const plan = buildShardedPipelinePlan(cfg, ['h1', 'h2'], 2);
    expect(plan.layerAssignments).toHaveLength(8);
    expect(plan.layerAssignments[0].totalShards).toBe(2);
    expect(plan.layerAssignments[0].shardIdx).toBe(0);
    expect(plan.layerAssignments[1].shardIdx).toBe(1);
  });
});

describe('estimateInferenceMemory', () => {
  it('computes memory for a full model', () => {
    const cfg = createTransformerConfig(32, 4096, 32, 128, 14336, 128256, 4096);
    const est = estimateInferenceMemory(cfg);
    expect(est.kvCacheBytes).toBeGreaterThan(0);
    expect(est.activationBytes).toBeGreaterThan(0);
    expect(est.weightBytes).toBeGreaterThan(0);
    expect(est.totalBytes).toBeGreaterThan(est.kvCacheBytes);
  });

  it('scales with numLayers', () => {
    const cfg1 = createTransformerConfig(8, 1024, 8, 64, 2048, 32000, 1024);
    const cfg2 = createTransformerConfig(16, 1024, 8, 64, 2048, 32000, 1024);
    const m1 = estimateInferenceMemory(cfg1);
    const m2 = estimateInferenceMemory(cfg2);
    expect(m2.totalBytes).toBeGreaterThan(m1.totalBytes);
  });

  it('reports fitsInVramGb', () => {
    const tiny = createTransformerConfig(2, 64, 2, 32, 128, 1000, 128);
    const est = estimateInferenceMemory(tiny);
    expect(est.fitsInVramGb).toBeLessThan(1);
  });
});

describe('estimatePeerMemory', () => {
  it('divides memory across hosts', () => {
    const cfg = createTransformerConfig(8, 1024, 8, 64, 2048, 32000, 1024);
    const plan = buildPipelinePlan(cfg, ['h1', 'h2']);
    const m1 = estimatePeerMemory(cfg, plan, 'h1');
    const m2 = estimatePeerMemory(cfg, plan, 'h2');
    expect(m1.kvCacheBytes).toBeGreaterThan(0);
    expect(m2.kvCacheBytes).toBeGreaterThan(0);
  });
});

describe('createKvCache', () => {
  it('creates KV cache entries for each layer', () => {
    const cfg = createTransformerConfig(4, 256, 4, 64, 512, 32000, 256);
    const cache = createKvCache(cfg);
    expect(cache).toHaveLength(4);
    expect(cache[0].seqLen).toBe(0);
    expect(cache[0].keys.length).toBe(256 * 4 * 64);
  });
});

describe('inferenceCheckpointForward', () => {
  it('creates a checkpoint with input/output data', () => {
    const input = new Float32Array([1, 2, 3, 4]);
    const weights = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const cp = inferenceCheckpointForward(input, weights, 4, 0, 0);
    expect(cp.layerIdx).toBe(0);
    expect(cp.seqPos).toBe(0);
    expect(cp.inputData.length).toBe(4);
    expect(cp.outputData.length).toBe(4);
    expect(cp.hiddenDim).toBe(4);
  });
});

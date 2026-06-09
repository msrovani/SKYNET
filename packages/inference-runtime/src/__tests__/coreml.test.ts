import { describe, it, expect } from 'vitest';
import { CoreMLRuntime, detectPlatform, recommendDelegate } from '../coreml.js';

describe('detectPlatform', () => {
  it('returns unknown in Node.js', () => {
    expect(detectPlatform()).toBe('unknown');
  });
});

describe('recommendDelegate', () => {
  it('recommends cpu for unknown platform', () => {
    expect(recommendDelegate('unknown')).toBe('cpu');
  });

  it('recommends ane_and_gpu for M4 chip', () => {
    expect(recommendDelegate('iphone', 'Apple M4')).toBe('ane_and_gpu');
  });

  it('recommends ane for A15', () => {
    expect(recommendDelegate('iphone', 'Apple A15')).toBe('ane');
  });

  it('recommends gpu for ipad without chip', () => {
    expect(recommendDelegate('ipad')).toBe('gpu');
  });
});

describe('CoreMLRuntime', () => {
  it('fails load without path on unknown platform', async () => {
    const runtime = new CoreMLRuntime({ delegate: 'cpu' });
    await expect(runtime.load()).rejects.toThrow('CoreML model path not specified');
  });

  it('fails load with path on unknown platform', async () => {
    const runtime = new CoreMLRuntime({ delegate: 'cpu' });
    await expect(runtime.load('test.mlpackage')).rejects.toThrow('CoreML requires iOS/iPadOS');
  });

  it('infer fails when not loaded', async () => {
    const runtime = new CoreMLRuntime();
    const input = new Float32Array([1, 2, 3]);
    await expect(runtime.infer(input, [1, 3])).rejects.toThrow('CoreML runtime not loaded');
  });

  it('checkANEAvailability returns false in Node.js', async () => {
    const runtime = new CoreMLRuntime();
    const avail = await runtime.checkANEAvailability();
    expect(avail).toBe(false);
  });

  it('optimizeForModel adjusts config', () => {
    const runtime = new CoreMLRuntime({ delegate: 'cpu' });
    const cfg1 = runtime.getConfig();
    expect(cfg1.delegate).toBe('cpu');
    runtime.optimizeForModel(7_000_000_000);
    const cfg2 = runtime.getConfig();
    expect(cfg2.delegate).toBe('ane_and_gpu');
  });

  it('optimizeForModel uses gpu for large models', () => {
    const runtime = new CoreMLRuntime({ delegate: 'cpu' });
    runtime.optimizeForModel(70_000_000_000);
    expect(runtime.getConfig().delegate).toBe('gpu');
  });

  it('tracks loaded state', () => {
    const runtime = new CoreMLRuntime({ delegate: 'cpu' });
    expect(runtime.isLoaded()).toBe(false);
  });
});

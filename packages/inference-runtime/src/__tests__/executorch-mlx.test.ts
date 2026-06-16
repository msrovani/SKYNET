import { describe, it, expect } from 'vitest';
import {
  getAvailableBackends,
  recommendBackend,
  ExecuTorchRuntime,
  estimateMemory,
} from '../executorch.js';
import { MLXRuntime } from '../mlx.js';

describe('ExecuTorch getAvailableBackends', () => {
  it('returns at least xnnpack', () => {
    const backends = getAvailableBackends();
    expect(backends).toContain('xnnpack');
  });
});

describe('ExecuTorch recommendBackend', () => {
  it('returns mlx for macOS with 8GB memory', () => {
    const result = recommendBackend(8, false, 'darwin');
    expect(result).toBe('mlx');
  });

  it('returns mlx for macOS with 4GB memory', () => {
    const result = recommendBackend(4, false, 'darwin');
    expect(result).toBe('mlx');
  });

  it('returns xnnpack for low memory on non-macOS', () => {
    const result = recommendBackend(2, false, 'win32');
    expect(result).toBe('xnnpack');
  });

  it('returns xnnpack for macOS mobile with low memory', () => {
    const result = recommendBackend(2, true, 'darwin');
    expect(result).toBe('xnnpack');
  });

  it('returns vulkan for macOS mobile even with 8GB', () => {
    const result = recommendBackend(8, true, 'darwin');
    expect(result).toBe('vulkan');
  });
});

describe('ExecuTorchRuntime', () => {
  it('load() without path throws error', async () => {
    const runtime = new ExecuTorchRuntime();
    await expect(runtime.load('')).rejects.toThrow('Model path not specified');
  });

  it('isLoaded() returns false before load', () => {
    const runtime = new ExecuTorchRuntime();
    expect(runtime.isLoaded()).toBe(false);
  });
});

describe('estimateMemory', () => {
  it('returns correct values for int4', () => {
    const mb = estimateMemory(1_000_000_000, 'int4');
    expect(mb).toBeCloseTo(476.84, 0);
  });

  it('returns correct values for fp16', () => {
    const mb = estimateMemory(1_000_000_000, 'fp16');
    expect(mb).toBeCloseTo(1907.35, 0);
  });

  it('returns correct values for fp32', () => {
    const mb = estimateMemory(1_000_000_000, 'fp32');
    expect(mb).toBeCloseTo(3814.70, 0);
  });

  it('defaults to fp32 for unknown quantization', () => {
    const mb = estimateMemory(500_000_000, 'int3' as any);
    expect(mb).toBeCloseTo(1907.35, 0);
  });
});

describe('MLXRuntime', () => {
  it('infer returns non-empty results after load', async () => {
    const runtime = new MLXRuntime();
    runtime['loaded'] = true;
    runtime['mlxVersion'] = '0.20.0';
    const result = await runtime.infer('hello', 10);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('supportsDelegate returns false in test env', () => {
    const runtime = new MLXRuntime();
    expect(runtime.supportsDelegate()).toBe(false);
  });

  it('infer throws before load', async () => {
    const runtime = new MLXRuntime();
    await expect(runtime.infer('hello')).rejects.toThrow('MLX runtime not loaded');
  });
});

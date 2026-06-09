import { describe, it, expect } from 'vitest';
import { WebGpuPreprocessor, isWebGpuAvailable, getAdapterInfo } from '../webgpu-preprocess.js';

describe('isWebGpuAvailable', () => {
  it('returns false in Node.js', () => {
    expect(isWebGpuAvailable()).toBe(false);
  });
});

describe('getAdapterInfo', () => {
  it('returns null in Node.js', async () => {
    const info = await getAdapterInfo();
    expect(info).toBeNull();
  });
});

describe('WebGpuPreprocessor', () => {
  it('fails load without WebGPU', async () => {
    const pre = new WebGpuPreprocessor('espcn');
    await expect(pre.load()).rejects.toThrow('WebGPU not available');
  });

  it('reports default config', () => {
    const pre = new WebGpuPreprocessor('esrgan');
    const config = pre.getConfig();
    expect(config.shaderType).toBe('esrgan');
    expect(config.scaleFactor).toBe(4);
    expect(config.workgroupSize).toEqual([8, 8, 1]);
  });

  it('fails preprocess without load', async () => {
    const pre = new WebGpuPreprocessor();
    const input = new Float32Array(12);
    await expect(pre.preprocess(input, 2, 2)).rejects.toThrow('WebGPU preprocessor not loaded');
  });

  it('setConfig updates parameters', () => {
    const pre = new WebGpuPreprocessor('espcn');
    pre.setConfig({ scaleFactor: 3, shaderType: 'resize' });
    const config = pre.getConfig();
    expect(config.scaleFactor).toBe(3);
    expect(config.shaderType).toBe('resize');
  });

  it('tracks loaded state', () => {
    const pre = new WebGpuPreprocessor();
    expect(pre.isLoaded()).toBe(false);
  });

  it('unload clears device', async () => {
    const pre = new WebGpuPreprocessor();
    await pre.unload();
    expect(pre.isLoaded()).toBe(false);
  });
});

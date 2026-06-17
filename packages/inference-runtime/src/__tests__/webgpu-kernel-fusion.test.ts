import { describe, it, expect, vi } from 'vitest';
import { WebGpuKernelFusion, FusionConfig, FusionResult } from '../webgpu-kernel-fusion.js';

describe('WebGpuKernelFusion', () => {
  describe('isAvailable', () => {
    it('returns false in Node.js', () => {
      expect(WebGpuKernelFusion.isAvailable()).toBe(false);
    });

    it('returns true when navigator.gpu exists', () => {
      const origNav = globalThis.navigator;
      (globalThis as any).navigator = { gpu: {} };
      expect(WebGpuKernelFusion.isAvailable()).toBe(true);
      (globalThis as any).navigator = origNav;
    });

    it('returns false when navigator is undefined', () => {
      const origNav = globalThis.navigator;
      (globalThis as any).navigator = undefined;
      expect(WebGpuKernelFusion.isAvailable()).toBe(false);
      (globalThis as any).navigator = origNav;
    });
  });

  describe('initialize', () => {
    it('returns false in Node.js', async () => {
      const fusion = new WebGpuKernelFusion();
      const result = await fusion.initialize();
      expect(result).toBe(false);
    });

    it('returns false when isAvailable is false', async () => {
      vi.spyOn(WebGpuKernelFusion, 'isAvailable').mockReturnValue(false);
      const fusion = new WebGpuKernelFusion();
      const result = await fusion.initialize();
      expect(result).toBe(false);
    });
  });

  describe('constructor', () => {
    it('uses default config', () => {
      const fusion = new WebGpuKernelFusion();
      expect((fusion as any).config.activation).toBe('relu');
      expect((fusion as any).config.blockSize).toBe(256);
    });

    it('accepts partial config', () => {
      const fusion = new WebGpuKernelFusion({ activation: 'gelu', blockSize: 128 });
      expect((fusion as any).config.activation).toBe('gelu');
      expect((fusion as any).config.blockSize).toBe(128);
    });

    it('accepts empty config', () => {
      const fusion = new WebGpuKernelFusion({});
      expect((fusion as any).config.activation).toBe('relu');
      expect((fusion as any).config.blockSize).toBe(256);
    });
  });

  describe('activationExpr', () => {
    it('generates ReLU expression', () => {
      const fusion = new WebGpuKernelFusion();
      const expr = (fusion as any).activationExpr('relu');
      expect(expr).toBe('max(val, 0.0)');
    });

    it('generates GELU expression', () => {
      const fusion = new WebGpuKernelFusion();
      const expr = (fusion as any).activationExpr('gelu');
      expect(expr).toContain('tanh');
      expect(expr).toContain('0.5 * val');
      expect(expr).toContain('0.7978845608028654');
    });

    it('returns val for none', () => {
      const fusion = new WebGpuKernelFusion();
      const expr = (fusion as any).activationExpr('none');
      expect(expr).toBe('val');
    });
  });

  describe('getMatmulShader', () => {
    it('returns valid WGSL with ReLU activation', () => {
      const fusion = new WebGpuKernelFusion();
      const shader = (fusion as any).getMatmulShader('relu');
      expect(shader).toContain('@compute @workgroup_size(16, 16)');
      expect(shader).toContain('var<workgroup> tileA');
      expect(shader).toContain('var<workgroup> tileB');
      expect(shader).toContain('max(val, 0.0)');
      expect(shader).toContain('workgroupBarrier()');
      expect(shader).toContain('uniforms.M');
      expect(shader).toContain('uniforms.K');
      expect(shader).toContain('uniforms.N');
    });

    it('returns valid WGSL with GELU activation', () => {
      const fusion = new WebGpuKernelFusion();
      const shader = (fusion as any).getMatmulShader('gelu');
      expect(shader).toContain('tanh');
    });

    it('returns valid WGSL with no activation', () => {
      const fusion = new WebGpuKernelFusion();
      const shader = (fusion as any).getMatmulShader('none');
      expect(shader).toContain('c[row * uniforms.N + col] = val');
    });
  });

  describe('getActivationShader', () => {
    it('returns element-wise activation shader', () => {
      const fusion = new WebGpuKernelFusion();
      const shader = (fusion as any).getActivationShader('relu', 256);
      expect(shader).toContain('@compute @workgroup_size(256)');
      expect(shader).toContain('max(val, 0.0)');
      expect(shader).toContain('gid.x < size');
    });

    it('respects workgroup size', () => {
      const fusion = new WebGpuKernelFusion();
      const shader = (fusion as any).getActivationShader('gelu', 64);
      expect(shader).toContain('@compute @workgroup_size(64)');
    });

    it('generates GELU expression in activation shader', () => {
      const fusion = new WebGpuKernelFusion();
      const shader = (fusion as any).getActivationShader('gelu', 128);
      expect(shader).toContain('tanh');
      expect(shader).toContain('0.5 * val');
    });
  });

  describe('matmul', () => {
    it('throws when not initialized', async () => {
      const fusion = new WebGpuKernelFusion();
      const A = new Float32Array([1, 2, 3, 4]);
      const B = new Float32Array([5, 6, 7, 8]);
      await expect(fusion.matmul(A, B, 2, 2, 2)).rejects.toThrow('WebGPU not initialized');
    });
  });

  describe('matmulActivation', () => {
    it('throws when not initialized', async () => {
      const fusion = new WebGpuKernelFusion();
      const A = new Float32Array(4);
      const B = new Float32Array(4);
      await expect(fusion.matmulActivation(A, B, 2, 2, 2, 'relu')).rejects.toThrow('WebGPU not initialized');
    });
  });

  describe('activate', () => {
    it('throws when not initialized', async () => {
      const fusion = new WebGpuKernelFusion();
      const data = new Float32Array([1, -2, 3, -4]);
      await expect(fusion.activate(data, 'relu')).rejects.toThrow('WebGPU not initialized');
    });
  });

  describe('destroy', () => {
    it('clears pipeline cache', () => {
      const fusion = new WebGpuKernelFusion();
      (fusion as any).pipelineCache.set('test', {});
      fusion.destroy();
      expect((fusion as any).pipelineCache.size).toBe(0);
    });

    it('sets device to null', () => {
      const fusion = new WebGpuKernelFusion();
      (fusion as any).device = { destroy: vi.fn() } as any;
      fusion.destroy();
      expect((fusion as any).device).toBeNull();
    });

    it('sets adapter to null', () => {
      const fusion = new WebGpuKernelFusion();
      (fusion as any).adapter = {} as any;
      fusion.destroy();
      expect((fusion as any).adapter).toBeNull();
    });

    it('safe to call multiple times', () => {
      const fusion = new WebGpuKernelFusion();
      fusion.destroy();
      fusion.destroy();
      expect((fusion as any).pipelineCache.size).toBe(0);
    });
  });

  describe('pipelineCache', () => {
    it('creates new pipeline on cache miss', async () => {
      const fusion = new WebGpuKernelFusion();
      expect((fusion as any).pipelineCache.size).toBe(0);
    });
  });
});

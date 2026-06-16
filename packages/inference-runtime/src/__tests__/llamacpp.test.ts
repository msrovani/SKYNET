import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node-llama-cpp', () => {
  const mockSequence = { dispose: vi.fn() };
  const mockContext = { getSequence: vi.fn(() => mockSequence), dispose: vi.fn() };
  const mockModel = { createContext: vi.fn(() => mockContext), dispose: vi.fn() };
  const mockLlama = { loadModel: vi.fn(() => mockModel), dispose: vi.fn() };
  const MockLlamaCompletion = vi.fn().mockImplementation(() => ({
    generateCompletion: vi.fn(async (prompt: string, opts?: { maxTokens?: number }) =>
      `Response to: ${prompt} (${opts?.maxTokens ?? 1024} tokens)`
    ),
    dispose: vi.fn(),
  }));
  return {
    getLlama: vi.fn(async () => mockLlama),
    LlamaCompletion: MockLlamaCompletion,
  };
});

describe('LLaMACppRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constructs with config', async () => {
    const { LLaMACppRuntime } = await import('../llamacpp.js');
    const runtime = new LLaMACppRuntime({ modelPath: '/model.gguf', gpuLayers: 24, threads: 4, contextSize: 2048, batchSize: 128 });
    expect(runtime.isLoaded()).toBe(false);
  });

  it('loads and generates completion', async () => {
    const { LLaMACppRuntime } = await import('../llamacpp.js');
    const runtime = new LLaMACppRuntime({ modelPath: '/model.gguf', gpuLayers: 24, threads: 4, contextSize: 2048, batchSize: 128 });
    await runtime.load();
    expect(runtime.isLoaded()).toBe(true);
    const result = await runtime.generate('Hello');
    expect(result.content).toContain('Hello');
    expect(result.tokensUsed).toBeGreaterThan(0);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('load is idempotent', async () => {
    const { LLaMACppRuntime } = await import('../llamacpp.js');
    const runtime = new LLaMACppRuntime({ modelPath: '/model.gguf', gpuLayers: 24, threads: 4, contextSize: 2048, batchSize: 128 });
    await runtime.load();
    await runtime.load();
    expect(runtime.isLoaded()).toBe(true);
  });

  it('throws generate before load', async () => {
    const { LLaMACppRuntime } = await import('../llamacpp.js');
    const runtime = new LLaMACppRuntime({ modelPath: '/model.gguf', gpuLayers: 24, threads: 4, contextSize: 2048, batchSize: 128 });
    await expect(runtime.generate('test')).rejects.toThrow('not loaded');
  });

  it('unload resets state', async () => {
    const { LLaMACppRuntime } = await import('../llamacpp.js');
    const runtime = new LLaMACppRuntime({ modelPath: '/model.gguf', gpuLayers: 24, threads: 4, contextSize: 2048, batchSize: 128 });
    await runtime.load();
    expect(runtime.isLoaded()).toBe(true);
    runtime.unload();
    expect(runtime.isLoaded()).toBe(false);
  });
});

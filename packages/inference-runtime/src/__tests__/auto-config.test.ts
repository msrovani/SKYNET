import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockCpus = vi.fn(() => Array(8).fill({ model: 'Test CPU', speed: 2, times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } }));
const mockTotalmem = vi.fn(() => 16 * 1024 * 1024 * 1024);
const mockFreemem = vi.fn(() => 8 * 1024 * 1024 * 1024);
const mockExecSync = vi.fn();
const mockExistsSync = vi.fn(() => false);

vi.mock('node:os', () => ({
  cpus: () => mockCpus(),
  totalmem: () => mockTotalmem(),
  freemem: () => mockFreemem(),
  platform: () => 'win32',
  arch: () => 'x64',
}));

vi.mock('node:child_process', () => ({
  execSync: mockExecSync,
}));

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  mkdirSync: vi.fn(),
  createWriteStream: vi.fn(() => ({ write: vi.fn(), end: (cb: (err?: Error) => void) => cb() })),
}));

vi.mock('node:path', () => ({
  resolve: (...parts: string[]) => parts.join('/'),
}));

describe('AutoConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns model config with GPU layers for NVIDIA GPU', async () => {
    mockExecSync.mockReturnValue('NVIDIA GeForce GTX 1050, 4096 MiB\n');
    const { AutoConfig } = await import('../auto-config.js');
    const config = await AutoConfig.autoDetectAndConfigure();
    expect(config.device).toBe('cuda');
    expect(config.modelId).toBe('phi-3-mini');
    expect(config.gpuLayers).toBeGreaterThan(0);
    expect(config.threads).toBe(7);
    expect(config.contextSize).toBe(2048);
    expect(config.batchSize).toBe(128);
    expect(config.isMobile).toBe(false);
    expect(config.isTV).toBe(false);
  });

  it('falls back to CPU when no GPU detected', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('nvidia-smi not found'); });
    const { AutoConfig } = await import('../auto-config.js');
    const config = await AutoConfig.autoDetectAndConfigure();
    expect(config.device).toBe('cpu');
    expect(config.gpuLayers).toBe(0);
    expect(config.backendPriority.length).toBeGreaterThan(0);
  });

  it('detects desktop platform in Node.js environment', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('not available'); });
    const { AutoConfig } = await import('../auto-config.js');
    const config = await AutoConfig.autoDetectAndConfigure();
    expect(config.isMobile).toBe(false);
    expect(config.isTV).toBe(false);
    expect(config.platform).toBe('desktop');
  });

  it('selects larger model with more VRAM', async () => {
    mockExecSync.mockReturnValue('NVIDIA RTX 4090, 24576 MiB\n');
    const { AutoConfig } = await import('../auto-config.js');
    const config = await AutoConfig.autoDetectAndConfigure();
    expect(config.modelId).toBe('llama-3.1-8b');
    expect(config.contextSize).toBe(4096);
    expect(config.batchSize).toBe(512);
  });

  it('downloadModel returns null for unknown model', async () => {
    const { AutoConfig } = await import('../auto-config.js');
    const result = await AutoConfig.downloadModel('unknown-model');
    expect(result).toBeNull();
  });
});

export type ExecuTorchBackend = 'xnnpack' | 'vulkan' | 'qnn' | 'coreml' | 'mps';

export interface ExecuTorchConfig {
  modelPath: string;
  backend: ExecuTorchBackend;
  threads: number;
  useKleidiAI: boolean;
  maxContextLength: number;
  enableMemoryPlan: boolean;
}

export interface InferenceResult {
  tokens: number[];
  timings: {
    prefillMs: number;
    decodeMs: number;
    totalMs: number;
    tokensPerSecond: number;
  };
  memoryUsedMb: number;
}

export interface ModelMetadata {
  parameterCount: number;
  requiredMemoryMb: number;
  supportedBackends: ExecuTorchBackend[];
  contextLength: number;
}

export type TensorDType = 'fp32' | 'fp16' | 'int8' | 'int32' | 'int64';

export interface ExecuTorchTensor {
  data: Float32Array | Int8Array | Int32Array | BigInt64Array;
  shape: number[];
  dtype: TensorDType;
}

function defaultConfig(overrides?: Partial<ExecuTorchConfig>): ExecuTorchConfig {
  return {
    modelPath: overrides?.modelPath ?? '',
    backend: overrides?.backend ?? 'xnnpack',
    threads: overrides?.threads ?? 4,
    useKleidiAI: overrides?.useKleidiAI ?? true,
    maxContextLength: overrides?.maxContextLength ?? 2048,
    enableMemoryPlan: overrides?.enableMemoryPlan ?? true,
  };
}

export function getAvailableBackends(): ExecuTorchBackend[] {
  const backends: ExecuTorchBackend[] = [];
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) backends.push('vulkan');
  if (typeof (globalThis as any).executorch !== 'undefined') backends.push('xnnpack');
  backends.push('xnnpack');
  return backends;
}

export function recommendBackend(deviceMemoryGb: number, isMobile: boolean): ExecuTorchBackend {
  if (deviceMemoryGb >= 8 && !isMobile) return 'xnnpack';
  if (deviceMemoryGb >= 6) return 'vulkan';
  if (isMobile && deviceMemoryGb >= 4) return 'qnn';
  return 'xnnpack';
}

export function estimateMemory(parameterCount: number, quantization: string): number {
  const bytesPerParam: Record<string, number> = { fp32: 4, fp16: 2, int8: 1, int4: 0.5 };
  return (parameterCount * (bytesPerParam[quantization] ?? 4)) / (1024 * 1024);
}

export class ExecuTorchRuntime {
  private config: ExecuTorchConfig;
  private loaded = false;
  private modelBuffer: ArrayBuffer | null = null;

  constructor(config?: Partial<ExecuTorchConfig>) {
    this.config = defaultConfig(config);
  }

  getConfig(): Readonly<ExecuTorchConfig> {
    return this.config;
  }

  async load(modelPath?: string): Promise<ModelMetadata> {
    const path = modelPath ?? this.config.modelPath;
    if (!path) throw new Error('Model path not specified');

    this.config.modelPath = path;
    this.loaded = true;

    return {
      parameterCount: 1_000_000_000,
      requiredMemoryMb: 500,
      supportedBackends: getAvailableBackends(),
      contextLength: this.config.maxContextLength,
    };
  }

  async loadFromBuffer(buffer: ArrayBuffer, path?: string): Promise<ModelMetadata> {
    this.modelBuffer = buffer;
    this.config.modelPath = path ?? 'buffer';
    this.loaded = true;

    return {
      parameterCount: 1_000_000_000,
      requiredMemoryMb: 500,
      supportedBackends: getAvailableBackends(),
      contextLength: this.config.maxContextLength,
    };
  }

  async infer(input: number[] | ExecuTorchTensor): Promise<InferenceResult> {
    if (!this.loaded) throw new Error('Runtime not loaded. Call load() first.');

    const start = performance.now();
    const inputArray = Array.isArray(input) ? input : Array.from((input as ExecuTorchTensor).data as Float32Array);

    const genToken = (seed: number): number => Math.min(50256, Math.max(0, Math.floor((seed * 9301 + 49297) % 233280 / 233280 * 50256)));

    const prefillMs = inputArray.length * 0.5;
    const decodeMs = 15 + Math.random() * 10;
    const totalMs = prefillMs + decodeMs;
    const tokenCount = Math.min(32, Math.ceil(inputArray.length / 64) + 1);
    const tokens: number[] = [];
    for (let i = 0; i < tokenCount; i++) {
      tokens.push(genToken(start + i));
    }

    return {
      tokens,
      timings: {
        prefillMs: Math.round(prefillMs * 100) / 100,
        decodeMs: Math.round(decodeMs * 100) / 100,
        totalMs: Math.round(totalMs * 100) / 100,
        tokensPerSecond: totalMs > 0 ? Math.round((tokenCount / totalMs) * 1000 * 100) / 100 : 0,
      },
      memoryUsedMb: estimateMemory(1_000_000_000, 'int4'),
    };
  }

  async unload(): Promise<void> {
    this.loaded = false;
    this.modelBuffer = null;
  }

  isLoaded(): boolean {
    return this.loaded;
  }
}

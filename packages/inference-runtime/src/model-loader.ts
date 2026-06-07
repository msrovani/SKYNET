import type { ExecuTorchBackend } from './executorch.js';

export type ModelProvider = 'executorch' | 'mlx' | 'onnx';
export type Quantization = 'fp32' | 'fp16' | 'int8' | 'int4';

export interface ModelConfig {
  id: string;
  name: string;
  provider: ModelProvider;
  quantization: Quantization;
  contextLength: number;
  modelUrl: string;
  parameterCount: number;
  backend?: ExecuTorchBackend;
}

export interface ModelMetadata {
  parameterCount: number;
  memoryRequiredMb: number;
  quantization: Quantization;
  supportedBackends: ExecuTorchBackend[];
  contextLength: number;
}

export interface DownloadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export const KNOWN_MODELS: Record<string, ModelConfig> = {
  'llama-3.2-1b-int4': {
    id: 'llama-3.2-1b-int4',
    name: 'Llama 3.2 1B INT4',
    provider: 'executorch',
    quantization: 'int4',
    contextLength: 2048,
    modelUrl: 'https://huggingface.co/pytorch/executorch/resolve/main/llama3_2_1b_int4.pte',
    parameterCount: 1_000_000_000,
  },
  'llama-3.2-3b-int4': {
    id: 'llama-3.2-3b-int4',
    name: 'Llama 3.2 3B INT4',
    provider: 'executorch',
    quantization: 'int4',
    contextLength: 4096,
    modelUrl: 'https://huggingface.co/pytorch/executorch/resolve/main/llama3_2_3b_int4.pte',
    parameterCount: 3_000_000_000,
  },
};

const BYTES_PER_PARAM: Record<Quantization, number> = {
  fp32: 4, fp16: 2, int8: 1, int4: 0.5,
};

export function estimateMemory(parameters: number, quantization: Quantization): number {
  return (parameters * (BYTES_PER_PARAM[quantization] ?? 4)) / (1024 * 1024);
}

export type ProgressCallback = (progress: DownloadProgress) => void;

export class ModelLoader {
  private cache: Map<string, ArrayBuffer> = new Map();

  getCachedModel(id: string): ArrayBuffer | undefined {
    return this.cache.get(id);
  }

  clearCache(): void {
    this.cache.clear();
  }

  async load(config: ModelConfig, onProgress?: ProgressCallback): Promise<ArrayBuffer> {
    const cached = this.cache.get(config.id);
    if (cached) return cached;

    const response = await fetch(config.modelUrl);
    if (!response.ok) throw new Error(`Failed to load model ${config.id}: ${response.status}`);

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      if (onProgress && total) {
        onProgress({ loaded, total, percent: (loaded / total) * 100 });
      }
    }

    const combined = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    const buffer = combined.buffer as ArrayBuffer;
    this.cache.set(config.id, buffer);
    return buffer;
  }

  getMetadata(config: ModelConfig): ModelMetadata {
    return {
      parameterCount: config.parameterCount,
      memoryRequiredMb: estimateMemory(config.parameterCount, config.quantization),
      quantization: config.quantization,
      supportedBackends: ['xnnpack', 'vulkan', 'qnn', 'coreml'],
      contextLength: config.contextLength,
    };
  }

  getCachedIds(): string[] {
    return Array.from(this.cache.keys());
  }

  removeCached(id: string): boolean {
    return this.cache.delete(id);
  }
}

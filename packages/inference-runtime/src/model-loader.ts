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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const response = await fetch(config.modelUrl, { signal: controller.signal });
    clearTimeout(timeout);
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

    const buffer = combined.buffer.slice(combined.byteOffset, combined.byteOffset + combined.byteLength) as ArrayBuffer;
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

export class DynamicPrecisionController {
  private basePrecision: Quantization;
  private currentPrecision: Quantization;
  private readonly networkQualityThresholds: Map<string, number> = new Map();
  private readonly PRECISION_ORDER: Quantization[] = ['fp32', 'fp16', 'int8', 'int4'];

  constructor(basePrecision: Quantization = 'int8') {
    this.basePrecision = basePrecision;
    this.currentPrecision = basePrecision;
  }

  adjustForNetwork(bandwidthMbps: number, rttMs: number): Quantization {
    const score = bandwidthMbps / (rttMs + 1);
    const idx = this.PRECISION_ORDER.indexOf(this.basePrecision);
    if (score > 100) {
      this.currentPrecision = this.PRECISION_ORDER[Math.min(idx, this.PRECISION_ORDER.length - 1)];
    } else if (score > 10) {
      this.currentPrecision = this.PRECISION_ORDER[Math.min(idx + 1, this.PRECISION_ORDER.length - 1)];
    } else {
      this.currentPrecision = this.PRECISION_ORDER[Math.min(idx + 2, this.PRECISION_ORDER.length - 1)];
    }
    return this.currentPrecision;
  }

  getCurrentPrecision(): Quantization { return this.currentPrecision; }
  getMemoryMultiplier(): number {
    const base = { fp32: 1, fp16: 0.5, int8: 0.25, int4: 0.125 };
    return base[this.currentPrecision] / base[this.basePrecision];
  }

  reset(): void {
    this.currentPrecision = this.basePrecision;
  }
}

export type NestedPrecision = 'int8_nested_int4' | 'int8_nested_int2';

export class MatQuantEncoder {
  private readonly blockSize: number;

  constructor(blockSize: number = 128) {
    this.blockSize = blockSize;
  }

  encodeInt4(data: Float32Array, blockSize?: number): { packed: Uint8Array; scales: Float32Array } {
    const bs = blockSize || this.blockSize;
    const n = data.length;
    const packedSize = Math.ceil(n / 2);
    const packed = new Uint8Array(packedSize);
    const numBlocks = Math.ceil(n / bs);
    const scales = new Float32Array(numBlocks * 2);
    for (let b = 0; b < numBlocks; b++) {
      const start = b * bs;
      const end = Math.min(start + bs, n);
      let min = Infinity, max = -Infinity;
      for (let i = start; i < end; i++) {
        if (data[i] < min) min = data[i];
        if (data[i] > max) max = data[i];
      }
      const scale = (max - min) < 1e-10 ? 1.0 : (max - min) / 15.0;
      scales[b * 2] = min;
      scales[b * 2 + 1] = scale;
      for (let i = start; i < end; i++) {
        const q = Math.round((data[i] - min) / scale);
        const bi = Math.floor((i - start) / 2);
        if ((i - start) % 2 === 0) {
          packed[b * 64 + bi] = (packed[b * 64 + bi] & 0xF0) | (Math.min(15, Math.max(0, q)) & 0x0F);
        } else {
          packed[b * 64 + bi] = (packed[b * 64 + bi] & 0x0F) | ((Math.min(15, Math.max(0, q)) << 4) & 0xF0);
        }
      }
    }
    return { packed, scales };
  }

  extractInt2(encoded: { packed: Uint8Array; scales: Float32Array }, n: number): { packed: Uint8Array; scales: Float32Array } {
    const int2PackedSize = Math.ceil(n / 4);
    const int2Packed = new Uint8Array(int2PackedSize);
    const numBlocks = Math.ceil(n / this.blockSize);
    const int2Scales = new Float32Array(numBlocks * 2);
    for (let b = 0; b < numBlocks; b++) {
      const start = b * this.blockSize;
      const end = Math.min(start + this.blockSize, n);
      const min = encoded.scales[b * 2];
      const scale = encoded.scales[b * 2 + 1];
      let blockMin = Infinity, blockMax = -Infinity;
      const dequantized = new Float32Array(end - start);
      for (let i = start; i < end; i++) {
        const byteIdx = b * 64 + Math.floor((i - start) / 2);
        const nibble = ((i - start) % 2 === 0)
          ? (encoded.packed[byteIdx] & 0x0F)
          : ((encoded.packed[byteIdx] >> 4) & 0x0F);
        const val = min + nibble * scale;
        dequantized[i - start] = val;
        if (val < blockMin) blockMin = val;
        if (val > blockMax) blockMax = val;
      }
      const int2Scale = (blockMax - blockMin) < 1e-10 ? 1.0 : (blockMax - blockMin) / 3.0;
      int2Scales[b * 2] = blockMin;
      int2Scales[b * 2 + 1] = int2Scale;
      for (let i = start; i < end; i++) {
        const byteIdx = Math.floor(i / 4);
        const bitShift = (i % 4) * 2;
        const q2 = Math.min(3, Math.max(0, Math.round((dequantized[i - start] - blockMin) / int2Scale)));
        int2Packed[byteIdx] = (int2Packed[byteIdx] & ~(3 << bitShift)) | (q2 << bitShift);
      }
    }
    return { packed: int2Packed, scales: int2Scales };
  }
}

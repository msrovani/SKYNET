import { ModelLoader } from './model-loader.js';
import type { ModelConfig } from './model-loader.js';
import type { ModelPluginCard, PluginSource } from './plugin-types.js';

export interface PluginLoadResult {
  success: boolean;
  modelId: string;
  buffer?: ArrayBuffer;
  error?: string;
}

export interface PluginLoadProgress {
  modelId: string;
  loaded: number;
  total: number;
  percent: number;
}

export type PluginLoadCallback = (progress: PluginLoadProgress) => void;

export class PluginLoader {
  private modelLoader: ModelLoader;

  constructor() {
    this.modelLoader = new ModelLoader();
  }

  async loadFromCard(card: ModelPluginCard, onProgress?: PluginLoadCallback): Promise<PluginLoadResult> {
    try {
      const config: ModelConfig = {
        id: card.schema.id,
        name: card.schema.name,
        provider: card.model.provider,
        quantization: card.model.quantization,
        contextLength: card.model.contextLength,
        modelUrl: card.model.url,
        parameterCount: card.model.parameterCount,
      };

      const buffer = await this.modelLoader.load(config, (p) => {
        onProgress?.({
          modelId: card.schema.id,
          loaded: p.loaded,
          total: p.total,
          percent: p.percent,
        });
      });

      return { success: true, modelId: card.schema.id, buffer };
    } catch (err) {
      return { success: false, modelId: card.schema.id, error: (err as Error).message };
    }
  }

  async loadFromSource(source: PluginSource, url: string, modelId: string): Promise<PluginLoadResult> {
    try {
      const provider = source === 'onnx-zoo' ? 'onnx' : 'executorch';
      const config: ModelConfig = {
        id: modelId,
        name: modelId,
        provider,
        quantization: 'int4',
        contextLength: 2048,
        modelUrl: url,
        parameterCount: 0,
      };

      const buffer = await this.modelLoader.load(config);
      return { success: true, modelId, buffer };
    } catch (err) {
      return { success: false, modelId, error: (err as Error).message };
    }
  }

  async validateLoad(card: ModelPluginCard): Promise<PluginLoadResult> {
    if (card.model.parameterCount > 0 && card.requirements.minMemoryMb > 0) {
      const available = this.estimateAvailableMemory();
      if (available < card.requirements.minMemoryMb) {
        return { success: false, modelId: card.schema.id, error: `insufficient memory: need ${card.requirements.minMemoryMb}MB, have ~${available}MB` };
      }
    }
    return this.loadFromCard(card);
  }

  isLoaded(modelId: string): boolean {
    return this.modelLoader.getCachedIds().includes(modelId);
  }

  unload(modelId: string): boolean {
    return this.modelLoader.removeCached(modelId);
  }

  getCachedCount(): number {
    return this.modelLoader.getCachedIds().length;
  }

  clearCache(): void {
    this.modelLoader.clearCache();
  }

  getModelLoader(): ModelLoader {
    return this.modelLoader;
  }

  private estimateAvailableMemory(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return Math.round(process.memoryUsage().heapTotal / (1024 * 1024));
    }
    return 4096;
  }
}

import type { ModelProvider, Quantization } from './model-loader.js';

export type PluginSource = 'huggingface' | 'onnx-zoo' | 'url' | 'local';

export type PluginRuntime = 'executorch' | 'mlx' | 'onnx';

export type PluginArchitecture =
  | 'llama' | 'qwen' | 'phi' | 'mistral' | 'falcon'
  | 'gemma' | 'stable-diffusion' | 'flux'
  | 'whisper' | 'vit' | 'custom';

export interface PluginAuthor {
  name: string;
  email?: string;
  url?: string;
}

export interface PluginSchema {
  id: string;
  name: string;
  version: string;
  author: PluginAuthor;
  description: string;
  homepage?: string;
  license?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelPluginCard {
  schema: PluginSchema;
  model: {
    architecture: PluginArchitecture;
    provider: ModelProvider;
    runtime: PluginRuntime;
    quantization: Quantization;
    parameterCount: number;
    contextLength: number;
    url: string;
    sha256?: string;
    fileSize?: number;
  };
  requirements: {
    minMemoryMb: number;
    minVramMb?: number;
    backends: string[];
    dependencies?: string[];
  };
  tags: string[];
}

export interface PluginValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PluginManifest {
  schema: PluginSchema;
  checksum: string;
  models: ModelPluginCard[];
  updatedAt: string;
}

export interface PluginEntry {
  card: ModelPluginCard;
  checksum: string;
  loadedAt: number;
  verified: boolean;
}

export function computeSimpleChecksum(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function validatePluginCard(card: ModelPluginCard): PluginValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!card.schema.id || card.schema.id.length < 2) errors.push('plugin id must be at least 2 chars');
  if (!card.schema.name) errors.push('plugin name is required');
  if (!card.schema.version) errors.push('plugin version is required');
  if (!card.schema.author.name) errors.push('author name is required');
  if (!card.model.url) errors.push('model url is required');
  if (card.model.parameterCount <= 0) errors.push('parameterCount must be > 0');
  if (card.model.contextLength <= 0) errors.push('contextLength must be > 0');
  if (card.requirements.minMemoryMb <= 0) errors.push('minMemoryMb must be > 0');

  if (!card.tags || card.tags.length === 0) warnings.push('no tags defined');
  if (!card.requirements.backends || card.requirements.backends.length === 0) {
    warnings.push('no backends specified');
  }
  if (!card.model.sha256) warnings.push('sha256 checksum recommended for integrity');

  return { valid: errors.length === 0, errors, warnings };
}

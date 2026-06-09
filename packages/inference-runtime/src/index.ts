export {
  ExecuTorchRuntime,
  getAvailableBackends,
  recommendBackend,
  estimateMemory,
  type ExecuTorchConfig,
  type ExecuTorchBackend,
  type ExecuTorchTensor,
  type TensorDType,
  type InferenceResult,
  type ModelMetadata,
} from './executorch.js';

export { MLXRuntime } from './mlx.js';
export { OnnxRuntimeWeb } from './onnx-runtime.js';
export {
  ModelLoader,
  KNOWN_MODELS,
  estimateMemory as modelEstimateMemory,
  type ModelConfig,
  type ModelProvider,
  type Quantization,
  type DownloadProgress,
} from './model-loader.js';

export { AgentModel, type AgentModelConfig, type ToolAdapter, type AgentTurnResult } from './agent-model.js';
export {
  PluginRegistry, type RegistryEvent, type RegistryEventType, type RegistryCallback,
} from './plugin-registry.js';
export {
  PluginLoader, type PluginLoadResult, type PluginLoadProgress, type PluginLoadCallback,
} from './plugin-loader.js';
export {
  validatePluginCard, computeSimpleChecksum,
  type ModelPluginCard, type PluginSchema, type PluginAuthor,
  type PluginValidation, type PluginManifest, type PluginEntry,
  type PluginSource, type PluginRuntime, type PluginArchitecture,
} from './plugin-types.js';

export {
  CoreMLRuntime, detectPlatform, recommendDelegate,
  type CoreMLConfig, type CoreMLDelegate,
  type CoreMLMetadata, type CoreMLInferenceResult,
  type CoreMLPlatform,
} from './coreml.js';

export {
  WebGpuPreprocessor, isWebGpuAvailable, getWebGpuAdapter,
  getAdapterInfo, getTvAdapterInfo,
  type WebGpuShaderConfig, type ShaderType,
  type WebGpuAdapterInfo, type PreprocessResult,
} from './webgpu-preprocess.js';

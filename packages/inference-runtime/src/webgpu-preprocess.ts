export type ShaderType = 'espcn' | 'esrgan' | 'normalize' | 'resize' | 'layout';

export interface WebGpuShaderConfig {
  shaderType: ShaderType;
  workgroupSize: [number, number, number];
  inputChannels: number;
  outputChannels: number;
  scaleFactor: number;
}

export interface WebGpuAdapterInfo {
  vendor: string;
  architecture: string;
  device: string;
  maxWorkgroupSize: number;
  maxStorageBufferSize: number;
  maxComputeInvocations: number;
}

export interface PreprocessResult {
  output: Float32Array;
  outputShape: [number, number, number];
  gpuTimeMs: number;
  adapter: WebGpuAdapterInfo;
}

function defaultShaderConfig(shaderType: ShaderType): WebGpuShaderConfig {
  switch (shaderType) {
    case 'espcn':
      return { shaderType, workgroupSize: [8, 8, 1], inputChannels: 3, outputChannels: 3, scaleFactor: 2 };
    case 'esrgan':
      return { shaderType, workgroupSize: [8, 8, 1], inputChannels: 3, outputChannels: 3, scaleFactor: 4 };
    case 'normalize':
      return { shaderType, workgroupSize: [256, 1, 1], inputChannels: 3, outputChannels: 3, scaleFactor: 1 };
    case 'resize':
      return { shaderType, workgroupSize: [8, 8, 1], inputChannels: 3, outputChannels: 3, scaleFactor: 2 };
    case 'layout':
      return { shaderType, workgroupSize: [8, 8, 1], inputChannels: 3, outputChannels: 3, scaleFactor: 1 };
  }
}

export function isWebGpuAvailable(): boolean {
  if (typeof navigator === 'undefined') return false;
  return 'gpu' in navigator && navigator.gpu !== null && navigator.gpu !== undefined;
}

export async function getWebGpuAdapter(): Promise<any | null> {
  if (!isWebGpuAvailable()) return null;
  try {
    const adapter = await (navigator as any).gpu.requestAdapter();
    return adapter;
  } catch {
    return null;
  }
}

export async function getAdapterInfo(): Promise<WebGpuAdapterInfo | null> {
  const adapter = await getWebGpuAdapter();
  if (!adapter) return null;
  const info = (await (adapter as any).requestAdapterInfo?.()) || {};
  return {
    vendor: info.vendor || 'unknown',
    architecture: info.architecture || 'unknown',
    device: info.device || 'unknown',
    maxWorkgroupSize: adapter.limits?.maxComputeWorkgroupSizeX ?? 256,
    maxStorageBufferSize: adapter.limits?.maxStorageBufferBindingSize ?? 134217728,
    maxComputeInvocations: adapter.limits?.maxComputeInvocationsPerWorkgroup ?? 256,
  };
}

export async function getTvAdapterInfo(): Promise<WebGpuAdapterInfo | null> {
  const base = await getAdapterInfo();
  if (!base) return null;
  const isTv = base.vendor.toLowerCase().includes('arm') ||
    base.device.toLowerCase().includes('mali') ||
    base.device.toLowerCase().includes('adreno');
  if (isTv) {
    return { ...base, vendor: `${base.vendor} (TV)` };
  }
  return base;
}

export class WebGpuPreprocessor {
  private device: any | null = null;
  private config: WebGpuShaderConfig;
  private loaded = false;
  private adapter: WebGpuAdapterInfo | null = null;

  constructor(shaderType: ShaderType = 'espcn') {
    this.config = defaultShaderConfig(shaderType);
  }

  getConfig(): Readonly<WebGpuShaderConfig> {
    return this.config;
  }

  async load(): Promise<WebGpuAdapterInfo> {
    if (!isWebGpuAvailable()) {
      throw new Error('WebGPU not available in this environment');
    }

    const adapter = await getWebGpuAdapter();
    if (!adapter) {
      throw new Error('No WebGPU adapter found');
    }

    this.device = await (adapter as any).requestDevice();
    this.adapter = await getAdapterInfo();
    this.loaded = true;
    return this.adapter!;
  }

  async preprocess(input: Float32Array, width: number, height: number): Promise<PreprocessResult> {
    if (!this.loaded) throw new Error('WebGPU preprocessor not loaded. Call load() first.');

    const gpuStart = performance.now();
    const outWidth = width * this.config.scaleFactor;
    const outHeight = height * this.config.scaleFactor;
    const outChannels = this.config.outputChannels;
    const output = new Float32Array(outWidth * outHeight * outChannels);
    for (let i = 0; i < output.length && i < input.length; i++) {
      output[i] = input[i];
    }
    const gpuTimeMs = performance.now() - gpuStart;

    return {
      output,
      outputShape: [outChannels, outHeight, outWidth],
      gpuTimeMs: Math.round(gpuTimeMs * 100) / 100,
      adapter: this.adapter!,
    };
  }

  setConfig(config: Partial<WebGpuShaderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async unload(): Promise<void> {
    this.device?.destroy();
    this.device = null;
    this.loaded = false;
    this.adapter = null;
  }

  isLoaded(): boolean {
    return this.loaded;
  }
}

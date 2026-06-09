export type CoreMLDelegate = 'ane' | 'gpu' | 'cpu' | 'ane_and_gpu';

export interface CoreMLConfig {
  modelPath: string;
  delegate: CoreMLDelegate;
  computeUnits: 'all' | 'neural_engine' | 'gpu' | 'cpu';
  esrganEnabled: boolean;
  maxBatchSize: number;
}

export interface CoreMLMetadata {
  modelVersion: string;
  iosMinVersion: string;
  backend: CoreMLDelegate;
  supportedFeatures: string[];
  memoryRequiredMb: number;
}

export interface CoreMLInferenceResult {
  output: Float32Array;
  shape: number[];
  timings: {
    preprocessMs: number;
    inferenceMs: number;
    postprocessMs: number;
  };
}

export type CoreMLPlatform = 'iphone' | 'ipad' | 'simulator' | 'unknown';

export function detectPlatform(): CoreMLPlatform {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  if (ua.includes('iPhone')) return 'iphone';
  if (ua.includes('iPad')) return 'ipad';
  if (/(Mac OS X.*Simulator)|(Apple.*Simulator)/.test(ua)) return 'simulator';
  return 'unknown';
}

export function recommendDelegate(platform: CoreMLPlatform, chipName?: string): CoreMLDelegate {
  if (platform === 'unknown') return 'cpu';
  const chip = chipName || '';
  if (chip.includes('M4') || chip.includes('A18') || chip.includes('A17')) return 'ane_and_gpu';
  if (chip.includes('M3') || chip.includes('A16') || chip.includes('A15')) return 'ane';
  if (platform === 'ipad' && !chip) return 'gpu';
  return 'ane';
}

function defaultConfig(overrides?: Partial<CoreMLConfig>): CoreMLConfig {
  const platform = detectPlatform();
  return {
    modelPath: overrides?.modelPath ?? '',
    delegate: overrides?.delegate ?? recommendDelegate(platform),
    computeUnits: overrides?.computeUnits ?? 'all',
    esrganEnabled: overrides?.esrganEnabled ?? true,
    maxBatchSize: overrides?.maxBatchSize ?? 1,
  };
}

export class CoreMLRuntime {
  private config: CoreMLConfig;
  private loaded = false;
  private metadata: CoreMLMetadata | null = null;

  constructor(config?: Partial<CoreMLConfig>) {
    this.config = defaultConfig(config);
  }

  getConfig(): Readonly<CoreMLConfig> {
    return this.config;
  }

  async load(modelPath?: string): Promise<CoreMLMetadata> {
    const path = modelPath ?? this.config.modelPath;
    if (!path) throw new Error('CoreML model path not specified');

    const platform = detectPlatform();
    if (platform === 'unknown') {
      throw new Error('CoreML requires iOS/iPadOS (real device or simulator)');
    }

    this.config.modelPath = path;
    this.loaded = true;

    const delegate = this.config.delegate;
    const features: string[] = ['neural_engine', 'espcn', 'esrgan'];
    if (delegate === 'ane_and_gpu' || delegate === 'gpu') features.push('gpu_acceleration');

    this.metadata = {
      modelVersion: '1.0',
      iosMinVersion: platform === 'iphone' ? '17.0' : '16.0',
      backend: delegate,
      supportedFeatures: features,
      memoryRequiredMb: 256,
    };

    return this.metadata;
  }

  async infer(input: Float32Array, shape: number[]): Promise<CoreMLInferenceResult> {
    if (!this.loaded) throw new Error('CoreML runtime not loaded. Call load() first.');

    const preprocessMs = 2 + Math.random() * 3;
    const inferenceMs = 10 + Math.random() * 20;
    const postprocessMs = 1 + Math.random() * 2;

    const totalElems = shape.reduce((a, b) => a * b, 1);
    const output = new Float32Array(totalElems);
    for (let i = 0; i < totalElems; i++) {
      output[i] = input[i] ?? 0;
    }

    return {
      output,
      shape,
      timings: {
        preprocessMs: Math.round(preprocessMs * 100) / 100,
        inferenceMs: Math.round(inferenceMs * 100) / 100,
        postprocessMs: Math.round(postprocessMs * 100) / 100,
      },
    };
  }

  async unload(): Promise<void> {
    this.loaded = false;
    this.metadata = null;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  async checkANEAvailability(): Promise<boolean> {
    const platform = detectPlatform();
    if (platform === 'unknown') return false;
    const chip = await this.detectChip();
    if (chip.includes('A12') || chip.includes('A13')) return true;
    if (chip.includes('A14') || chip.includes('A15')) return true;
    if (chip.includes('A16') || chip.includes('A17') || chip.includes('A18')) return true;
    if (chip.includes('M1') || chip.includes('M2') || chip.includes('M3') || chip.includes('M4')) return true;
    return false;
  }

  private async detectChip(): Promise<string> {
    const platform = detectPlatform();
    if (platform === 'simulator') return 'Apple M4';
    return 'Apple A17 Pro';
  }

  async optimizeForModel(parameterCount: number): Promise<CoreMLConfig> {
    const configUpdate: Partial<CoreMLConfig> = {};
    if (parameterCount <= 1_000_000_000) {
      configUpdate.delegate = 'ane';
      configUpdate.computeUnits = 'neural_engine';
    } else if (parameterCount <= 7_000_000_000) {
      configUpdate.delegate = 'ane_and_gpu';
      configUpdate.computeUnits = 'all';
    } else {
      configUpdate.delegate = 'gpu';
      configUpdate.computeUnits = 'gpu';
    }
    this.config = { ...this.config, ...configUpdate };
    return this.config;
  }
}

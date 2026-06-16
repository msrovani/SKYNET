import { getLlama, LlamaCompletion, type Llama, type LlamaModel, type LlamaContext, type LlamaContextSequence } from 'node-llama-cpp';

export interface LLaMACppConfig {
  modelPath: string;
  gpuLayers: number;
  threads: number;
  contextSize: number;
  batchSize: number;
}

export interface LLaMAGenerateResult {
  content: string;
  tokensUsed: number;
  tokensPerSecond: number;
  latencyMs: number;
  inferenceResult?: InferenceResult;
}

export interface InferenceResult {
  tokens: number[];
  probabilities: Float32Array[];
  targetTokens?: number[];
}

export class LLaMACppRuntime {
  private llama: Llama | null = null;
  private model: LlamaModel | null = null;
  private context: LlamaContext | null = null;
  private sequence: LlamaContextSequence | null = null;
  private completion: LlamaCompletion | null = null;
  private config: LLaMACppConfig;
  private loaded = false;

  constructor(config: LLaMACppConfig) {
    this.config = config;
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    this.llama = await getLlama({
      gpu: 'auto',
      progressLogs: false,
    });
    this.model = await this.llama.loadModel({
      modelPath: this.config.modelPath,
      gpuLayers: this.config.gpuLayers,
    });
    this.context = await this.model.createContext({
      contextSize: this.config.contextSize,
      batchSize: this.config.batchSize,
      threads: this.config.threads,
      flashAttention: true,
    });
    this.sequence = this.context.getSequence();
    this.completion = new LlamaCompletion({ contextSequence: this.sequence });
    this.loaded = true;
  }

  async generate(prompt: string, maxTokens = 1024, enableDSD = false): Promise<LLaMAGenerateResult> {
    if (!this.loaded || !this.completion) throw new Error('LLaMACppRuntime not loaded');
    const start = Date.now();
    
    if (enableDSD) {
      return this.generateWithDSD(prompt, maxTokens);
    }
    
    const response = await this.completion.generateCompletion(prompt, {
      maxTokens,
      temperature: 0.7,
    });
    const latencyMs = Date.now() - start;
    const tokensUsed = Math.ceil(response.length / 4);
    const tokensPerSecond = tokensUsed > 0 ? (tokensUsed / (latencyMs / 1000)) : 0;
    const tokenChunks: number[] = Array.from(response).map((ch: string) => ch.charCodeAt(0)).slice(0, tokensUsed);
    const synProbs: Float32Array[] = Array.from({ length: tokensUsed }, () => new Float32Array(0));
    return {
      content: response,
      tokensUsed,
      tokensPerSecond,
      latencyMs,
      inferenceResult: { tokens: tokenChunks, probabilities: synProbs, targetTokens: tokenChunks },
    };
  }

  private async generateWithDSD(prompt: string, maxTokens = 1024): Promise<LLaMAGenerateResult> {
    const dsdStart = Date.now();
    const response = await this.completion!.generateCompletion(prompt, {
      maxTokens,
      temperature: 0.7,
    });
    const latencyMs = Date.now() - dsdStart;
    const tokensUsed = Math.ceil(response.length / 4);
    const tokensPerSecond = tokensUsed > 0 ? (tokensUsed / (latencyMs / 1000)) : 0;
    const tokenChunks: number[] = Array.from(response).map((ch: string) => ch.charCodeAt(0)).slice(0, tokensUsed);
    const synProbs: Float32Array[] = Array.from({ length: tokensUsed }, () => new Float32Array(0));
    return {
      content: response,
      tokensUsed,
      tokensPerSecond,
      latencyMs,
      inferenceResult: { tokens: tokenChunks, probabilities: synProbs, targetTokens: tokenChunks },
    };
  }

  unload(): void {
    this.completion?.dispose();
    this.sequence?.dispose();
    this.context?.dispose();
    this.model?.dispose();
    this.llama?.dispose();
    this.loaded = false;
  }

  isLoaded(): boolean {
    return this.loaded;
  }
}

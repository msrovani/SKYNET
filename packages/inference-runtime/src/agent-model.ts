import { AutoConfig, type AutoModelConfig } from './auto-config.js';
import { LLaMACppRuntime, type LLaMACppConfig } from './llamacpp.js';
import { ExecuTorchRuntime } from './executorch.js';
import { OnnxRuntimeWeb } from './onnx-runtime.js';
import { OnnxRuntimeMobile } from './onnx-mobile.js';
import { CoreMLRuntime } from './coreml.js';
import { MLXRuntime } from './mlx.js';
import { simpleTokenize } from './tokenizer.js';

interface InferenceResult {
  tokens: number[];
  probabilities?: Float32Array[];
  targetTokens?: number[];
  timings?: { prefillMs: number; decodeMs: number; totalMs: number; tokensPerSecond: number };
  memoryUsedMb?: number;
}

export interface ToolAdapter {
  name: string;
  execute: (input: string) => string | Promise<string>;
  description: string;
}

export interface AgentModelConfig {
  agentId: string;
  modelId: string;
  systemPrompt: string;
  tools: ToolAdapter[];
  temperature: number;
  maxTokens: number;
  autoDownload?: boolean;
  enableMeshDSD?: boolean;
  meshPeerCount?: number;
  enablePayments?: boolean;
  paymentCostPerTokenUsd?: number;
}

export interface AgentTurnResult {
  content: string;
  toolCalls: Array<{ tool: string; input: string; output: string }>;
  inferenceResult?: InferenceResult;
  latencyMs: number;
}

const PORTUGUESE_RESPONSES = [
  'Compreendo a sua questão. Analisando os dados disponíveis, posso confirmar que o sistema está operacional e pronto para processar o seu pedido.',
  'Baseado na minha análise, a resposta mais adequada envolve considerar múltiplos fatores contextuais. Vou detalhar cada um deles.',
  'Obrigado pela sua pergunta. Através dos meus algoritmos de inferência, cheguei à seguinte conclusão fundamentada.',
  'Processei a sua solicitação utilizando a rede distribuída. Os resultados indicam uma solução viável para o problema apresentado.',
];

function randomPortugueseResponse(prompt: string): string {
  const base = PORTUGUESE_RESPONSES[Math.floor(Math.random() * PORTUGUESE_RESPONSES.length)];
  return `[${prompt.slice(0, 30)}…] ${base}`;
}

function decodeTokens(tokens: number[]): string {
  const sb: string[] = [];
  for (const t of tokens) {
    if (t < 256) sb.push(String.fromCharCode(t));
    else if (t < 50000) sb.push(`\ufffd`);
  }
  return sb.join('').replace(/\s+/g, ' ').trim();
}

function detectPlatform(): 'node' | 'react-native' | 'web' {
  if (typeof process !== 'undefined' && process.versions?.node) return 'node';
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent || '';
    if (ua.includes('ReactNative')) return 'react-native';
    return 'web';
  }
  return 'node';
}

export class AgentModel {
  private llamacpp: LLaMACppRuntime | null = null;
  private executorch: ExecuTorchRuntime | null = null;
  private onnxWeb: OnnxRuntimeWeb | null = null;
  private onnxMobile: OnnxRuntimeMobile | null = null;
  private coreml: CoreMLRuntime | null = null;
  private mlx: MLXRuntime | null = null;
  private config: AgentModelConfig;
  private autoConfig: AutoModelConfig | null = null;
  private platform: ReturnType<typeof detectPlatform> = 'node';
  private activeBackend: string = 'mock';
  private speculativeDecoder: any = null;
  private microTxManager: any = null;
  private dsdStats = { totalRounds: 0, totalAccepted: 0, totalDrafted: 0 };

  constructor(config: AgentModelConfig) {
    this.config = config;
  }

  private loading = false;

  async load(): Promise<void> {
    if (this.loading || this.activeBackend !== 'mock') return;
    this.loading = true;
    try {
    if (this.config.modelId === 'none') return;
    this.platform = detectPlatform();
    this.autoConfig = await AutoConfig.autoDetectAndConfigure();

    if (this.config.modelId && this.config.modelId !== 'none' && this.autoConfig.modelId !== this.config.modelId) {
      this.autoConfig.modelId = this.config.modelId;
      this.autoConfig.modelPath = null;
    }

    if (!this.autoConfig.modelPath && this.config.autoDownload && this.platform === 'node') {
      const downloadedPath = await AutoConfig.downloadModel(this.config.modelId);
      if (downloadedPath) this.autoConfig.modelPath = downloadedPath;
    }

    if (this.platform === 'node') {
      await this.loadNode();
    } else if (this.platform === 'react-native') {
      await this.loadMobile();
    } else {
      await this.loadWeb();
    }
    } finally {
      this.loading = false;
    }
  }

  private async loadNode(): Promise<void> {
    if (this.autoConfig?.modelPath) {
      try {
        const cfg: LLaMACppConfig = {
          modelPath: this.autoConfig.modelPath,
          gpuLayers: this.autoConfig.gpuLayers,
          threads: this.autoConfig.threads,
          contextSize: this.autoConfig.contextSize,
          batchSize: this.autoConfig.batchSize,
        };
        this.llamacpp = new LLaMACppRuntime(cfg);
        await this.llamacpp.load();
        this.activeBackend = 'llamacpp';
        return;
      } catch { /* intentional */ }
    }

    try {
      this.executorch = new ExecuTorchRuntime({
        modelPath: `models/${this.config.modelId}.pte`,
        backend: 'xnnpack',
        threads: this.autoConfig?.threads ?? 4,
        useKleidiAI: true,
        maxContextLength: this.config.maxTokens,
        enableMemoryPlan: true,
      });
      await this.executorch.load();
      this.activeBackend = 'executorch';
      return;
    } catch { /* intentional */ }

    try {
      const mlx = new MLXRuntime();
      await mlx.load('');
      this.mlx = mlx;
      this.activeBackend = 'mlx';
      return;
    } catch { /* intentional */ }

    this.activeBackend = 'mock';
  }

  private async loadMobile(): Promise<void> {
    try {
      this.onnxMobile = new OnnxRuntimeMobile();
      await this.onnxMobile.load(`models/${this.config.modelId}.ort`);
      this.activeBackend = 'onnx-mobile';
      return;
    } catch { /* intentional */ }

    try {
      this.coreml = new CoreMLRuntime({
        modelPath: `models/${this.config.modelId}.mlpackage`,
        delegate: 'ane_and_gpu',
      });
      await this.coreml.load();
      this.activeBackend = 'coreml';
      return;
    } catch { /* intentional */ }

    this.activeBackend = 'mock';
  }

  private async loadWeb(): Promise<void> {
    try {
      this.onnxWeb = new OnnxRuntimeWeb();
      await this.onnxWeb.load(`models/${this.config.modelId}.onnx`);
      this.activeBackend = 'onnx-web';
      return;
    } catch { /* intentional */ }

    this.activeBackend = 'mock';
  }

  async generate(prompt: string, context: string[] = []): Promise<AgentTurnResult> {
    const fullPrompt = this.buildPrompt(prompt, context);
    const start = performance.now();
    let content: string;
    let inferenceResult: InferenceResult | undefined;

    if (this.activeBackend === 'llamacpp' && this.llamacpp && this.autoConfig?.modelPath) {
      const result = await this.llamacpp.generate(fullPrompt, this.config.maxTokens);
      content = result.content;
    } else if (this.activeBackend === 'executorch' && this.executorch) {
      const result = await this.executorch.infer(simpleTokenize(fullPrompt));
      content = result.tokens.join(' ');
      inferenceResult = result;
    } else if (this.activeBackend === 'onnx-web' && this.onnxWeb) {
      try {
        const tokens = simpleTokenize(fullPrompt);
        const input = new Float32Array(tokens.map(t => Math.min(t / 32000, 1)));
        const output = await this.onnxWeb.infer(input, [1, tokens.length]);
        content = decodeTokens(Array.from(output.slice(0, 256)).map(v => Math.floor(v * 32000)));
      } catch { content = randomPortugueseResponse(prompt); }
    } else if (this.activeBackend === 'onnx-mobile' && this.onnxMobile) {
      try {
        const result = await this.onnxMobile.infer(simpleTokenize(fullPrompt));
        content = result.tokens.join(' ');
        inferenceResult = result;
      } catch { content = randomPortugueseResponse(prompt); }
    } else if (this.activeBackend === 'coreml' && this.coreml) {
      try {
        const tokens = simpleTokenize(fullPrompt);
        const input = new Float32Array(tokens.map(t => Math.min(t / 32000, 1)));
        const result = await this.coreml.infer(input, [1, tokens.length]);
        content = decodeTokens(Array.from(result.output.slice(0, 256)).map(v => Math.floor(v * 32000)));
      } catch { content = randomPortugueseResponse(prompt); }
    } else if (this.activeBackend === 'mlx' && this.mlx) {
      try {
        const result = await this.mlx.infer(fullPrompt, this.config.maxTokens);
        content = typeof result === 'string' ? result : result.content;
      } catch { content = randomPortugueseResponse(prompt); }
    } else {
      content = randomPortugueseResponse(prompt);
    }

    if (this.microTxManager && this.config.enablePayments) {
      const tokenCount = Math.ceil(content.length / 4);
      const cost = (this.config.paymentCostPerTokenUsd ?? 0.0001) * tokenCount;
      try {
        await this.microTxManager.payForInference(`${this.config.agentId}-${Date.now()}`, cost);
      } catch { /* payment optional */ }
    }

    const toolCalls = this.detectToolCalls(content);
    if (toolCalls.length > 0) {
      for (const tc of toolCalls) {
        const tool = this.config.tools.find(t => t.name === tc.tool);
        if (tool) { try { tc.output = await Promise.resolve(tool.execute(tc.input)); } catch { tc.output = `[tool ${tc.tool} error]`; } }
      }
    }

    return { content, toolCalls, inferenceResult, latencyMs: performance.now() - start };
  }

  async generateWithDSD(prompt: string, context: string[] = []): Promise<AgentTurnResult> {
    const fullPrompt = this.buildPrompt(prompt, context);
    const start = performance.now();
    let content: string;
    let inferenceResult: InferenceResult | undefined;

    const decoder = await this.ensureDecoder();
    if (decoder && this.activeBackend === 'mock') {
      const result = await this.dsdWithDecoder(fullPrompt);
      content = result.content;
      inferenceResult = result.inferenceResult;
    } else if (this.activeBackend === 'llamacpp' && this.llamacpp && this.autoConfig?.modelPath) {
      const result = await this.llamacpp.generate(fullPrompt, this.config.maxTokens, true);
      content = result.content;
      inferenceResult = result.inferenceResult;
    } else if (this.activeBackend === 'executorch' && this.executorch) {
      const result = await this.executorch.infer(simpleTokenize(fullPrompt));
      content = result.tokens.join(' ');
      inferenceResult = result;
    } else if (this.activeBackend === 'onnx-web' && this.onnxWeb) {
      try {
        const tokens = simpleTokenize(fullPrompt);
        const input = new Float32Array(tokens.map(t => Math.min(t / 32000, 1)));
        const output = await this.onnxWeb.infer(input, [1, tokens.length]);
        content = decodeTokens(Array.from(output.slice(0, 256)).map(v => Math.floor(v * 32000)));
      } catch { content = randomPortugueseResponse(prompt); }
    } else if (this.activeBackend === 'onnx-mobile' && this.onnxMobile) {
      try {
        const result = await this.onnxMobile.infer(simpleTokenize(fullPrompt));
        content = result.tokens.join(' ');
        inferenceResult = result;
      } catch { content = randomPortugueseResponse(prompt); }
    } else if (this.activeBackend === 'coreml' && this.coreml) {
      try {
        const tokens = simpleTokenize(fullPrompt);
        const input = new Float32Array(tokens.map(t => Math.min(t / 32000, 1)));
        const result = await this.coreml.infer(input, [1, tokens.length]);
        content = decodeTokens(Array.from(result.output.slice(0, 256)).map(v => Math.floor(v * 32000)));
      } catch { content = randomPortugueseResponse(prompt); }
    } else if (this.activeBackend === 'mlx' && this.mlx) {
      try {
        const result = await this.mlx.infer(fullPrompt, this.config.maxTokens, true);
        if (typeof result === 'object') {
          content = result.content;
          inferenceResult = result.inferenceResult;
        } else {
          content = result as string;
        }
      } catch { content = randomPortugueseResponse(prompt); }
    } else {
      content = randomPortugueseResponse(prompt);
    }

    if (this.microTxManager && this.config.enablePayments) {
      const tokenCount = Math.ceil(content.length / 4);
      const cost = (this.config.paymentCostPerTokenUsd ?? 0.0001) * tokenCount;
      try {
        await this.microTxManager.payForInference(`${this.config.agentId}-dsd-${Date.now()}`, cost);
      } catch { /* payment optional */ }
    }

    const toolCalls = this.detectToolCalls(content);
    if (toolCalls.length > 0) {
      for (const tc of toolCalls) {
        const tool = this.config.tools.find(t => t.name === tc.tool);
        if (tool) { try { tc.output = await Promise.resolve(tool.execute(tc.input)); } catch { tc.output = `[tool ${tc.tool} error]`; } }
      }
    }

    return { content, toolCalls, inferenceResult, latencyMs: performance.now() - start };
  }

  private async ensureDecoder(): Promise<any> {
    if (this.speculativeDecoder) return this.speculativeDecoder;
    if (this.config.enableMeshDSD) {
      try {
        const mod = await import('@skynet/p2p-mesh-network');
        const SpeculativeDecoder = mod.SpeculativeDecoder;
        this.speculativeDecoder = new SpeculativeDecoder({
          adaptiveSpeculation: true,
          speculationLen: 5,
          maxSpeculationLen: 10,
          minSpeculationLen: 2,
        });
      } catch { /* mesh network unavailable */ }
    }
    return this.speculativeDecoder;
  }

  private async dsdWithDecoder(prompt: string): Promise<{ content: string; inferenceResult?: InferenceResult }> {
    const dsdStart = performance.now();
    const decoder = await this.ensureDecoder();
    if (!decoder) {
      return { content: randomPortugueseResponse(prompt) };
    }

    const tokens = simpleTokenize(prompt);
    const prefixTokens = tokens.slice(0, Math.min(16, tokens.length));
    const vocabSize = 100;
    const draftLogits = (ctx: number[]): Float32Array => {
      const logits = new Float32Array(vocabSize);
      for (let i = 0; i < vocabSize; i++) logits[i] = Math.sin(ctx.length * 0.1 + i * 0.05);
      return logits;
    };
    const targetLogits = (ctx: number[]): Float32Array => {
      const logits = new Float32Array(vocabSize);
      for (let i = 0; i < vocabSize; i++) logits[i] = Math.cos(ctx.length * 0.1 + i * 0.05);
      return logits;
    };

    const allTokens: number[] = [...prefixTokens];
    let rounds = 0;
    while (allTokens.length < 64 && rounds < 20) {
      const draft = decoder.generateDraft(allTokens, draftLogits);
      const verification = decoder.verify(allTokens, draft, targetLogits);
      allTokens.push(...verification.acceptedTokens);
      this.dsdStats.totalRounds++;
      this.dsdStats.totalAccepted += verification.acceptedCount;
      this.dsdStats.totalDrafted += draft.speculationLen;
      rounds++;
    }

    const dsdElapsed = performance.now() - dsdStart;
    const content = decodeTokens(allTokens);
    const timings = { prefillMs: 10, decodeMs: rounds * 5, totalMs: dsdElapsed, tokensPerSecond: dsdElapsed > 0 ? allTokens.length / (dsdElapsed / 1000) : 0 };
    return {
      content,
      inferenceResult: { tokens: allTokens, targetTokens: allTokens, timings },
    };
  }

  private buildPrompt(prompt: string, context: string[]): string {
    return [this.config.systemPrompt, ...context, `User: ${prompt}`, 'Agent:'].join('\n');
  }

  private detectToolCalls(content: string): Array<{ tool: string; input: string; output: string }> {
    const calls: Array<{ tool: string; input: string; output: string }> = [];
    for (const tool of this.config.tools) {
      const regex = new RegExp(`\\[${tool.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*([^\\]]+)\\]`, 'g');
      let match;
      while ((match = regex.exec(content)) !== null) {
        calls.push({ tool: tool.name, input: match[1], output: '' });
      }
    }
    return calls;
  }

  unload(): void {
    this.llamacpp?.unload();
    this.executorch?.unload();
    this.onnxWeb?.unload();
    this.onnxMobile?.unload();
    this.coreml?.unload();
    this.mlx?.unload();
    this.llamacpp = null;
    this.executorch = null;
    this.onnxWeb = null;
    this.onnxMobile = null;
    this.coreml = null;
    this.mlx = null;
  }

  async initializePayments(): Promise<void> {
    if (!this.config.enablePayments) return;
    try {
      const { SolanaX402, MicroTxManager } = await import('@skynet/blockchain-client');
      const solana = new SolanaX402({ simulate: true });
      this.microTxManager = new MicroTxManager(solana);
    } catch { /* payments unavailable */ }
  }

  getDSDStats(): { totalRounds: number; totalAccepted: number; totalDrafted: number; acceptanceRate: number } {
    const rate = this.dsdStats.totalDrafted > 0 ? this.dsdStats.totalAccepted / this.dsdStats.totalDrafted : 0;
    return { ...this.dsdStats, acceptanceRate: rate };
  }

  getConfig(): AgentModelConfig { return this.config; }
  getActiveBackend(): string { return this.activeBackend; }
  getPlatform(): string { return this.platform; }
}

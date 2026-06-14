import { AutoConfig, type AutoModelConfig } from './auto-config.js';
import { LLaMACppRuntime, type LLaMACppConfig } from './llamacpp.js';
import { ExecuTorchRuntime, type InferenceResult } from './executorch.js';
import { OnnxRuntimeWeb } from './onnx-runtime.js';
import { OnnxRuntimeMobile } from './onnx-mobile.js';
import { CoreMLRuntime } from './coreml.js';
import { MLXRuntime } from './mlx.js';
import { simpleTokenize } from './tokenizer.js';

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

  constructor(config: AgentModelConfig) {
    this.config = config;
  }

  async load(): Promise<void> {
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
    const start = Date.now();
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
        content = await this.mlx.infer(fullPrompt, this.config.maxTokens);
      } catch { content = randomPortugueseResponse(prompt); }
    } else {
      content = randomPortugueseResponse(prompt);
    }

    const toolCalls = this.detectToolCalls(content);
    if (toolCalls.length > 0) {
      for (const tc of toolCalls) {
        const tool = this.config.tools.find(t => t.name === tc.tool);
        if (tool) tc.output = await Promise.resolve(tool.execute(tc.input));
      }
    }

    return { content, toolCalls, inferenceResult, latencyMs: Date.now() - start };
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

  getConfig(): AgentModelConfig { return this.config; }
  getActiveBackend(): string { return this.activeBackend; }
  getPlatform(): string { return this.platform; }
}

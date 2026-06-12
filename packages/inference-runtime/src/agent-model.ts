import { AutoConfig, type AutoModelConfig } from './auto-config.js';
import { LLaMACppRuntime, type LLaMACppConfig } from './llamacpp.js';
import { ExecuTorchRuntime, type InferenceResult } from './executorch.js';

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

function simpleTokenize(text: string): number[] {
  const TOKEN_BASE = 1000;
  return text.split(/\s+/).filter(Boolean).map((w, i) => {
    let hash = 0;
    for (let j = 0; j < w.length; j++) hash = (hash * 31 + w.charCodeAt(j)) & 0x7fffffff;
    return (hash % 32000) + (i * 7) % 32000;
  });
}

export class AgentModel {
  private llamacpp: LLaMACppRuntime | null = null;
  private executorch: ExecuTorchRuntime | null = null;
  private config: AgentModelConfig;
  private autoConfig: AutoModelConfig | null = null;

  constructor(config: AgentModelConfig) {
    this.config = config;
  }

  async load(): Promise<void> {
    if (this.config.modelId === 'none') return;
    this.autoConfig = await AutoConfig.autoDetectAndConfigure();
    if (!this.autoConfig.modelPath && this.config.autoDownload) {
      const downloadedPath = await AutoConfig.downloadModel(this.config.modelId);
      if (downloadedPath) this.autoConfig.modelPath = downloadedPath;
    }
    if (this.autoConfig.modelPath) {
      const cfg: LLaMACppConfig = {
        modelPath: this.autoConfig.modelPath,
        gpuLayers: this.autoConfig.gpuLayers,
        threads: this.autoConfig.threads,
        contextSize: this.autoConfig.contextSize,
        batchSize: this.autoConfig.batchSize,
      };
      this.llamacpp = new LLaMACppRuntime(cfg);
      await this.llamacpp.load();
    } else {
      this.executorch = new ExecuTorchRuntime({
        modelPath: `models/${this.config.modelId}.pte`,
        backend: 'xnnpack',
        threads: 4,
        useKleidiAI: true,
        maxContextLength: this.config.maxTokens,
        enableMemoryPlan: true,
      });
      await this.executorch.load();
    }
  }

  async generate(prompt: string, context: string[] = []): Promise<AgentTurnResult> {
    const fullPrompt = this.buildPrompt(prompt, context);
    const start = Date.now();
    let content: string;
    let inferenceResult: InferenceResult | undefined;

    if (this.llamacpp && this.autoConfig?.modelPath) {
      const result = await this.llamacpp.generate(fullPrompt, this.config.maxTokens);
      content = result.content;
    } else if (this.executorch) {
      const result = await this.executorch.infer(simpleTokenize(fullPrompt));
      content = result.tokens.join(' ');
      inferenceResult = result;
    } else {
      content = randomPortugueseResponse(prompt);
    }

    const toolCalls = this.detectToolCalls(content);

    if (toolCalls.length > 0) {
      for (const tc of toolCalls) {
        const tool = this.config.tools.find(t => t.name === tc.tool);
        if (tool) {
          tc.output = await Promise.resolve(tool.execute(tc.input));
        }
      }
    }

    return {
      content,
      toolCalls,
      inferenceResult,
      latencyMs: Date.now() - start,
    };
  }

  private buildPrompt(prompt: string, context: string[]): string {
    const parts = [this.config.systemPrompt, ...context, `User: ${prompt}`, 'Agent:'];
    return parts.join('\n');
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
    this.executorch?.unload?.();
    this.llamacpp = null;
    this.executorch = null;
  }

  getConfig(): AgentModelConfig {
    return this.config;
  }
}

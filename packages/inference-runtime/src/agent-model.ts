import { ExecuTorchRuntime, type ExecuTorchBackend, type InferenceResult } from './executorch.js';

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
  backend?: ExecuTorchBackend;
}

export interface AgentTurnResult {
  content: string;
  toolCalls: Array<{ tool: string; input: string; output: string }>;
  inferenceResult?: InferenceResult;
  latencyMs: number;
}

export class AgentModel {
  private runtime: ExecuTorchRuntime | null = null;
  private config: AgentModelConfig;

  constructor(config: AgentModelConfig) {
    this.config = config;
  }

  async load(): Promise<void> {
    if (this.config.modelId !== 'none') {
      this.runtime = new ExecuTorchRuntime({
        modelPath: `models/${this.config.modelId}.pte`,
        backend: this.config.backend ?? 'xnnpack',
        threads: 4,
        useKleidiAI: true,
        maxContextLength: this.config.maxTokens,
        enableMemoryPlan: true,
      });
      await this.runtime.load();
    }
  }

  async generate(prompt: string, context: string[] = []): Promise<AgentTurnResult> {
    const fullPrompt = this.buildPrompt(prompt, context);
    const start = Date.now();
    let content: string;
    let inferenceResult: InferenceResult | undefined;

    if (this.runtime) {
      const result = await this.runtime.infer(fullPrompt.split('').map(c => c.charCodeAt(0)));
      content = result.tokens.join(' ');
      inferenceResult = result;
    } else {
      content = `[${this.config.agentId}] ${prompt} (simulated, model: ${this.config.modelId})`;
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
      const regex = new RegExp(`\\[${tool.name}:\\s*([^\\]]+)\\]`, 'g');
      let match;
      while ((match = regex.exec(content)) !== null) {
        calls.push({ tool: tool.name, input: match[1], output: '' });
      }
    }
    return calls;
  }

  unload(): void {
    this.runtime?.unload?.();
    this.runtime = null;
  }

  getConfig(): AgentModelConfig {
    return this.config;
  }
}

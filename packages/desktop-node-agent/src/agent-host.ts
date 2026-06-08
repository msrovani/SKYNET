import { AgentRuntime, AgentConfig, AgentInput, AgentOutput, AgentState, AGENT_TEMPLATES, createAgentFromTemplate } from '@skynet/core-wasm-engine';

export interface AgentHostConfig {
  maxAgents: number;
  heartbeatIntervalMs: number;
}

export interface HostedAgent {
  id: string;
  templateName: string;
  runtime: AgentRuntime;
  startedAt: number;
  tasksCompleted: number;
}

export class AgentHost {
  private agents: Map<string, HostedAgent> = new Map();
  private config: AgentHostConfig;
  private tools: Map<string, (input: string) => string> = new Map();

  constructor(config?: Partial<AgentHostConfig>) {
    this.config = {
      maxAgents: config?.maxAgents ?? 5,
      heartbeatIntervalMs: config?.heartbeatIntervalMs ?? 5000,
    };
    this.registerBuiltinTools();
  }

  private registerBuiltinTools(): void {
    this.tools.set('html-renderer', (input: string) => `<div>${input}</div>`);
    this.tools.set('css-generator', (input: string) => `.generated { content: "${input}"; }`);
    this.tools.set('text-generator', (input: string) => `Generated text: ${input}`);
    this.tools.set('markdown-formatter', (input: string) => `# ${input}\n\nFormatted content.`);
    this.tools.set('grammar-checker', (input: string) => input);
    this.tools.set('image-generator', (input: string) => `[image: ${input}]`);
    this.tools.set('upscaler', (input: string) => `[upscaled: ${input}]`);
    this.tools.set('watermark', (input: string) => `[watermarked: ${input}]`);
    this.tools.set('cdn-upload', (input: string) => `https://cdn.skynet.network/${input.replace(/\s+/g, '-').toLowerCase()}`);
  }

  spawnAgent(templateName: string, customId?: string): HostedAgent {
    if (this.agents.size >= this.config.maxAgents) {
      throw new Error(`Max agents (${this.config.maxAgents}) reached`);
    }

    const id = customId ?? `${templateName}-${Date.now()}`;
    const runtime = createAgentFromTemplate(templateName, id);
    runtime.load();

    const hosted: HostedAgent = {
      id,
      templateName,
      runtime,
      startedAt: Date.now(),
      tasksCompleted: 0,
    };

    this.agents.set(id, hosted);
    return hosted;
  }

  executeAgent(agentId: string, input: AgentInput): AgentOutput | null {
    const hosted = this.agents.get(agentId);
    if (!hosted) return null;

    if (hosted.runtime.state === 'completed') {
      hosted.runtime.reset();
      hosted.runtime.load();
    }

    try {
      const output = hosted.runtime.execute(input);
      hosted.tasksCompleted++;
      return output;
    } catch {
      return null;
    }
  }

  executeTool(toolName: string, input: string): string {
    const tool = this.tools.get(toolName);
    if (!tool) return `[tool:${toolName} not available]`;
    return tool(input);
  }

  stopAgent(agentId: string): boolean {
    const hosted = this.agents.get(agentId);
    if (!hosted) return false;
    hosted.runtime.reset();
    this.agents.delete(agentId);
    return true;
  }

  getAgent(agentId: string): HostedAgent | undefined {
    return this.agents.get(agentId);
  }

  listAgents(): HostedAgent[] {
    return Array.from(this.agents.values());
  }

  agentCount(): number {
    return this.agents.size;
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  getStatus(): { agentCount: number; toolsAvailable: number; templates: string[] } {
    return {
      agentCount: this.agentCount(),
      toolsAvailable: this.tools.size,
      templates: Object.keys(AGENT_TEMPLATES),
    };
  }

  stopAll(): void {
    for (const [id] of this.agents) {
      this.stopAgent(id);
    }
  }
}

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AgentRuntime,
  createAgentFromTemplate,
  AGENT_TEMPLATES,
} from '../index.js';
import type { AgentInput } from '../index.js';

describe('AgentRuntime', () => {
  let agent: AgentRuntime;

  beforeEach(() => {
    agent = new AgentRuntime({
      agentId: 'test-agent-1',
      modelId: 'test-model',
      systemPrompt: 'You are a test agent.',
      tools: ['html-renderer', 'text-generator'],
      maxTokens: 1024,
      temperature: 0.7,
    });
  });

  it('starts in idle state', () => {
    expect(agent.state).toBe('idle');
  });

  it('transitions to ready after load', () => {
    agent.load();
    expect(agent.state).toBe('ready');
  });

  it('produces output on execute', () => {
    agent.load();
    const input: AgentInput = { prompt: 'create a landing page', context: [] };
    const output = agent.execute(input);
    expect(output.agentId).toBe('test-agent-1');
    expect(output.content).toContain('create a landing page');
    expect(output.confidence).toBeGreaterThan(0);
    expect(output.tokensGenerated).toBeGreaterThan(0);
    expect(output.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('transitions to completed after execute', () => {
    agent.load();
    agent.execute({ prompt: 'test', context: [] });
    expect(agent.state).toBe('completed');
  });

  it('throws if executed before load', () => {
    expect(() => agent.execute({ prompt: 'test', context: [] })).toThrow('Agent not ready');
  });

  it('resets to idle', () => {
    agent.load();
    agent.execute({ prompt: 'test', context: [] });
    agent.reset();
    expect(agent.state).toBe('idle');
  });

  it('stores config correctly', () => {
    expect(agent.agentConfig.agentId).toBe('test-agent-1');
    expect(agent.agentConfig.tools).toEqual(['html-renderer', 'text-generator']);
    expect(agent.agentConfig.temperature).toBe(0.7);
  });
});

describe('createAgentFromTemplate', () => {
  it('creates webdesign agent from template', () => {
    const agent = createAgentFromTemplate('webdesign', 'web-1');
    expect(agent.agentConfig.modelId).toBe('qwen-2.5-7b-int4');
    expect(agent.agentConfig.tools).toContain('html-renderer');
    expect(agent.agentConfig.tools).toContain('css-generator');
  });

  it('creates content-writer agent from template', () => {
    const agent = createAgentFromTemplate('content-writer', 'content-1');
    expect(agent.agentConfig.modelId).toBe('llama-3.2-3b');
    expect(agent.agentConfig.tools).toContain('text-generator');
  });

  it('creates image-optimizer agent from template', () => {
    const agent = createAgentFromTemplate('image-optimizer', 'img-1');
    expect(agent.agentConfig.modelId).toBe('flux-1-dev');
    expect(agent.agentConfig.tools).toContain('image-generator');
  });

  it('throws for unknown template', () => {
    expect(() => createAgentFromTemplate('unknown', 'x')).toThrow('Unknown template');
  });

  it('all templates are valid', () => {
    for (const name of Object.keys(AGENT_TEMPLATES)) {
      const agent = createAgentFromTemplate(name, `${name}-test`);
      expect(agent).toBeInstanceOf(AgentRuntime);
    }
  });
});

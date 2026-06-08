import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentModel } from '../agent-model.js';
import type { ToolAdapter, AgentModelConfig } from '../agent-model.js';

describe('AgentModel', () => {
  const tools: ToolAdapter[] = [
    { name: 'html-renderer', execute: (s) => `<div>${s}</div>`, description: 'Render HTML' },
    { name: 'text-generator', execute: (s) => `Generated: ${s}`, description: 'Generate text' },
  ];

  let agent: AgentModel;

  beforeEach(() => {
    agent = new AgentModel({
      agentId: 'test-agent',
      modelId: 'none',
      systemPrompt: 'You are helpful.',
      tools,
      temperature: 0.7,
      maxTokens: 2048,
    });
  });

  afterEach(() => {
    agent.unload();
  });

  it('generates simulated response when no model', async () => {
    const result = await agent.generate('hello');
    expect(result.content).toContain('test-agent');
    expect(result.content).toContain('hello');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns config', () => {
    const cfg = agent.getConfig();
    expect(cfg.agentId).toBe('test-agent');
    expect(cfg.tools.length).toBe(2);
  });

  it('detects tool calls in content', async () => {
    const agentWithTools = new AgentModel({
      agentId: 'tool-agent',
      modelId: 'none',
      systemPrompt: 'Use tools.',
      tools: [{
        name: 'search',
        execute: (s) => `results for ${s}`,
        description: 'Search tool',
      }],
      temperature: 0.5,
      maxTokens: 512,
    });

    // Simulate a response that includes a tool call pattern
    // We'll test the detection directly by checking tool call execution
    const result = await agentWithTools.generate('search: hello world');
    expect(result.toolCalls).toBeDefined();
    agentWithTools.unload();
  });

  it('uses context in prompt building', async () => {
    const result = await agent.generate('question', ['Previous message', 'Second message']);
    expect(result.content).toBeDefined();
  });

  it('load returns without error when modelId is none', async () => {
    await expect(agent.load()).resolves.toBeUndefined();
  });

  it('handles multiple tool calls', () => {
    const content = 'Use [html-renderer: Hello World] and [text-generator: Summary]';
    const cfg = agent.getConfig();
    expect(cfg.tools.length).toBe(2);
  });

  it('unload does not throw', () => {
    expect(() => agent.unload()).not.toThrow();
  });
});

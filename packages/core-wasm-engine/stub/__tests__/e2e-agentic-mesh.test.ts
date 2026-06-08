import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentRuntime, createAgentFromTemplate, AGENT_TEMPLATES } from '../index.js';

describe('Agentic Mesh — E2E Flow', () => {
  let agent: AgentRuntime;

  beforeEach(() => {
    agent = createAgentFromTemplate('webdesign', 'e2e-web-agent');
  });

  afterEach(() => {
    agent.reset();
  });

  it('full lifecycle: load → execute → complete → reset', () => {
    agent.load();
    expect(agent.state).toBe('ready');

    const output = agent.execute({
      prompt: 'Create a responsive landing page with hero section',
      context: ['Dark theme, green accents'],
    });

    expect(output.agentId).toBe('e2e-web-agent');
    expect(output.content).toContain('Create a responsive landing page');
    expect(output.content).toContain('html-renderer');
    expect(output.content).toContain('css-generator');
    expect(output.confidence).toBeGreaterThan(0);
    expect(output.tokensGenerated).toBeGreaterThan(0);
    expect(agent.state).toBe('completed');

    agent.reset();
    expect(agent.state).toBe('idle');
  });

  it('multiple agents from different templates', () => {
    const webAgent = createAgentFromTemplate('webdesign', 'web-1');
    const writerAgent = createAgentFromTemplate('content-writer', 'writer-1');
    const imgAgent = createAgentFromTemplate('image-optimizer', 'img-1');

    webAgent.load();
    writerAgent.load();
    imgAgent.load();

    const webOutput = webAgent.execute({ prompt: 'build landing', context: [] });
    const writerOutput = writerAgent.execute({ prompt: 'write blog post', context: [] });
    const imgOutput = imgAgent.execute({ prompt: 'generate hero image', context: [] });

    expect(webOutput.content).toContain('html-renderer');
    expect(writerOutput.content).toContain('text-generator');
    expect(imgOutput.content).toContain('image-generator');

    expect(webOutput.agentId).toBe('web-1');
    expect(writerOutput.agentId).toBe('writer-1');
    expect(imgOutput.agentId).toBe('img-1');

    webAgent.reset();
    writerAgent.reset();
    imgAgent.reset();
  });

  it('all templates can be instantiated', () => {
    for (const name of Object.keys(AGENT_TEMPLATES)) {
      const a = createAgentFromTemplate(name, `test-${name}`);
      a.load();
      const out = a.execute({ prompt: 'test', context: [] });
      expect(out.content).toBeTruthy();
      a.reset();
    }
  });

  it('agent output includes latency and confidence', () => {
    agent.load();
    const out = agent.execute({ prompt: 'test', context: [] });
    expect(out.latencyMs).toBeGreaterThanOrEqual(0);
    expect(out.confidence).toBe(0.85);
    expect(out.tokensGenerated).toBe(10);
  });

  it('agent preserves config across lifecycle', () => {
    expect(agent.agentConfig.agentId).toBe('e2e-web-agent');
    agent.load();
    expect(agent.agentConfig.modelId).toBe('qwen-2.5-7b-int4');
    agent.execute({ prompt: 'test', context: [] });
    expect(agent.agentConfig.tools).toEqual(['html-renderer', 'css-generator', 'cdn-upload']);
    agent.reset();
    expect(agent.agentConfig.systemPrompt).toContain('webdesign expert');
  });
});

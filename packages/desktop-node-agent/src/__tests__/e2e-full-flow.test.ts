import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentHost } from '../agent-host.js';

describe('E2E: AgentHost + SemanticRouter', () => {
  beforeEach(() => vi.stubGlobal('WebTransport', undefined));
  afterEach(() => vi.unstubAllGlobals());

  it('spawns agents and routes tasks via semantic matching', async () => {
    const { SemanticRouter, embedText } = await import('@skynet/p2p-mesh-network');

    const host = new AgentHost({ maxAgents: 5 });
    const router = new SemanticRouter(64);

    const agent = await host.spawnAgent('webdesign', 'e2e-web-1');
    expect(agent.templateName).toBe('webdesign');

    router.registerAgent({
      agentId: agent.id,
      nodeId: 'e2e-node',
      modelId: 'qwen-2.5-7b-int4',
      tools: ['html-renderer', 'css-generator'],
      systemPrompt: 'Web design expert',
      capabilityEmbedding: embedText('html css responsive web design', 64),
      costPerTask: 0.002,
      maxConcurrent: 2,
      avgLatencyMs: 150,
      domain: 'webdesign',
    });

    const output = await host.executeAgent('e2e-web-1', { prompt: 'Build a landing page', context: ['dark theme'] });
    expect(output).not.toBeNull();
    expect(output!.content).toContain('Build a landing page');
    expect(output!.confidence).toBeGreaterThan(0);

    const subtask = {
      id: 'st-e2e-1',
      description: 'Create responsive HTML with CSS',
      domain: 'webdesign',
      requiredTools: ['html-renderer'],
      dependsOn: [],
    };
    const match = router.routeSubtask(subtask);
    expect(match).not.toBeNull();
    expect(match!.agent.agentId).toBe('e2e-web-1');

    host.stopAll();
  });

  it('supports multi-agent concurrent execution', async () => {
    const host = new AgentHost({ maxAgents: 10 });
    await host.spawnAgent('webdesign', 'multi-web');
    await host.spawnAgent('content-writer', 'multi-writer');

    const webResult = await host.executeAgent('multi-web', { prompt: 'Build site', context: [] });
    const writerResult = await host.executeAgent('multi-writer', { prompt: 'Write article', context: [] });

    expect(webResult!.agentId).toBe('multi-web');
    expect(writerResult!.agentId).toBe('multi-writer');
    expect(webResult!.content).toContain('html-renderer');
    expect(writerResult!.content).toContain('text-generator');

    host.stopAll();
  });

  it('enforces max agent limit', async () => {
    const host = new AgentHost({ maxAgents: 2 });
    await host.spawnAgent('webdesign', 'a1');
    await host.spawnAgent('content-writer', 'a2');
    await expect(host.spawnAgent('webdesign', 'a3')).rejects.toThrow('Max agents');
    host.stopAll();
  });
});

describe('E2E: TEE Attestation', () => {
  it('detects TEE capabilities and executes secure operation', async () => {
    const { TeeBridge } = await import('@skynet/tee-attestation-layer');

    const bridge = new TeeBridge({ fallbackToSimulation: true });
    const caps = await bridge.detect();
    expect(caps).toHaveProperty('available');
    expect(caps).toHaveProperty('type');

    const data = new TextEncoder().encode('sensitive inference data');
    const result = await bridge.executeSecure(data, (input) => {
      const out = new Uint8Array(input.length);
      for (let i = 0; i < input.length; i++) out[i] = input[i] ^ 0xFF;
      return out;
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });
});

describe('E2E: Inference + Model Loading', () => {
  it('estimates memory and configures pipeline', async () => {
    const { estimateMemory } = await import('@skynet/inference-runtime');
    const { ModelLoader } = await import('@skynet/inference-runtime');

    const mem = estimateMemory(1_000_000_000, 'int4');
    expect(mem).toBeGreaterThan(0);
    expect(mem).toBeLessThan(1000);

    const loader = new ModelLoader();
    expect(loader.getCachedIds()).toEqual([]);

    const metadata = loader.getMetadata({
      id: 'test-model',
      name: 'Test',
      provider: 'executorch',
      quantization: 'int4',
      contextLength: 2048,
      modelUrl: 'https://example.com/model.pte',
      parameterCount: 1_000_000_000,
    });
    expect(metadata.parameterCount).toBe(1_000_000_000);
    expect(metadata.memoryRequiredMb).toBeGreaterThan(0);
  });
});

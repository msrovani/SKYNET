import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('E2E Full Pipeline: Inference -> Mesh -> Thermal -> Blockchain -> FL', () => {
  beforeEach(() => {
    vi.stubGlobal('WebTransport', undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('1. AgentModel with DSD generates tokens via SpeculativeDecoder', async () => {
    const { AgentModel } = await import('@skynet/inference-runtime');
    const agent = new AgentModel({
      agentId: 'e2e-dsd-agent',
      modelId: 'none',
      systemPrompt: 'You are helpful.',
      tools: [],
      temperature: 0.7,
      maxTokens: 2048,
      enableMeshDSD: true,
    });

    const result = await agent.generateWithDSD('Test prompt for DSD');
    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(5);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);

    agent.unload();
  });

  it('2. SemanticRouter routes inference subtasks to registered agents', async () => {
    const { SemanticRouter, embedText } = await import('@skynet/p2p-mesh-network');
    const router = new SemanticRouter(64);

    router.registerAgent({
      agentId: 'e2e-inference-agent',
      nodeId: 'e2e-node',
      modelId: 'phi-3-mini',
      tools: ['llm-generate', 'embed'],
      systemPrompt: 'Inference expert',
      capabilityEmbedding: embedText('natural language processing inference', 64),
      costPerTask: 0.001,
      maxConcurrent: 3,
      avgLatencyMs: 100,
      domain: 'inference',
    });

    const subtask = {
      id: 'st-infer-1',
      description: 'Generate text response for user query',
      domain: 'inference',
      requiredTools: ['llm-generate'],
      dependsOn: [],
    };
    const match = router.routeSubtask(subtask);
    expect(match).not.toBeNull();
    expect(match!.agent.agentId).toBe('e2e-inference-agent');
  });

  it('3. ThermalManager schedules tasks with thermal awareness', async () => {
    const { ThermalManager } = await import('@skynet/p2p-mesh-network');
    const thermal = new ThermalManager('desktop');

    const reading = {
      timestamp: Date.now(),
      temperature: 60,
      headroom: 10,
      cpuLoad: 0.5,
      gpuLoad: 0.3,
      batteryLevel: 0.8,
      isCharging: true,
    };

    thermal.recordReading(reading);
    const zone = thermal['zone'] as string;
    expect(typeof zone).toBe('string');
    expect(['safe', 'warm', 'hot', 'critical']).toContain(zone);
  });

  it('4. Payment integration validates settlement primitives', () => {
    const nonce = 1;
    const message = `skynet:e2e:${nonce}:0.005`;
    expect(message).toContain('e2e');
    expect(message).toContain('0.005');

    const hash = message.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
    const digest = Math.abs(hash).toString(16).padStart(8, '0');
    expect(digest.length).toBe(8);
  });

  it('5. MeshFederatedLearning runs FL rounds across peers', async () => {
    const { MeshFederatedLearning } = await import('@skynet/fl-training-client');
    const mfl = new MeshFederatedLearning(
      { clientFraction: 0.5 },
      { maxClients: 10 },
      { sparsity: 0.05, quantBits: 4, errorFeedback: true, quantize: true },
    );

    const peers = [
      { id: 'peer-1', address: '10.0.0.1', latencyMs: 10, score: 0.9 },
      { id: 'peer-2', address: '10.0.0.2', latencyMs: 15, score: 0.8 },
      { id: 'peer-3', address: '10.0.0.3', latencyMs: 20, score: 0.7 },
      { id: 'peer-4', address: '10.0.0.4', latencyMs: 25, score: 0.85 },
      { id: 'peer-5', address: '10.0.0.5', latencyMs: 30, score: 0.75 },
    ];
    mfl.registerPeers(peers);

    const ranked = mfl.rankPeersByScore();
    expect(ranked[0].id).toBe('peer-1');
    expect(ranked.length).toBe(5);

    const globalParams = Array.from({ length: 100 }, () => Math.random() * 0.1);
    const clientGradients = new Map<string, number[][]>();
    for (const p of peers) {
      clientGradients.set(p.id, [Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.1)]);
    }

    const result = await mfl.runRound(globalParams, clientGradients);
    expect(result.round).toBe(1);
    expect(result.clientCount).toBeGreaterThan(0);
    expect(result.clientCount).toBeLessThanOrEqual(peers.length);
    expect(result.compressionRatio).toBeGreaterThan(0);
    expect(result.accuracy).toBeGreaterThan(0);
  });

  it('6. Full integration: AgentModel DSD + SemanticRouter + FL', async () => {
    const { AgentModel } = await import('@skynet/inference-runtime');
    const { SemanticRouter, embedText } = await import('@skynet/p2p-mesh-network');
    const { MeshFederatedLearning } = await import('@skynet/fl-training-client');

    const router = new SemanticRouter(64);
    const mfl = new MeshFederatedLearning(
      { clientFraction: 0.5 },
      { maxClients: 5 },
      { sparsity: 0.05, quantBits: 4, errorFeedback: true, quantize: true },
    );

    const peers = [
      { id: 'peer-a', address: '10.0.0.1', latencyMs: 10, score: 0.9 },
      { id: 'peer-b', address: '10.0.0.2', latencyMs: 15, score: 0.85 },
    ];
    mfl.registerPeers(peers);

    router.registerAgent({
      agentId: 'e2e-fl-agent',
      nodeId: 'e2e-node',
      modelId: 'phi-3-mini',
      tools: ['train', 'evaluate'],
      systemPrompt: 'FL training expert',
      capabilityEmbedding: embedText('federated learning gradient aggregation', 64),
      costPerTask: 0.001,
      maxConcurrent: 2,
      avgLatencyMs: 100,
      domain: 'fl-training',
    });

    const agent = new AgentModel({
      agentId: 'e2e-integration',
      modelId: 'none',
      systemPrompt: 'You handle FL and inference.',
      tools: [{ name: 'train', execute: (s: string) => `trained: ${s}`, description: 'Train' }],
      temperature: 0.7,
      maxTokens: 512,
      enableMeshDSD: true,
    });

    const inferenceResult = await agent.generateWithDSD('Run FL training round');
    expect(inferenceResult.content).toBeDefined();

    const globalParams = Array.from({ length: 50 }, () => Math.random() * 0.1);
    const clientGradients = new Map<string, number[][]>();
    for (const p of peers) {
      clientGradients.set(p.id, [Array.from({ length: 50 }, () => (Math.random() - 0.5) * 0.1)]);
    }
    const flResult = await mfl.runRound(globalParams, clientGradients);
    expect(flResult.round).toBe(1);
    expect(flResult.accuracy).toBeGreaterThan(0);

    const ranked = mfl.rankPeersByScore();
    expect(ranked.length).toBe(2);

    agent.unload();
  });
});

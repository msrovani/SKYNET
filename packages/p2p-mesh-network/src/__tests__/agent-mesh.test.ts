import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SemanticRouter, HnswIndex } from '../semantic-router.js';
import { AgentMeshManager } from '../agent-mesh.js';
import { embedText, cosineSimilarity } from '../capability.js';
import type { AgentRegistration, SubTask } from '../semantic-router.js';

describe('HnswIndex', () => {
  it('adds and searches vectors', () => {
    const idx = new HnswIndex();
    const v1 = embedText('webdesign html css javascript', 64);
    const v2 = embedText('content writer blog copywriting', 64);
    const v3 = embedText('image generation stable-diffusion', 64);

    idx.add('webdesign', v1);
    idx.add('content', v2);
    idx.add('image-gen', v3);

    const query = embedText('webdesign html css javascript', 64);
    const results = idx.search(query, 2);
    expect(results).toContain('webdesign');
    expect(results.length).toBe(2);
  });

  it('returns empty for empty index', () => {
    const idx = new HnswIndex();
    expect(idx.search(embedText('test', 64), 5)).toEqual([]);
  });

  it('removes vectors', () => {
    const idx = new HnswIndex();
    idx.add('a', embedText('web design', 64));
    idx.add('b', embedText('content writing', 64));
    expect(idx.size()).toBe(2);
    idx.remove('a');
    expect(idx.size()).toBe(1);
    const results = idx.search(embedText('web design', 64), 5);
    expect(results).not.toContain('a');
  });

  it('clears all vectors', () => {
    const idx = new HnswIndex();
    idx.add('a', embedText('test', 64));
    idx.add('b', embedText('test2', 64));
    idx.clear();
    expect(idx.size()).toBe(0);
    expect(idx.search(embedText('test', 64), 5)).toEqual([]);
  });

  it('handles single element search', () => {
    const idx = new HnswIndex();
    idx.add('only', embedText('the only agent', 64));
    const results = idx.search(embedText('query', 64), 5);
    expect(results).toEqual(['only']);
  });
});

describe('SemanticRouter', () => {
  let router: SemanticRouter;
  const webAgent: AgentRegistration = {
    agentId: 'web-1',
    nodeId: 'node-pc-1',
    modelId: 'qwen-2.5-7b-int4',
    tools: ['html-renderer', 'css-generator', 'cdn-upload'],
    systemPrompt: 'You are a webdesign expert. Create beautiful responsive websites.',
    capabilityEmbedding: embedText('webdesign html css javascript responsive frontend', 64),
    costPerTask: 0.002,
    maxConcurrent: 2,
    avgLatencyMs: 150,
    domain: 'webdesign',
  };

  const contentAgent: AgentRegistration = {
    agentId: 'content-1',
    nodeId: 'node-mob-1',
    modelId: 'llama-3.2-3b',
    tools: ['text-generator', 'markdown-formatter', 'grammar-checker'],
    systemPrompt: 'You are a content writer. Write engaging blog posts and articles.',
    capabilityEmbedding: embedText('content writing blog copywriting text', 64),
    costPerTask: 0.001,
    maxConcurrent: 3,
    avgLatencyMs: 80,
    domain: 'content',
  };

  const imageAgent: AgentRegistration = {
    agentId: 'image-1',
    nodeId: 'node-pc-2',
    modelId: 'flux-1-dev',
    tools: ['image-generator', 'upscaler', 'watermark'],
    systemPrompt: 'You are an image generation specialist.',
    capabilityEmbedding: embedText('image generation stable-diffusion flux art', 64),
    costPerTask: 0.005,
    maxConcurrent: 1,
    avgLatencyMs: 300,
    domain: 'image',
  };

  beforeEach(() => {
    router = new SemanticRouter(64);
    router.registerAgent(webAgent);
    router.registerAgent(contentAgent);
    router.registerAgent(imageAgent);
  });

  afterEach(() => {
    router.clear();
  });

  it('registers and lists agents', () => {
    expect(router.agentCount()).toBe(3);
    const agents = router.listAgents();
    expect(agents.map(a => a.agentId)).toContain('web-1');
    expect(agents.map(a => a.agentId)).toContain('content-1');
    expect(agents.map(a => a.agentId)).toContain('image-1');
  });

  it('routes a webdesign subtask to the web agent', () => {
    const subtask: SubTask = {
      id: 'st-1',
      description: 'Create a landing page for a bakery',
      domain: 'webdesign',
      requiredTools: ['html-renderer', 'css-generator'],
      dependsOn: [],
    };
    const match = router.routeSubtask(subtask);
    expect(match).not.toBeNull();
    expect(match!.agent.agentId).toBe('web-1');
    expect(match!.combinedScore).toBeGreaterThan(0.3);
  });

  it('routes a content subtask to the content agent', () => {
    const subtask: SubTask = {
      id: 'st-2',
      description: 'Write a blog post about AI',
      domain: 'content',
      requiredTools: ['text-generator'],
      dependsOn: [],
    };
    const match = router.routeSubtask(subtask);
    expect(match).not.toBeNull();
    expect(match!.agent.agentId).toBe('content-1');
  });

  it('routes an image subtask to the image agent', () => {
    const subtask: SubTask = {
      id: 'st-3',
      description: 'Generate a product photo',
      domain: 'image',
      requiredTools: ['image-generator'],
      dependsOn: [],
    };
    const match = router.routeSubtask(subtask);
    expect(match).not.toBeNull();
    expect(match!.agent.agentId).toBe('image-1');
  });

  it('returns top-K matches', () => {
    const subtask: SubTask = {
      id: 'st-4',
      description: 'Design a website with text content',
      domain: 'webdesign',
      requiredTools: [],
      dependsOn: [],
    };
    const topK = router.routeTopK(subtask, 2);
    expect(topK.length).toBe(2);
    expect(topK[0].agent.domain).toBe('webdesign');
  });

  it('returns null when no agents match', () => {
    const emptyRouter = new SemanticRouter(64);
    const subtask: SubTask = {
      id: 'st-5',
      description: 'Any task',
      domain: 'unknown',
      requiredTools: [],
      dependsOn: [],
    };
    expect(emptyRouter.routeSubtask(subtask)).toBeNull();
  });

  it('fires event on registration', () => {
    const handler = vi.fn();
    router.onEvent(handler);
    router.registerAgent({
      agentId: 'new-agent',
      nodeId: 'node-3',
      modelId: 'test-model',
      tools: [],
      systemPrompt: 'Test',
      capabilityEmbedding: embedText('test', 64),
      costPerTask: 0.001,
      maxConcurrent: 1,
      avgLatencyMs: 50,
      domain: 'test',
    });
    expect(handler).toHaveBeenCalledWith('agent_registered', expect.objectContaining({ agentId: 'new-agent' }));
  });

  it('unregisters agents', () => {
    router.unregisterAgent('web-1');
    expect(router.agentCount()).toBe(2);
    expect(router.getAgent('web-1')).toBeUndefined();
  });

  it('handles tool matching in score', () => {
    const subtask: SubTask = {
      id: 'st-6',
      description: 'Generate and upscale an image',
      domain: 'image',
      requiredTools: ['image-generator', 'upscaler'],
      dependsOn: [],
    };
    const match = router.routeSubtask(subtask);
    expect(match).not.toBeNull();
    expect(match!.agent.agentId).toBe('image-1');
  });

  it('emits route_found event on match', () => {
    const handler = vi.fn();
    router.onEvent(handler);
    const subtask: SubTask = {
      id: 'st-7',
      description: 'web design task',
      domain: 'webdesign',
      requiredTools: ['html-renderer'],
      dependsOn: [],
    };
    router.routeSubtask(subtask);
    expect(handler).toHaveBeenCalledWith('route_found', expect.objectContaining({ subtaskId: 'st-7' }));
  });

  it('emits route_failed when no agents registered', () => {
    const emptyRouter = new SemanticRouter(64);
    const handler = vi.fn();
    emptyRouter.onEvent(handler);
    const subtask: SubTask = {
      id: 'st-8',
      description: 'any',
      domain: 'any',
      requiredTools: [],
      dependsOn: [],
    };
    emptyRouter.routeSubtask(subtask);
    expect(handler).toHaveBeenCalledWith('route_failed', expect.objectContaining({ subtaskId: 'st-8' }));
  });
});

describe('AgentMeshManager', () => {
  let router: SemanticRouter;
  let manager: AgentMeshManager;

  beforeEach(() => {
    router = new SemanticRouter(64);
    manager = new AgentMeshManager('local-node-1', router);
  });

  afterEach(() => {
    manager.clear();
  });

  it('registers local agents', () => {
    const reg = manager.registerLocalAgent(
      'qwen-2.5-7b-int4',
      ['html-renderer', 'css-generator'],
      'You are a webdesign expert.',
      'webdesign',
    );
    expect(reg.agentId).toBe('local-node-1/webdesign/qwen-2.5-7b-int4');
    expect(reg.nodeId).toBe('local-node-1');
    expect(manager.agentCount()).toBe(1);
  });

  it('registers remote agents', () => {
    const reg: AgentRegistration = {
      agentId: 'remote-agent-1',
      nodeId: 'remote-node-1',
      modelId: 'llama-3.2-3b',
      tools: ['text-generator'],
      systemPrompt: 'Content writer',
      capabilityEmbedding: embedText('content writing', 64),
      costPerTask: 0.001,
      maxConcurrent: 1,
      avgLatencyMs: 80,
      domain: 'content',
    };
    manager.registerRemoteAgent(reg);
    expect(manager.agentCount()).toBe(1);
  });

  it('routes subtasks through the router', () => {
    manager.registerLocalAgent(
      'qwen-2.5-7b-int4',
      ['html-renderer', 'css-generator'],
      'You are a webdesign expert.',
      'webdesign',
    );
    const result = manager.routeSubtask({
      id: 'st-1',
      description: 'Create a landing page',
      domain: 'webdesign',
      requiredTools: ['html-renderer'],
      dependsOn: [],
    });
    expect(result).not.toBeNull();
    expect(result!.nodeId).toBe('local-node-1');
  });

  it('returns null when no agent can route', () => {
    const result = manager.routeSubtask({
      id: 'st-2',
      description: 'Complex task',
      domain: 'unknown',
      requiredTools: [],
      dependsOn: [],
    });
    expect(result).toBeNull();
  });

  it('processes heartbeats', () => {
    manager.registerLocalAgent('test-model', [], 'test', 'test');
    manager.startMonitoring();

    const hb = manager.createHeartbeat('local-node-1/test/test-model');
    expect(hb).not.toBeNull();
    expect(hb!.agentId).toBe('local-node-1/test/test-model');
    expect(hb!.status).toBe('idle');

    manager.receiveHeartbeat(hb!);
    const health = manager.getAgentHealth('local-node-1/test/test-model');
    expect(health).not.toBeNull();
    expect(health!.status).toBe('healthy');

    manager.stopMonitoring();
  });

  it('detects agent degradation on missed heartbeats', () => {
    vi.useFakeTimers();
    manager.registerLocalAgent('test-model', [], 'test', 'test');
    manager.startMonitoring();

    const hb = manager.createHeartbeat('local-node-1/test/test-model')!;
    hb.timestamp = Date.now() - 20_000;
    manager.receiveHeartbeat(hb);

    vi.advanceTimersByTime(6_000);

    const health = manager.getAgentHealth('local-node-1/test/test-model');
    expect(health).not.toBeNull();
    expect(health!.missedHeartbeats).toBeGreaterThan(0);

    vi.useRealTimers();
    manager.stopMonitoring();
  });

  it('unregisters agents', () => {
    manager.registerLocalAgent('test-model', [], 'test', 'test');
    expect(manager.agentCount()).toBe(1);
    manager.unregisterAgent('local-node-1/test/test-model');
    expect(manager.agentCount()).toBe(0);
  });

  it('lists only healthy agents', () => {
    manager.registerLocalAgent('agent-1', [], 'test', 'webdesign');
    manager.registerLocalAgent('agent-2', [], 'test', 'content');
    expect(manager.listHealthyAgents().length).toBe(2);
  });

  it('fires events on mesh connect/disconnect', () => {
    const handler = vi.fn();
    manager.onEvent(handler);
    manager.startMonitoring();
    expect(handler).toHaveBeenCalledWith('mesh_connected', expect.any(Object));
    manager.stopMonitoring();
    expect(handler).toHaveBeenCalledWith('mesh_disconnected', expect.any(Object));
  });
});

describe('embedText and cosineSimilarity', () => {
  it('produces normalized vectors', () => {
    const vec = embedText('test text', 64);
    expect(vec.length).toBe(64);
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('identical text has similarity 1', () => {
    const a = embedText('same text here', 64);
    const b = embedText('same text here', 64);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
  });

  it('different text has lower similarity', () => {
    const a = embedText('aaaa bbbb cccc', 64);
    const same = embedText('aaaa bbbb cccc', 64);
    const diff = embedText('xxxx yyyy zzzz', 64);
    expect(cosineSimilarity(a, same)).toBeGreaterThan(cosineSimilarity(a, diff));
  });

  it('identical vectors have similarity 1', () => {
    const a = embedText('hello world', 64);
    const b = embedText('hello world', 64);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
  });

  it('orthogonal vectors have similarity ~0', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });
});

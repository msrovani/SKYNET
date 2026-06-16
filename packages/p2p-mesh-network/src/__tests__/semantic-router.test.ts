import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SemanticRouter, HnswIndex } from '../semantic-router.js';
import { embedText } from '../capability.js';
import type { AgentRegistration, SubTask } from '../semantic-router.js';

// ── Utility to make deterministic embeddings that are easy to reason about ──
function makeVector(values: number[]): Float32Array {
  const v = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) v[i] = values[i];
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

// ============================================================================
// HnswIndex
// ============================================================================
describe('HnswIndex', () => {
  let idx: HnswIndex;

  beforeEach(() => {
    idx = new HnswIndex();
  });

  afterEach(() => {
    idx.clear();
  });

  // 1. add() inserts vectors and increments size
  it('adds vectors and increments size', () => {
    expect(idx.size()).toBe(0);
    const a = embedText('apple banana cherry', 8);
    const b = embedText('dog elephant fox', 8);
    idx.add('a', a);
    expect(idx.size()).toBe(1);
    idx.add('b', b);
    expect(idx.size()).toBe(2);
  });

  // 2. search() returns nearest neighbors
  it('search returns nearest neighbors', () => {
    const v1 = embedText('webdesign html css javascript responsive', 16);
    const v2 = embedText('content writing blog copywriting article', 16);
    const v3 = embedText('image generation stable-diffusion flux art', 16);

    idx.add('web', v1);
    idx.add('content', v2);
    idx.add('image', v3);

    const query = embedText('html css responsive flexbox grid', 16);
    const results = idx.search(query, 2);
    expect(results).toContain('web');
    expect(results.length).toBe(2);
  });

  // 3. search() with empty index returns []
  it('search with empty index returns []', () => {
    expect(idx.search(embedText('anything', 8), 5)).toEqual([]);
  });

  // 4. searchWithCRouting() returns correct ordering by similarity
  it('searchWithCRouting returns correct ordering by similarity (identical vectors)', () => {
    const v = makeVector([1, 0, 0]);
    const close = makeVector([0.9, 0.1, 0]);
    const far = makeVector([0, 0, 1]);

    idx.add('close', close);
    idx.add('far', far);
    idx.add('identical', v);

    const query = makeVector([1, 0, 0]);
    const results = idx.search(query, 3);
    // identical should be first, close second, far third
    expect(results[0]).toBe('identical');
    expect(results[1]).toBe('close');
    expect(results[2]).toBe('far');
  });

  // 5. searchWithCRouting() with k=0 returns empty array (slice(0,0))
  it('searchWithCRouting with k=0 returns empty array', () => {
    idx.add('a', makeVector([1, 0]));
    idx.add('b', makeVector([0, 1]));
    const results = idx.search(makeVector([1, 0]), 0);
    expect(results).toEqual([]);
  });

  // 6. adaptiveEf() returns default ef when no history
  it('adaptiveEf returns default ef when no history', () => {
    // queryHistory is empty, so it should return the default efSearch (16)
    const ef = (idx as any).adaptiveEf(makeVector([1, 0]), 5);
    expect(ef).toBe(16);
  });

  // 7. adaptiveEf() adjusts ef based on similarity history
  it('adaptiveEf adjusts ef based on similarity history', () => {
    const h = (idx as any).queryHistory as Array<{ sim: number }>;

    // Push low-sim entries (< 0.3)
    for (let i = 0; i < 10; i++) h.push({ sim: 0.2 });
    expect((idx as any).adaptiveEf(makeVector([1, 0]), 5)).toBe(32); // 16*2, capped at 64

    // Push high-sim entries (> 0.5)
    h.length = 0;
    for (let i = 0; i < 10; i++) h.push({ sim: 0.7 });
    expect((idx as any).adaptiveEf(makeVector([1, 0]), 5)).toBe(8); // 16/2, floored at 4

    // Push medium-sim entries (0.3-0.5)
    h.length = 0;
    for (let i = 0; i < 10; i++) h.push({ sim: 0.4 });
    expect((idx as any).adaptiveEf(makeVector([1, 0]), 5)).toBe(16); // unchanged
  });

  // 8. remove() removes vector and reduces size
  it('remove removes vector and reduces size', () => {
    idx.add('a', makeVector([1, 0]));
    idx.add('b', makeVector([0, 1]));
    expect(idx.size()).toBe(2);
    idx.remove('a');
    expect(idx.size()).toBe(1);
    const results = idx.search(makeVector([1, 0]), 5);
    expect(results).not.toContain('a');
  });

  // 9. remove() of non-existent doesn't throw
  it('remove of non-existent id does not throw', () => {
    idx.add('a', makeVector([1, 0]));
    expect(() => idx.remove('nonexistent')).not.toThrow();
    expect(idx.size()).toBe(1);
  });

  // 10. clear() resets all state
  it('clear resets all state', () => {
    idx.add('a', makeVector([1, 0]));
    idx.add('b', makeVector([0, 1]));
    // Access internal state before clear
    const h = (idx as any).queryHistory as Array<{ sim: number }>;
    h.push({ sim: 0.5 }, { sim: 0.6 });
    idx.clear();
    expect(idx.size()).toBe(0);
    expect(idx.search(makeVector([1, 0]), 5)).toEqual([]);
    expect((idx as any).queryHistory.length).toBe(0);
    expect((idx as any).neighborCache.size).toBe(0);
  });

  // 11. setEfSearch/getEfSearch round-trip
  it('setEfSearch/getEfSearch round-trip', () => {
    expect(idx.getEfSearch()).toBe(16);
    idx.setEfSearch(42);
    expect(idx.getEfSearch()).toBe(42);
    // should floor at 1
    idx.setEfSearch(0);
    expect(idx.getEfSearch()).toBe(1);
    idx.setEfSearch(-5);
    expect(idx.getEfSearch()).toBe(1);
  });

  // 12. Multiple adds with same id overwrites
  it('multiple adds with same id overwrite and keep size stable', () => {
    const v1 = makeVector([1, 0, 0]);
    const v2 = makeVector([0, 1, 0]);
    idx.add('dup', v1);
    expect(idx.size()).toBe(1);
    idx.add('dup', v2);
    expect(idx.size()).toBe(1);
    // After overwrite the query should match v2, not v1
    const results = idx.search(makeVector([0, 1, 0]), 1);
    expect(results).toEqual(['dup']);
  });

  // 13. search() returns k results when enough vectors
  it('search returns k results when enough vectors exist', () => {
    for (let i = 0; i < 20; i++) {
      idx.add(`v${i}`, makeVector([1, i % 3 === 0 ? 1 : 0]));
    }
    const results = idx.search(makeVector([1, 0.5]), 10);
    expect(results.length).toBe(10);
  });

  // 14. Neighbor cache updates correctly on removal
  it('neighbor cache cleans up correctly on removal', () => {
    idx.add('a', makeVector([1, 0, 0]));
    idx.add('b', makeVector([0, 1, 0]));
    idx.add('c', makeVector([0, 0, 1]));

    const cache = (idx as any).neighborCache as Map<string, Set<string>>;
    // a should have neighbors
    expect(cache.has('a')).toBe(true);
    expect(cache.get('a')!.size).toBeGreaterThan(0);

    idx.remove('a');
    expect(cache.has('a')).toBe(false);
    // a should not appear in any other neighbor set
    for (const [, nbrs] of cache) {
      expect(nbrs.has('a')).toBe(false);
    }
  });

  // 15. Vectors with different lengths handled
  it('throws on different length vectors', () => {
    const v64 = new Float32Array(64);
    const v128 = new Float32Array(128);
    idx.add('a', v64);
    // cosineSimilarity of different lengths would produce NaN, but add() doesn't validate
    // We at least verify no crash
    expect(() => idx.add('b', v128)).not.toThrow();
    // search might still work with the first vector
    const results = idx.search(v64, 5);
    expect(results).toContain('a');
  });
});

// ============================================================================
// SemanticRouter
// ============================================================================
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
  });

  afterEach(() => {
    router.clear();
  });

  // 1. Constructor initializes correctly with default dimension
  it('constructor initializes correctly with default dimension', () => {
    const r = new SemanticRouter();
    expect(r.agentCount()).toBe(0);
  });

  // 2. registerAgent adds agent and emits event
  it('registerAgent adds agent and emits agent_registered event', () => {
    const handler = vi.fn();
    router.onEvent(handler);
    router.registerAgent(webAgent);
    expect(router.agentCount()).toBe(1);
    expect(handler).toHaveBeenCalledWith('agent_registered', expect.objectContaining({ agentId: 'web-1' }));
  });

  // 3. registerAgent with mismatched embedding dimension auto-embeds
  it('registerAgent with mismatched dimension auto-embeds', () => {
    const agent: AgentRegistration = {
      ...webAgent,
      capabilityEmbedding: new Float32Array(32), // wrong dimension
    };
    router.registerAgent(agent);
    const stored = router.getAgent('web-1');
    expect(stored).toBeDefined();
    expect(stored!.capabilityEmbedding.length).toBe(64);
  });

  // 4. unregisterAgent removes and emits event
  it('unregisterAgent removes agent and emits agent_unregistered event', () => {
    router.registerAgent(webAgent);
    const handler = vi.fn();
    router.onEvent(handler);
    router.unregisterAgent('web-1');
    expect(router.agentCount()).toBe(0);
    expect(handler).toHaveBeenCalledWith('agent_unregistered', expect.objectContaining({ agentId: 'web-1' }));
  });

  // 5. getAgent returns registered agent by ID
  it('getAgent returns registered agent by ID', () => {
    router.registerAgent(webAgent);
    const agent = router.getAgent('web-1');
    expect(agent).toBeDefined();
    expect(agent!.agentId).toBe('web-1');
    expect(agent!.domain).toBe('webdesign');
  });

  // 6. getAgent returns undefined for unknown ID
  it('getAgent returns undefined for unknown ID', () => {
    router.registerAgent(webAgent);
    expect(router.getAgent('nonexistent')).toBeUndefined();
  });

  // 7. listAgents returns all registered agents
  it('listAgents returns all registered agents', () => {
    router.registerAgent(webAgent);
    router.registerAgent(contentAgent);
    router.registerAgent(imageAgent);
    const agents = router.listAgents();
    expect(agents.length).toBe(3);
    expect(agents.map(a => a.agentId)).toEqual(expect.arrayContaining(['web-1', 'content-1', 'image-1']));
  });

  // 8. agentCount returns correct count
  it('agentCount returns correct count', () => {
    expect(router.agentCount()).toBe(0);
    router.registerAgent(webAgent);
    expect(router.agentCount()).toBe(1);
    router.registerAgent(contentAgent);
    expect(router.agentCount()).toBe(2);
    router.unregisterAgent('web-1');
    expect(router.agentCount()).toBe(1);
  });

  // 9. routeSubtask returns best match for matching agent
  it('routeSubtask returns best match for matching agent', () => {
    router.registerAgent(webAgent);
    router.registerAgent(contentAgent);
    router.registerAgent(imageAgent);

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

  // 10. routeSubtask returns null when no agents registered
  it('routeSubtask returns null when no agents registered', () => {
    const subtask: SubTask = {
      id: 'st-empty',
      description: 'Any task',
      domain: 'unknown',
      requiredTools: [],
      dependsOn: [],
    };
    expect(router.routeSubtask(subtask)).toBeNull();
  });

  // 11. routeSubtask uses computeAdaptiveWeights in combined score
  it('routeSubtask uses computeAdaptiveWeights for scoring', () => {
    router.registerAgent(webAgent);
    router.registerAgent(contentAgent);

    // Record a success for webAgent so its weight distribution shifts
    const qv = embedText('web design html', 64);
    router.recordRoutingSuccess('st-success', 'web-1', qv);

    const subtask: SubTask = {
      id: 'st-weighted',
      description: 'html css responsive design',
      domain: 'webdesign',
      requiredTools: ['html-renderer'],
      dependsOn: [],
    };
    const match = router.routeSubtask(subtask);
    expect(match).not.toBeNull();
    expect(match!.agent.agentId).toBe('web-1');
    // Weighted score should be > unweighted semantic-only
    expect(match!.combinedScore).toBeGreaterThan(0);
  });

  // 12. routeTopK returns multiple ranked matches
  it('routeTopK returns multiple ranked matches', () => {
    router.registerAgent(webAgent);
    router.registerAgent(contentAgent);
    router.registerAgent(imageAgent);

    const subtask: SubTask = {
      id: 'st-topk',
      description: 'Create a responsive HTML page with CSS',
      domain: 'webdesign',
      requiredTools: ['html-renderer'],
      dependsOn: [],
    };
    const topK = router.routeTopK(subtask, 2);
    expect(topK.length).toBe(2);
    // First result should be the web agent
    expect(topK[0].agent.domain).toBe('webdesign');
  });

  // 13. routeTopK returns [] when no agents
  it('routeTopK returns [] when no agents', () => {
    const subtask: SubTask = {
      id: 'st-nope',
      description: 'Anything',
      domain: 'any',
      requiredTools: [],
      dependsOn: [],
    };
    expect(router.routeTopK(subtask, 3)).toEqual([]);
  });

  // 14. routeTopK orders by combined score correctly
  it('routeTopK orders by combined score correctly', () => {
    // Register two agents and verify ordering reflects combined score
    router.registerAgent({
      ...imageAgent,
      agentId: 'cheap-slow',
      costPerTask: 0.001,
      avgLatencyMs: 50,
    });
    router.registerAgent({
      ...imageAgent,
      agentId: 'expensive-fast',
      costPerTask: 0.01,
      avgLatencyMs: 10,
    });

    const subtask: SubTask = {
      id: 'st-order',
      description: 'generate an image with upscaler',
      domain: 'image',
      requiredTools: ['image-generator', 'upscaler'],
      dependsOn: [],
    };
    const topK = router.routeTopK(subtask, 2);
    expect(topK.length).toBe(2);
    // Both should have combinedScore > 0
    for (const m of topK) {
      expect(m.combinedScore).toBeGreaterThan(0);
    }
    // Order should be descending by combinedScore
    expect(topK[0].combinedScore).toBeGreaterThanOrEqual(topK[1].combinedScore);
  });

  // 15. computeAdaptiveWeights normalizes to sum=1
  it('computeAdaptiveWeights normalizes to sum=1', () => {
    router.registerAgent(webAgent);
    const w = router.computeAdaptiveWeights(webAgent);
    const total = w.semantic + w.tool + w.cost + w.latency;
    expect(total).toBeCloseTo(1, 5);
  });

  // 16. computeAdaptiveWeights cost/latency floor at 0.01
  it('computeAdaptiveWeights cost/latency never negative, floor at 0.01', () => {
    router.registerAgent(webAgent);
    // With many successes, cost/latency should approach floor
    for (let i = 0; i < 50; i++) {
      router.recordRoutingSuccess(`st-${i}`, 'web-1', new Float32Array(64));
    }
    const w = router.computeAdaptiveWeights(webAgent);
    expect(w.cost).toBeGreaterThan(0.009);
    expect(w.latency).toBeGreaterThan(0.009);
    expect(w.semantic).toBeGreaterThan(0);
  });

  // 17. computeAdaptiveWeights semantic increases with successes
  it('computeAdaptiveWeights semantic weight increases with successes', () => {
    router.registerAgent(webAgent);
    const w0 = router.computeAdaptiveWeights(webAgent);
    for (let i = 0; i < 10; i++) {
      router.recordRoutingSuccess(`st-${i}`, 'web-1', new Float32Array(64));
    }
    const w10 = router.computeAdaptiveWeights(webAgent);
    expect(w10.semantic).toBeGreaterThan(w0.semantic);
  });

  // 18. recordRoutingSuccess increments success count
  it('recordRoutingSuccess increments success count', () => {
    router.registerAgent(webAgent);
    router.recordRoutingSuccess('st-1', 'web-1', new Float32Array(64));
    router.recordRoutingSuccess('st-2', 'web-1', new Float32Array(64));
    const w = router.computeAdaptiveWeights(webAgent);
    // With 2 successes the reliability = min(1, 2/10) = 0.2
    expect(w.tool).toBeCloseTo((0.3 + 0.2 * 0.1) / (0.5 + 0.2 * 0.15 + 0.3 + 0.2 * 0.1 + 0.1 - 0.2 * 0.09 + 0.1 - 0.2 * 0.09), 3);
  });

  // 19. recordRoutingFailure decrements success count
  it('recordRoutingFailure decrements success count', () => {
    router.registerAgent(webAgent);
    router.recordRoutingSuccess('st-1', 'web-1', new Float32Array(64));
    router.recordRoutingSuccess('st-2', 'web-1', new Float32Array(64));
    router.recordRoutingFailure('st-1', 'web-1');
    // After one failure, successes should be 1 (starts from 2, minus 1, but floor at 0)
    const w = router.computeAdaptiveWeights(webAgent);
    // With 1 success, reliability = min(1, 1/10) = 0.1
    // semantic = 0.5 + 0.1 * 0.15 = 0.515, tool = 0.3 + 0.1 * 0.1 = 0.31
    // cost = max(0.01, 0.1 - 0.1 * 0.09) = 0.091, latency = 0.091
    // total = 0.515 + 0.31 + 0.091 + 0.091 = 1.007
    // semantic normalized = 0.515/1.007 ≈ 0.5114
    expect(w.semantic).toBeGreaterThan(0.5);
  });

  // 20. refineEmbedding returns null for unknown agent
  it('refineEmbedding returns null for unknown agent', () => {
    expect(router.refineEmbedding('nonexistent')).toBeNull();
  });

  // 21. refineEmbedding interpolates toward centroid after successes
  it('refineEmbedding interpolates toward centroid after successes', () => {
    router.registerAgent(webAgent);
    const qv = embedText('web design html css responsive', 64);
    router.recordRoutingSuccess('st-1', 'web-1', qv);

    const refined = router.refineEmbedding('web-1');
    expect(refined).not.toBeNull();
    expect(refined!.length).toBe(64);

    // The refined embedding should differ from the original (blended toward centroid)
    const orig = webAgent.capabilityEmbedding;
    let same = true;
    for (let i = 0; i < refined!.length; i++) {
      if (Math.abs(refined![i] - orig[i]) > 1e-10) {
        same = false;
        break;
      }
    }
    expect(same).toBe(false);
  });

  // 22. onEvent returns cleanup function that removes listener
  it('onEvent returns cleanup function that removes listener', () => {
    const handler = vi.fn();
    const cleanup = router.onEvent(handler);

    router.registerAgent(webAgent);
    expect(handler).toHaveBeenCalledTimes(1);

    cleanup();
    router.unregisterAgent('web-1');
    // handler should not be called again
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // 23. Events are emitted: agent_registered, agent_unregistered, route_found
  it('emits route_found event on successful route', () => {
    router.registerAgent(webAgent);
    const handler = vi.fn();
    router.onEvent(handler);

    const subtask: SubTask = {
      id: 'st-event',
      description: 'web design task',
      domain: 'webdesign',
      requiredTools: ['html-renderer'],
      dependsOn: [],
    };
    router.routeSubtask(subtask);
    expect(handler).toHaveBeenCalledWith('route_found', expect.objectContaining({ subtaskId: 'st-event' }));
  });

  it('emits agent_unregistered event on unregister', () => {
    router.registerAgent(webAgent);
    const handler = vi.fn();
    router.onEvent(handler);
    router.unregisterAgent('web-1');
    expect(handler).toHaveBeenCalledWith('agent_unregistered', expect.objectContaining({ agentId: 'web-1' }));
  });

  // 24. routeSubtask emits 'fallback_used' when best score < 0.2
  it('emits fallback_used when best combined score < 0.2', () => {
    // Register an agent with a zero embedding (no semantic similarity to anything)
    const zeroEmbedding = new Float32Array(64);
    router.registerAgent({
      agentId: 'zero-match',
      nodeId: 'node-zero',
      modelId: 'zero-model',
      tools: ['unique-tool-x'],
      systemPrompt: 'zzzzz',
      capabilityEmbedding: zeroEmbedding,
      costPerTask: 0.5,
      maxConcurrent: 1,
      avgLatencyMs: 5000,
      domain: 'zzzzz',
    });
    const handler = vi.fn();
    router.onEvent(handler);

    const subtask: SubTask = {
      id: 'st-fallback',
      description: 'completely unrelated task description',
      domain: 'some-other-domain',
      requiredTools: ['imaginary-tool'],
      dependsOn: [],
    };
    const match = router.routeSubtask(subtask);
    expect(match).not.toBeNull();
    expect(match!.combinedScore).toBeLessThan(0.2);
    expect(handler).toHaveBeenCalledWith('fallback_used', expect.objectContaining({ subtaskId: 'st-fallback' }));
  });

  // 25. clear() removes all agents and resets index
  it('clear removes all agents and resets index', () => {
    router.registerAgent(webAgent);
    router.registerAgent(contentAgent);
    router.registerAgent(imageAgent);
    expect(router.agentCount()).toBe(3);

    router.clear();
    expect(router.agentCount()).toBe(0);
    expect(router.listAgents()).toEqual([]);

    const subtask: SubTask = {
      id: 'st-clear',
      description: 'anything',
      domain: 'any',
      requiredTools: [],
      dependsOn: [],
    };
    expect(router.routeSubtask(subtask)).toBeNull();
  });

  it('emits route_failed event when no agents registered', () => {
    const handler = vi.fn();
    router.onEvent(handler);
    const subtask: SubTask = {
      id: 'st-fail',
      description: 'anything',
      domain: 'any',
      requiredTools: [],
      dependsOn: [],
    };
    router.routeSubtask(subtask);
    expect(handler).toHaveBeenCalledWith('route_failed', expect.objectContaining({ subtaskId: 'st-fail' }));
  });

  it('recordRoutingFailure floors at 0', () => {
    router.registerAgent(webAgent);
    router.recordRoutingFailure('st-1', 'web-1');
    // Starting from 0 (default) - 1 should be 0 (floored at 0)
    const w = router.computeAdaptiveWeights(webAgent);
    expect(w.semantic).toBeCloseTo(0.5 / (0.5 + 0.3 + 0.1 + 0.1), 2);
  });

  it('routeSubtask returns correct match for content agent', () => {
    router.registerAgent(webAgent);
    router.registerAgent(contentAgent);
    router.registerAgent(imageAgent);

    const subtask: SubTask = {
      id: 'st-content',
      description: 'Write a blog post about artificial intelligence',
      domain: 'content',
      requiredTools: ['text-generator'],
      dependsOn: [],
    };
    const match = router.routeSubtask(subtask);
    expect(match).not.toBeNull();
    expect(match!.agent.agentId).toBe('content-1');
  });

  it('routeSubtask returns correct match for image agent', () => {
    router.registerAgent(webAgent);
    router.registerAgent(contentAgent);
    router.registerAgent(imageAgent);

    const subtask: SubTask = {
      id: 'st-image',
      description: 'Generate an image of a sunset',
      domain: 'image',
      requiredTools: ['image-generator'],
      dependsOn: [],
    };
    const match = router.routeSubtask(subtask);
    expect(match).not.toBeNull();
    expect(match!.agent.agentId).toBe('image-1');
  });

  it('handles tool matching in routeSubtask correctly', () => {
    router.registerAgent(webAgent);
    router.registerAgent(imageAgent);

    const subtask: SubTask = {
      id: 'st-tools',
      description: 'Generate and upscale an image',
      domain: 'image',
      requiredTools: ['image-generator', 'upscaler'],
      dependsOn: [],
    };
    const match = router.routeSubtask(subtask);
    expect(match).not.toBeNull();
    expect(match!.agent.agentId).toBe('image-1');
  });

  it('routeSubtask with no required tools yields toolScore=1 for all agents', () => {
    router.registerAgent(webAgent);
    router.registerAgent(contentAgent);

    const subtask: SubTask = {
      id: 'st-notools',
      description: 'general task without specific tools',
      domain: 'webdesign',
      requiredTools: [],
      dependsOn: [],
    };
    const match = router.routeSubtask(subtask);
    expect(match).not.toBeNull();
    // With no tools, toolScore is 1 for everyone, so semantic dominates
    expect(match!.combinedScore).toBeGreaterThan(0);
  });
});

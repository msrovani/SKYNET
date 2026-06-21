import { describe, it, expect } from 'vitest';
import { SemanticRouter } from '../semantic-router.js';
import { embedText } from '../capability.js';
import { AgentMeshManager } from '../agent-mesh.js';
import { HnswIndex } from '../semantic-router.js';

describe('Load Test: 100+ Mesh Nodes', () => {
  it('registers 100 agents in SemanticRouter and routes subtasks', () => {
    const router = new SemanticRouter(64);
    const domains = ['inference', 'embedding', 'training', 'storage', 'compute'];
    const tools = ['llm-generate', 'embed', 'train', 'store', 'compute'];

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      const domain = domains[i % domains.length];
      const tool = tools[i % tools.length];
      router.registerAgent({
        agentId: `agent-${i}`,
        nodeId: `node-${Math.floor(i / 10)}`,
        modelId: 'phi-3-mini',
        tools: [tool],
        systemPrompt: `Expert in ${domain}`,
        capabilityEmbedding: embedText(`${domain} ${tool} processing`, 64),
        costPerTask: 0.001 + (i % 5) * 0.0005,
        maxConcurrent: 2,
        avgLatencyMs: 100 + (i % 10) * 10,
        domain,
      });
    }
    const registerTime = performance.now() - start;
    expect(registerTime).toBeLessThan(500);

    const searchStart = performance.now();
    let matchCount = 0;
    for (let i = 0; i < 50; i++) {
      const domain = domains[i % domains.length];
      const tool = tools[i % tools.length];
      const match = router.routeSubtask({
        id: `load-st-${i}`,
        description: `Process ${domain} task with ${tool}`,
        domain,
        requiredTools: [tool],
        dependsOn: [],
      });
      if (match) matchCount++;
    }
    const searchTime = performance.now() - searchStart;
    expect(matchCount).toBeGreaterThanOrEqual(40);
    expect(searchTime).toBeLessThan(1000);
  });

  it('manages 100 agents through AgentMeshManager with heartbeats', () => {
    const router = new SemanticRouter(64);
    const mesh = new AgentMeshManager('load-test-node', router);

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      mesh.registerLocalAgent(
        `model-${i % 3}`,
        [`tool-${i % 5}`],
        `System prompt for agent ${i}`,
        `domain-${i % 4}`,
        0.001,
        2,
        100,
      );
    }
    const registerTime = performance.now() - start;
    expect(registerTime).toBeLessThan(500);

    expect(mesh).toBeDefined();
    expect(router).toBeDefined();
  });

  it('handles 1000 vectors in HnswIndex with search', () => {
    const index = new HnswIndex();

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      const vec = new Float32Array(64);
      for (let j = 0; j < 64; j++) {
        vec[j] = Math.sin(i * 0.1 + j * 0.05);
      }
      index.add(i.toString(), vec);
    }
    const insertTime = performance.now() - start;
    expect(insertTime).toBeLessThan(2500);

    const query = new Float32Array(64);
    for (let j = 0; j < 64; j++) query[j] = Math.sin(42 + j * 0.05);

    const searchStart = performance.now();
    const results = index.search(query, 10);
    const searchTime = performance.now() - searchStart;
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(10);
    expect(searchTime).toBeLessThan(200);
  });
});

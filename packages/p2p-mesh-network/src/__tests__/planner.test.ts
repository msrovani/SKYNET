import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskPlanner } from '../planner.js';
import { TopologyRouter } from '../topology-router.js';
import { FractionAggregator, computeSimpleChecksum } from '../fraction-aggregator.js';
import type { SubTask } from '../planner.js';
import type { AgentFraction } from '../fraction-aggregator.js';

describe('TaskPlanner', () => {
  let planner: TaskPlanner;

  beforeEach(() => {
    planner = new TaskPlanner();
  });

  it('creates a simple plan for short prompts', () => {
    const plan = planner.plan('write a poem');
    expect(plan.metadata.complexity).toBe('simple');
    expect(plan.subtasks.length).toBe(1);
    expect(plan.requestId).toMatch(/^plan-/);
  });

  it('creates a webdesign plan for website prompts', () => {
    const plan = planner.plan('Create a landing page for my bakery business website');
    expect(plan.metadata.domain).toBe('webdesign');
    expect(plan.subtasks.length).toBeGreaterThan(3);
    expect(plan.metadata.complexity).toBe('complex');
  });

  it('creates a content plan for blog prompts', () => {
    const plan = planner.plan('Write a blog post about AI and machine learning');
    expect(plan.metadata.domain).toBe('content');
    expect(plan.subtasks.length).toBeGreaterThan(2);
  });

  it('creates an image plan for image prompts', () => {
    const plan = planner.plan('Generate a photo of a sunset landscape');
    expect(plan.metadata.domain).toBe('image');
    expect(plan.subtasks.length).toBeGreaterThan(2);
  });

  it('creates an analysis plan for research prompts', () => {
    const plan = planner.plan('Analyse the sales data and create a report');
    expect(plan.metadata.domain).toBe('analysis');
  });

  it('computes critical path depth correctly', () => {
    const plan = planner.plan('Create a landing page for my bakery');
    expect(plan.metadata.criticalPathDepth).toBeGreaterThan(0);
    expect(plan.metadata.criticalPathDepth).toBeLessThanOrEqual(plan.subtasks.length);
  });

  it('groups subtasks into layers', () => {
    const plan = planner.plan('Create a complete website');
    const layers = planner.getSubTasksByLayer(plan);
    expect(layers.length).toBeGreaterThan(0);
    for (const layer of layers) {
      expect(layer.length).toBeGreaterThan(0);
    }
    const allIds = new Set(layers.flat().map(s => s.id));
    for (const s of plan.subtasks) {
      expect(allIds.has(s.id)).toBe(true);
    }
  });

  it('handles empty prompt gracefully', () => {
    const plan = planner.plan('');
    expect(plan.metadata.complexity).toBe('simple');
    expect(plan.subtasks.length).toBe(1);
  });
});

describe('TopologyRouter', () => {
  let router: TopologyRouter;

  beforeEach(() => {
    router = new TopologyRouter();
  });

  it('selects parallel for independent tasks', () => {
    const subtasks: SubTask[] = [
      { id: 'a', parentTaskId: '1', description: 'Task A', domain: 'web', requiredTools: [], dependsOn: [], status: 'pending' },
      { id: 'b', parentTaskId: '1', description: 'Task B', domain: 'content', requiredTools: [], dependsOn: [], status: 'pending' },
      { id: 'c', parentTaskId: '1', description: 'Task C', domain: 'image', requiredTools: [], dependsOn: [], status: 'pending' },
    ];
    const layers = [subtasks];
    const decision = router.analyze(subtasks, layers);
    expect(decision.topology).toBe('parallel');
    expect(decision.metrics.parallelismWidth).toBe(3);
    expect(decision.metrics.criticalPathDepth).toBe(1);
  });

  it('selects sequential for linear chain', () => {
    const subtasks: SubTask[] = [
      { id: 'a', parentTaskId: '1', description: 'Research', domain: 'research', requiredTools: [], dependsOn: [], status: 'pending' },
      { id: 'b', parentTaskId: '1', description: 'Draft', domain: 'content', requiredTools: [], dependsOn: ['a'], status: 'pending' },
      { id: 'c', parentTaskId: '1', description: 'Edit', domain: 'content', requiredTools: [], dependsOn: ['b'], status: 'pending' },
      { id: 'd', parentTaskId: '1', description: 'Publish', domain: 'deploy', requiredTools: [], dependsOn: ['c'], status: 'pending' },
    ];
    const layers = [[subtasks[0]], [subtasks[1]], [subtasks[2]], [subtasks[3]]];
    const decision = router.analyze(subtasks, layers);
    expect(decision.topology).toBe('sequential');
  });

  it('selects hybrid for mixed dependencies', () => {
    const subtasks: SubTask[] = [
      { id: 'a', parentTaskId: '1', description: 'Plan', domain: 'planning', requiredTools: [], dependsOn: [], status: 'pending' },
      { id: 'b', parentTaskId: '1', description: 'HTML', domain: 'web', requiredTools: [], dependsOn: ['a'], status: 'pending' },
      { id: 'c', parentTaskId: '1', description: 'CSS', domain: 'web', requiredTools: [], dependsOn: ['a'], status: 'pending' },
      { id: 'd', parentTaskId: '1', description: 'Integrate', domain: 'web', requiredTools: [], dependsOn: ['b', 'c'], status: 'pending' },
    ];
    const layers = [[subtasks[0]], [subtasks[1], subtasks[2]], [subtasks[3]]];
    const decision = router.analyze(subtasks, layers);
    expect(['hybrid', 'hierarchical']).toContain(decision.topology);
  });

  it('returns correct metrics', () => {
    const subtasks: SubTask[] = [
      { id: 'a', parentTaskId: '1', description: 'A', domain: 'x', requiredTools: [], dependsOn: [], status: 'pending' },
      { id: 'b', parentTaskId: '1', description: 'B', domain: 'y', requiredTools: [], dependsOn: ['a'], status: 'pending' },
    ];
    const layers = [[subtasks[0]], [subtasks[1]]];
    const decision = router.analyze(subtasks, layers);
    expect(decision.metrics.parallelismWidth).toBe(1);
    expect(decision.metrics.criticalPathDepth).toBe(2);
    expect(decision.justification).toBeTruthy();
  });
});

describe('FractionAggregator', () => {
  let aggregator: FractionAggregator;

  const makeFraction = (subTaskId: string, agentId: string, content: string, mimeType: string, confidence: number = 0.9): AgentFraction => {
    const data = new TextEncoder().encode(content);
    return {
      subTaskId,
      agentId,
      nodeId: `node-${agentId}`,
      artifact: { mimeType, data, sizeBytes: data.length, checksum: computeSimpleChecksum(data) },
      confidence,
      latencyMs: 100,
      costUsd: 0.001,
    };
  };

  beforeEach(() => {
    aggregator = new FractionAggregator();
  });

  afterEach(() => {
    aggregator.clear();
  });

  it('accepts valid fractions with correct checksum', () => {
    const frac = makeFraction('st-1', 'agent-1', '<h1>Hello</h1>', 'text/html');
    aggregator.addFraction(frac);
    const fractions = aggregator.getFractions('st-1');
    expect(fractions.length).toBe(1);
    expect(fractions[0].agentId).toBe('agent-1');
  });

  it('rejects fractions with incorrect checksum', () => {
    const handler = vi.fn();
    aggregator.onEvent(handler);
    const data = new TextEncoder().encode('corrupted data');
    const frac: AgentFraction = {
      subTaskId: 'st-1',
      agentId: 'agent-1',
      nodeId: 'node-1',
      artifact: { mimeType: 'text/html', data, sizeBytes: data.length, checksum: 'badchecksum12345678' },
      confidence: 0.9,
      latencyMs: 100,
      costUsd: 0.001,
    };
    aggregator.addFraction(frac);
    expect(aggregator.getFractions('st-1').length).toBe(0);
    expect(handler).toHaveBeenCalledWith('fraction_rejected', expect.objectContaining({ reason: 'checksum_mismatch' }));
  });

  it('aggregates HTML and CSS fractions into a complete page', () => {
    aggregator.addFraction(makeFraction('st-html', 'web-agent', '<div class="hero"><h1>Welcome</h1></div>', 'text/html'));
    aggregator.addFraction(makeFraction('st-css', 'css-agent', '.hero { color: blue; }', 'text/css'));

    const result = aggregator.aggregate('req-1', ['st-html', 'st-css']);
    expect(result).not.toBeNull();
    expect(result!.fractions.length).toBe(2);
    expect(result!.finalArtifact.mimeType).toBe('text/html');
    const html = new TextDecoder().decode(result!.finalArtifact.data);
    expect(html).toContain('Welcome');
    expect(html).toContain('color: blue');
    expect(result!.agentsUsed).toContain('web-agent');
    expect(result!.agentsUsed).toContain('css-agent');
  });

  it('detects CSS/HTML class consistency', () => {
    const handler = vi.fn();
    aggregator.onEvent(handler);
    aggregator.addFraction(makeFraction('st-html', 'web-agent', '<div class="header main">Content</div>', 'text/html'));
    aggregator.addFraction(makeFraction('st-css', 'css-agent', '.header { color: red; } .footer { color: blue; }', 'text/css'));
    const result = aggregator.aggregate('req-2', ['st-html', 'st-css']);
    expect(result).not.toBeNull();
    expect(result!.metadata.consistencyScore).toBeGreaterThan(0.3);
  });

  it('returns null when consistency is too low and requests refinement', () => {
    const handler = vi.fn();
    aggregator.onEvent(handler);
    aggregator.addFraction(makeFraction('st-1', 'agent-1', 'incomplete', 'text/plain', 0.1));
    const result = aggregator.aggregate('req-3', ['st-1', 'st-missing']);
    expect(result).toBeNull();
    expect(handler).toHaveBeenCalledWith('consistency_fail', expect.any(Object));
    expect(handler).toHaveBeenCalledWith('refinement_requested', expect.any(Object));
  });

  it('aggregates JSON fractions', () => {
    aggregator.addFraction(makeFraction('st-1', 'agent-1', '{"name": "SKYNET"}', 'application/json'));
    aggregator.addFraction(makeFraction('st-2', 'agent-2', '{"version": "0.4.0"}', 'application/json'));
    const result = aggregator.aggregate('req-4', ['st-1', 'st-2']);
    expect(result).not.toBeNull();
    expect(result!.finalArtifact.mimeType).toBe('application/json');
    const parsed = JSON.parse(new TextDecoder().decode(result!.finalArtifact.data));
    expect(parsed.name).toBe('SKYNET');
    expect(parsed.version).toBe('0.4.0');
  });

  it('aggregates text fractions into markdown', () => {
    aggregator.addFraction(makeFraction('st-1', 'agent-1', '# Chapter 1', 'text/markdown'));
    aggregator.addFraction(makeFraction('st-2', 'agent-2', 'Content here', 'text/plain'));
    const result = aggregator.aggregate('req-5', ['st-1', 'st-2']);
    expect(result).not.toBeNull();
    expect(result!.finalArtifact.mimeType).toBe('text/markdown');
    const text = new TextDecoder().decode(result!.finalArtifact.data);
    expect(text).toContain('Chapter 1');
    expect(text).toContain('Content here');
  });

  it('selects the highest confidence fraction per subtask', () => {
    aggregator.addFraction(makeFraction('st-1', 'agent-1', 'draft', 'text/plain', 0.5));
    aggregator.addFraction(makeFraction('st-1', 'agent-2', 'final version', 'text/plain', 0.95));
    const result = aggregator.aggregate('req-6', ['st-1']);
    expect(result).not.toBeNull();
    expect(result!.fractions[0].agentId).toBe('agent-2');
  });

  it('emits events on complete aggregation', () => {
    const handler = vi.fn();
    aggregator.onEvent(handler);
    aggregator.addFraction(makeFraction('st-1', 'agent-1', 'done', 'text/plain'));
    aggregator.aggregate('req-7', ['st-1']);
    expect(handler).toHaveBeenCalledWith('aggregation_complete', expect.any(Object));
  });

  it('computes total cost and latency', () => {
    aggregator.addFraction(makeFraction('st-1', 'agent-1', 'a', 'text/plain', 0.9));
    aggregator.addFraction(makeFraction('st-2', 'agent-2', 'b', 'text/plain', 0.8));
    const result = aggregator.aggregate('req-8', ['st-1', 'st-2']);
    expect(result).not.toBeNull();
    expect(result!.totalCostUsd).toBeCloseTo(0.002, 5);
    expect(result!.totalLatencyMs).toBeGreaterThan(0);
  });

  it('clears state', () => {
    aggregator.addFraction(makeFraction('st-1', 'agent-1', 'data', 'text/plain'));
    aggregator.clear();
    expect(aggregator.getFractions('st-1').length).toBe(0);
  });
});

describe('computeSimpleChecksum', () => {
  it('produces deterministic hash', () => {
    const data = new TextEncoder().encode('hello world');
    const hash1 = computeSimpleChecksum(data);
    const hash2 = computeSimpleChecksum(data);
    expect(hash1).toBe(hash2);
  });

  it('produces different hash for different data', () => {
    const a = computeSimpleChecksum(new TextEncoder().encode('hello'));
    const b = computeSimpleChecksum(new TextEncoder().encode('world'));
    expect(a).not.toBe(b);
  });
});

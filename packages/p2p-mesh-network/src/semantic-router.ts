import { cosineSimilarity, embedText } from './capability.js';

export interface AgentRegistration {
  agentId: string;
  nodeId: string;
  modelId: string;
  tools: string[];
  systemPrompt: string;
  capabilityEmbedding: Float32Array;
  costPerTask: number;
  maxConcurrent: number;
  avgLatencyMs: number;
  domain: string;
}

export interface SubTask {
  id: string;
  description: string;
  domain: string;
  requiredTools: string[];
  dependsOn: string[];
}

export interface RouteMatch {
  agent: AgentRegistration;
  score: number;
  combinedScore: number;
}

export class HnswIndex {
  private vectors: Map<string, Float32Array> = new Map();
  private labels: string[] = [];
  private readonly M: number = 16;
  private readonly efConstruction: number = 32;
  private efSearch: number = 16;
  private neighborCache: Map<string, Set<string>> = new Map();
  private queryHistory: Array<{ sim: number }> = [];

  constructor() {
  }

  setEfSearch(ef: number): void {
    this.efSearch = Math.max(1, ef);
  }

  getEfSearch(): number {
    return this.efSearch;
  }

  adaptiveEf(_query: Float32Array, _k: number): number {
    if (this.queryHistory.length < 10) return this.efSearch;
    const recentSims = this.queryHistory.slice(-10);
    const avgSim = recentSims.reduce((s, r) => s + r.sim, 0) / recentSims.length;
    if (avgSim < 0.3) return Math.min(this.efSearch * 2, 64);
    if (avgSim < 0.5) return this.efSearch;
    return Math.max(this.efSearch / 2, 4);
  }

  private l2Norm(v: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
    return Math.sqrt(sum);
  }

  private dotProduct(a: Float32Array, b: Float32Array): number {
    let d = 0;
    for (let i = 0; i < a.length; i++) d += a[i] * b[i];
    return d;
  }

  add(id: string, vector: Float32Array): void {
    if (this.vectors.has(id)) return;
    this.vectors.set(id, vector);
    this.labels.push(id);

    const candidates = this.labels.filter(x => x !== id);
    const distances = candidates.map(c => ({
      id: c,
      sim: cosineSimilarity(vector, this.vectors.get(c)!),
    }));
    distances.sort((a, b) => b.sim - a.sim);

    const neighbors = new Set(distances.slice(0, this.M).map(n => n.id));
    this.neighborCache.set(id, neighbors);

    for (const nId of neighbors) {
      if (this.neighborCache.has(nId)) {
        this.neighborCache.get(nId)!.add(id);
      }
    }
  }

  search(query: Float32Array, k: number = 5): string[] {
    if (this.labels.length === 0) return [];
    return this.searchWithCRouting(query, k);
  }

  searchWithCRouting(query: Float32Array, k: number = 5): string[] {
    if (this.labels.length === 0) return [];

    const qNorm = this.l2Norm(query);
    const ef = this.adaptiveEf(query, k);
    const evaluated: Array<{ id: string; sim: number }> = [];

    for (const id of this.labels) {
      if (evaluated.length >= ef) {
        const kthSim = evaluated[evaluated.length - 1].sim;
        const vNorm = this.l2Norm(this.vectors.get(id)!);
        if (qNorm > 0 && vNorm > 0) {
          const cosAngle = this.dotProduct(query, this.vectors.get(id)!) / (qNorm * vNorm);
          if (cosAngle < kthSim - 0.15) continue;
        }
      }
      const sim = cosineSimilarity(query, this.vectors.get(id)!);
      evaluated.push({ id, sim });
      evaluated.sort((a, b) => b.sim - a.sim);
      if (evaluated.length > ef * 2) evaluated.length = ef * 2;
    }

    evaluated.sort((a, b) => b.sim - a.sim);
    const topK = evaluated.slice(0, k);
    if (topK.length > 0) {
      this.queryHistory.push({ sim: topK[0].sim });
      if (this.queryHistory.length > 100) this.queryHistory.shift();
    }
    return topK.map(c => c.id);
  }

  remove(id: string): void {
    this.vectors.delete(id);
    this.labels = this.labels.filter(l => l !== id);
    this.neighborCache.delete(id);
    for (const [nId, neighbors] of this.neighborCache) {
      neighbors.delete(id);
      if (neighbors.size === 0) this.neighborCache.delete(nId);
    }
  }

  size(): number {
    return this.vectors.size;
  }

  clear(): void {
    this.vectors.clear();
    this.labels = [];
    this.neighborCache.clear();
    this.queryHistory = [];
  }
}

export type RouterEvent = 'agent_registered' | 'agent_unregistered' | 'route_found' | 'route_failed' | 'fallback_used';
export type RouterCallback = (event: RouterEvent, data: any) => void;

export class SemanticRouter {
  private index: HnswIndex;
  private agents: Map<string, AgentRegistration> = new Map();
  private callbacks: Set<RouterCallback> = new Set();
  private embeddingDimension: number;
  private successHistory: Map<string, number> = new Map();
  private queryVectors: Map<string, Float32Array> = new Map();

  constructor(embeddingDimension: number = 64) {
    this.index = new HnswIndex();
    this.embeddingDimension = embeddingDimension;
  }

  refineEmbedding(agentId: string): Float32Array | null {
    const agent = this.agents.get(agentId);
    if (!agent || !this.successHistory.has(agentId)) return null;
    const embedding = agent.capabilityEmbedding;
    const refined = new Float32Array(embedding.length);
    const successes = this.successHistory.get(agentId)!;
    const centroid = this.computeSuccessCentroid(agentId);
    if (!centroid) return null;
    const alpha = Math.min(0.3, 1 / (1 + successes));
    for (let i = 0; i < embedding.length; i++) {
      refined[i] = embedding[i] * (1 - alpha) + centroid[i] * alpha;
    }
    return refined;
  }

  private computeSuccessCentroid(agentId: string): Float32Array | null {
    let count = 0;
    const dim = this.embeddingDimension;
    const centroid = new Float32Array(dim);
    for (const [qId, qVec] of this.queryVectors) {
      if (qId.startsWith(agentId + '/')) {
        for (let i = 0; i < dim; i++) centroid[i] += qVec[i];
        count++;
      }
    }
    if (count === 0) return null;
    for (let i = 0; i < dim; i++) centroid[i] /= count;
    return centroid;
  }

  recordRoutingSuccess(subtaskId: string, agentId: string, queryEmbedding: Float32Array): void {
    this.successHistory.set(agentId, (this.successHistory.get(agentId) || 0) + 1);
    if (this.successHistory.size > 500) {
      const first = this.successHistory.keys().next().value;
      if (first) this.successHistory.delete(first);
    }
    this.queryVectors.set(`${agentId}/${subtaskId}`, queryEmbedding);
    if (this.queryVectors.size > 500) {
      const first = this.queryVectors.keys().next().value;
      if (first) this.queryVectors.delete(first);
    }
  }

  recordRoutingFailure(subtaskId: string, agentId: string): void {
    this.successHistory.set(agentId, Math.max(0, (this.successHistory.get(agentId) || 0) - 1));
  }

  computeAdaptiveWeights(agent: AgentRegistration): { semantic: number; tool: number; cost: number; latency: number } {
    const successes = this.successHistory.get(agent.agentId) || 0;
    const reliability = Math.min(1, successes / 10);
    return {
      semantic: 0.5 + reliability * 0.15,
      tool: 0.3 + reliability * 0.1,
      cost: 0.1,
      latency: 0.1,
    };
  }

  onEvent(cb: RouterCallback): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  private emit(event: RouterEvent, data: any): void {
    for (const cb of this.callbacks) {
      try { cb(event, data); } catch { /* ignore handler errors */ }
    }
  }

  registerAgent(registration: AgentRegistration): void {
    const embedding = registration.capabilityEmbedding.length === this.embeddingDimension
      ? registration.capabilityEmbedding
      : embedText(
          `${registration.systemPrompt} ${registration.tools.join(' ')} ${registration.domain}`,
          this.embeddingDimension,
        );

    this.agents.set(registration.agentId, {
      ...registration,
      capabilityEmbedding: embedding,
    });

    this.index.add(registration.agentId, embedding);
    this.emit('agent_registered', { agentId: registration.agentId, domain: registration.domain });
  }

  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId);
    this.index.remove(agentId);
    this.emit('agent_unregistered', { agentId });
  }

  routeSubtask(subtask: SubTask, k: number = 3): RouteMatch | null {
    const queryEmbedding = embedText(
      `${subtask.description} ${subtask.domain} ${subtask.requiredTools.join(' ')}`,
      this.embeddingDimension,
    );

    const candidates = this.index.search(queryEmbedding, k);
    if (candidates.length === 0) {
      this.emit('route_failed', { subtaskId: subtask.id });
      return null;
    }

    const scored: RouteMatch[] = candidates
      .map(id => {
        const agent = this.agents.get(id);
        if (!agent) return null;
        const embedding = this.refineEmbedding(id) || agent.capabilityEmbedding;
        const semanticScore = cosineSimilarity(queryEmbedding, embedding);
        const toolScore = subtask.requiredTools.length === 0
          ? 1
          : subtask.requiredTools.filter(t => agent.tools.includes(t)).length / subtask.requiredTools.length;
        const costPenalty = agent.costPerTask / 10;
        const latencyPenalty = agent.avgLatencyMs / 1000;
        const w = this.computeAdaptiveWeights(agent);
        const combinedScore = semanticScore * w.semantic + toolScore * w.tool - costPenalty * w.cost - latencyPenalty * w.latency;

        return { agent, score: semanticScore, combinedScore };
      })
      .filter((m): m is RouteMatch => m !== null)
      .sort((a, b) => b.combinedScore - a.combinedScore);

    const best = scored[0];
    if (!best) {
      this.emit('fallback_used', { subtaskId: subtask.id, agentId: '', score: 0 });
      return null;
    }
    this.emit('route_found', {
      subtaskId: subtask.id,
      agentId: best.agent.agentId,
      score: best.combinedScore,
    });

    if (best.combinedScore < 0.2) {
      this.emit('fallback_used', {
        subtaskId: subtask.id,
        agentId: best.agent.agentId,
        score: best.combinedScore,
      });
    }

    if (best.combinedScore < 0) {
      this.emit('route_failed', { subtaskId: subtask.id, score: best.combinedScore });
      return null;
    }

    return best;
  }

  routeTopK(subtask: SubTask, k: number = 3): RouteMatch[] {
    const queryEmbedding = embedText(
      `${subtask.description} ${subtask.domain} ${subtask.requiredTools.join(' ')}`,
      this.embeddingDimension,
    );

    const candidates = this.index.search(queryEmbedding, k);
    if (candidates.length === 0) return [];

    return candidates
      .map(id => {
        const agent = this.agents.get(id);
        if (!agent) return null;
        const semanticScore = cosineSimilarity(queryEmbedding, agent.capabilityEmbedding);
        const toolScore = subtask.requiredTools.length === 0
          ? 1
          : subtask.requiredTools.filter(t => agent.tools.includes(t)).length / subtask.requiredTools.length;
        const costPenalty = agent.costPerTask / 10;
        const latencyPenalty = agent.avgLatencyMs / 1000;
        const combinedScore = semanticScore * 0.5 + toolScore * 0.3 - costPenalty * 0.1 - latencyPenalty * 0.1;

        return { agent, score: semanticScore, combinedScore };
      })
      .filter((m): m is RouteMatch => m !== null)
      .sort((a, b) => b.combinedScore - a.combinedScore);
  }

  getAgent(agentId: string): AgentRegistration | undefined {
    return this.agents.get(agentId);
  }

  listAgents(): AgentRegistration[] {
    return Array.from(this.agents.values());
  }

  agentCount(): number {
    return this.agents.size;
  }

  clear(): void {
    this.agents.clear();
    this.index.clear();
  }
}

export interface NeuronGroup {
  id: string;
  layerIndex: number;
  importance: number;
  size: number;
  isCritical: boolean;
}

export interface NodeHealth {
  nodeId: string;
  packetLoss: number;
  rttMs: number;
  bandwidthMbps: number;
  uptime: number;
  isStable: boolean;
}

export class LossyAwareRouter {
  private neuronGroups: Map<string, NeuronGroup[]> = new Map();
  private nodeHealth: Map<string, NodeHealth> = new Map();
  private readonly LOSS_THRESHOLD = 0.15;

  registerNeuronGroups(modelId: string, groups: NeuronGroup[]): void {
    const sorted = [...groups].sort((a, b) => b.importance - a.importance);
    const thresholdIdx = Math.floor(sorted.length * 0.3);
    for (let i = 0; i < sorted.length; i++) {
      sorted[i].isCritical = i < thresholdIdx;
    }
    this.neuronGroups.set(modelId, sorted);
  }

  updateNodeHealth(nodeId: string, health: Partial<NodeHealth>): void {
    const existing = this.nodeHealth.get(nodeId) ?? {
      nodeId, packetLoss: 0, rttMs: 0, bandwidthMbps: 0, uptime: 0, isStable: true,
    };
    Object.assign(existing, health);
    existing.isStable = existing.packetLoss < this.LOSS_THRESHOLD;
    this.nodeHealth.set(nodeId, existing);
  }

  getNodeHealth(nodeId: string): NodeHealth | undefined {
    return this.nodeHealth.get(nodeId);
  }

  getStableNodes(): string[] {
    return Array.from(this.nodeHealth.entries())
      .filter(([, h]) => h.isStable)
      .map(([id]) => id);
  }

  getUnstableNodes(): string[] {
    return Array.from(this.nodeHealth.entries())
      .filter(([, h]) => !h.isStable)
      .map(([id]) => id);
  }

  allocateGroupsToNodes(
    modelId: string,
    nodeIds: string[],
    minCriticalNodes: number = 2,
  ): Map<string, NeuronGroup[]> {
    const groups = this.neuronGroups.get(modelId);
    if (!groups) return new Map();

    const critical = groups.filter(g => g.isCritical);
    const nonCritical = groups.filter(g => !g.isCritical);
    const stable = this.getStableNodes().filter(n => nodeIds.includes(n));
    const unstable = this.getUnstableNodes().filter(n => nodeIds.includes(n));

    if (stable.length < minCriticalNodes) return new Map();

    const allocation = new Map<string, NeuronGroup[]>();
    let critIdx = 0;
    for (const nodeId of stable) {
      if (critIdx < critical.length) {
        const assigned = critical.slice(critIdx, critIdx + 1);
        allocation.set(nodeId, [assigned[0]]);
        critIdx++;
      }
    }
    while (critIdx < critical.length) {
      const target = stable[critIdx % stable.length];
      if (!allocation.has(target)) allocation.set(target, []);
      allocation.get(target)!.push(critical[critIdx]);
      critIdx++;
    }
    let nonCritIdx = 0;
    const allNodes = stable.concat(unstable);
    for (const nodeId of allNodes) {
      if (nonCritIdx >= nonCritical.length) break;
      if (!allocation.has(nodeId)) allocation.set(nodeId, []);
      allocation.get(nodeId)!.push(nonCritical[nonCritIdx]);
      nonCritIdx++;
    }
    return allocation;
  }

  predictImportance(modelId: string, activationPattern: Float32Array): Map<number, number> {
    const groups = this.neuronGroups.get(modelId);
    if (!groups) return new Map();
    const scores = new Map<number, number>();
    for (const g of groups) {
      const sum = Array.from(activationPattern).reduce((s, v, i) => {
        if (i >= g.layerIndex && i < g.layerIndex + g.size) return s + Math.abs(v);
        return s;
      }, 0);
      const normScore = sum / Math.max(g.size, 1);
      scores.set(g.layerIndex, normScore * g.importance);
    }
    return scores;
  }

  getRoutingAdvice(modelId: string, nodeId: string): 'critical' | 'standard' | 'avoid' {
    const health = this.nodeHealth.get(nodeId);
    if (!health) return 'standard';
    if (health.packetLoss >= 0.3) return 'avoid';
    if (health.packetLoss >= this.LOSS_THRESHOLD) return 'standard';
    const groups = this.neuronGroups.get(modelId);
    if (!groups || groups.filter(g => g.isCritical).length === 0) return 'standard';
    const criticalCount = groups.filter(g => g.isCritical).length;
    if (criticalCount > 5 && health.packetLoss < 0.05) return 'critical';
    return 'standard';
  }

  clear(): void {
    this.neuronGroups.clear();
    this.nodeHealth.clear();
  }
}

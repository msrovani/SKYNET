import { VCapabilityVector, cosineSimilarity, embedText } from './capability.js';

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
  private readonly mL: number = 1 / Math.log(this.M);
  private layers: Map<number, Map<string, Set<string>>> = new Map();

  constructor() {
    this.layers.set(0, new Map());
  }

  private randomLevel(): number {
    let l = 0;
    while (Math.random() < this.mL && l < 4) l++;
    return l;
  }

  add(id: string, vector: Float32Array): void {
    const level = this.randomLevel();
    this.vectors.set(id, vector);
    this.labels.push(id);

    for (let l = 0; l <= level; l++) {
      if (!this.layers.has(l)) this.layers.set(l, new Map());
      const layer = this.layers.get(l)!;
      layer.set(id, new Set());

      const candidates = this.labels.filter(x => x !== id);
      const distances = candidates.map(c => ({
        id: c,
        sim: cosineSimilarity(vector, this.vectors.get(c)!),
      }));
      distances.sort((a, b) => b.sim - a.sim);

      const neighbors = distances.slice(0, this.M);
      for (const n of neighbors) {
        layer.get(id)!.add(n.id);
        if (layer.has(n.id)) {
          layer.get(n.id)!.add(id);
        }
      }
    }
  }

  search(query: Float32Array, k: number = 5): string[] {
    if (this.labels.length === 0) return [];

    const candidates = this.labels
      .map(id => ({ id, sim: cosineSimilarity(query, this.vectors.get(id)!) }))
      .sort((a, b) => b.sim - a.sim);

    return candidates.slice(0, k).map(c => c.id);
  }

  remove(id: string): void {
    this.vectors.delete(id);
    this.labels = this.labels.filter(l => l !== id);
    for (const [, layer] of this.layers) {
      layer.delete(id);
      for (const [, neighbors] of layer) {
        neighbors.delete(id);
      }
    }
  }

  size(): number {
    return this.vectors.size;
  }

  clear(): void {
    this.vectors.clear();
    this.labels = [];
    this.layers.clear();
    this.layers.set(0, new Map());
  }
}

export type RouterEvent = 'agent_registered' | 'agent_unregistered' | 'route_found' | 'route_failed' | 'fallback_used';
export type RouterCallback = (event: RouterEvent, data: any) => void;

export class SemanticRouter {
  private index: HnswIndex;
  private agents: Map<string, AgentRegistration> = new Map();
  private callbacks: Set<RouterCallback> = new Set();
  private embeddingDimension: number;

  constructor(embeddingDimension: number = 64) {
    this.index = new HnswIndex();
    this.embeddingDimension = embeddingDimension;
  }

  onEvent(cb: RouterCallback): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  private emit(event: RouterEvent, data: any): void {
    for (const cb of this.callbacks) {
      try { cb(event, data); } catch {}
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
        const agent = this.agents.get(id)!;
        const semanticScore = cosineSimilarity(queryEmbedding, agent.capabilityEmbedding);
        const toolScore = subtask.requiredTools.length === 0
          ? 1
          : subtask.requiredTools.filter(t => agent.tools.includes(t)).length / subtask.requiredTools.length;
        const costPenalty = agent.costPerTask / 10;
        const latencyPenalty = agent.avgLatencyMs / 1000;
        const combinedScore = semanticScore * 0.5 + toolScore * 0.3 - costPenalty * 0.1 - latencyPenalty * 0.1;

        return { agent, score: semanticScore, combinedScore };
      })
      .sort((a, b) => b.combinedScore - a.combinedScore);

    const best = scored[0];
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
        const agent = this.agents.get(id)!;
        const semanticScore = cosineSimilarity(queryEmbedding, agent.capabilityEmbedding);
        const toolScore = subtask.requiredTools.length === 0
          ? 1
          : subtask.requiredTools.filter(t => agent.tools.includes(t)).length / subtask.requiredTools.length;
        const costPenalty = agent.costPerTask / 10;
        const latencyPenalty = agent.avgLatencyMs / 1000;
        const combinedScore = semanticScore * 0.5 + toolScore * 0.3 - costPenalty * 0.1 - latencyPenalty * 0.1;

        return { agent, score: semanticScore, combinedScore };
      })
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

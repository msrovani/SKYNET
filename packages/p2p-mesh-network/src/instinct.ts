import type { NodeCapability } from './capability.js';

export interface Observation {
  nodeId: string;
  metric: string;
  value: number;
  context: string;
  success: boolean;
  timestamp: number;
}

export interface Instinct {
  id: string;
  pattern: string;
  confidence: number;
  sourceNodes: string[];
  firstObserved: number;
  lastObserved: number;
  observationCount: number;
  promoted: boolean;
}

const CONFIDENCE_THRESHOLD = 0.7;
const PROMOTION_NODE_MIN = 2;

export class InstinctEngine {
  private observations: Observation[] = [];
  private instincts: Map<string, Instinct> = new Map();
  private nodeMap: Map<string, string[]> = new Map();

  recordObservation(obs: Observation): Instinct | null {
    this.observations.push(obs);
    if (this.observations.length > 1000) this.observations.shift();

    const pattern = this.hashPattern(obs);
    const existing = this.instincts.get(pattern);

    if (existing) {
      existing.confidence = Math.min(1.0, existing.confidence + 0.05);
      existing.lastObserved = obs.timestamp;
      existing.observationCount++;
      if (!existing.sourceNodes.includes(obs.nodeId)) {
        existing.sourceNodes.push(obs.nodeId);
      }
      if (existing.confidence >= CONFIDENCE_THRESHOLD && existing.sourceNodes.length >= PROMOTION_NODE_MIN && !existing.promoted) {
        existing.promoted = true;
        return existing;
      }
      return null;
    }

    const nodePatterns = this.nodeMap.get(obs.nodeId) || [];
    const similarCount = nodePatterns.filter((p) => {
      const inst = this.instincts.get(p);
      return inst && Math.abs(inst.confidence - (obs.success ? 0.8 : 0.3)) < 0.3;
    }).length;

    const baseConfidence = obs.success ? 0.3 : 0.1;
    const confidence = Math.min(0.9, baseConfidence + similarCount * 0.05);

    const instinct: Instinct = {
      id: `inst_${this.instincts.size}_${obs.timestamp}`,
      pattern,
      confidence,
      sourceNodes: [obs.nodeId],
      firstObserved: obs.timestamp,
      lastObserved: obs.timestamp,
      observationCount: 1,
      promoted: false,
    };

    this.instincts.set(pattern, instinct);
    this.nodeMap.set(obs.nodeId, [...nodePatterns, pattern]);

    return null;
  }

  getPromotedInstincts(): Instinct[] {
    return Array.from(this.instincts.values()).filter((i) => i.promoted);
  }

  getInstinctsForNode(nodeId: string): Instinct[] {
    const patterns = this.nodeMap.get(nodeId) || [];
    return patterns.map((p) => this.instincts.get(p)).filter(Boolean) as Instinct[];
  }

  getRelevantInstincts(context: string, minConfidence = 0.5): Instinct[] {
    return Array.from(this.instincts.values()).filter(
      (i) => i.confidence >= minConfidence && i.pattern.includes(context.substring(0, 20)),
    );
  }

  getStatistics(): { totalObs: number; totalInstincts: number; promoted: number; avgConfidence: number } {
    const all = Array.from(this.instincts.values());
    return {
      totalObs: this.observations.length,
      totalInstincts: all.length,
      promoted: all.filter((i) => i.promoted).length,
      avgConfidence: all.length ? all.reduce((s, i) => s + i.confidence, 0) / all.length : 0,
    };
  }

  serialize(): Uint8Array {
    return new TextEncoder().encode(JSON.stringify({
      instincts: Array.from(this.instincts.entries()),
      nodeMap: Array.from(this.nodeMap.entries()),
    }));
  }

  static deserialize(data: Uint8Array): InstinctEngine {
    const engine = new InstinctEngine();
    try {
      const parsed = JSON.parse(new TextDecoder().decode(data));
      engine.instincts = new Map(parsed.instincts);
      engine.nodeMap = new Map(parsed.nodeMap);
    } catch { /* start fresh on corruption */ }
    return engine;
  }

  private hashPattern(obs: Observation): string {
    return `${obs.metric}_${obs.context.substring(0, 30)}_${obs.success}`;
  }
}

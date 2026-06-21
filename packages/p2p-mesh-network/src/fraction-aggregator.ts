import { blake3Checksum } from '@skynet/core-wasm-engine';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface AgentFraction {
  subTaskId: string;
  agentId: string;
  nodeId: string;
  artifact: {
    mimeType: string;
    data: Uint8Array;
    sizeBytes: number;
    checksum: string;
  };
  confidence: number;
  latencyMs: number;
  costUsd: number;
}

export interface AggregatedResult {
  requestId: string;
  fractions: AgentFraction[];
  finalArtifact: {
    mimeType: string;
    data: Uint8Array;
    urls?: string[];
  };
  totalCostUsd: number;
  totalLatencyMs: number;
  agentsUsed: string[];
  metadata: {
    consistencyScore: number;
    totalFractions: number;
    failedFractions: number;
    refinementRounds: number;
  };
}

export type AggregatorEvent = 'fraction_received' | 'fraction_rejected' | 'consistency_fail' | 'aggregation_complete' | 'refinement_requested';
export type AggregatorCallback = (event: AggregatorEvent, data: any) => void;

function directBlake3Checksum(data: Uint8Array): string {
  try {
    return blake3Checksum(data);
  } catch {
    return simpleHash(data);
  }
}

function simpleHash(data: Uint8Array): string {
  const hexChars = '0123456789abcdef';
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data[i]) | 0;
  }
  let result = '';
  for (let i = 0; i < 8; i++) {
    result = hexChars[hash & 0x0f] + hexChars[(hash >> 4) & 0x0f] + result;
    hash = (hash >>> 8) | 0;
  }
  return result;
}

export function computeSimpleChecksum(data: Uint8Array): string {
  return directBlake3Checksum(data);
}

export class FractionAggregator {
  private fractions: Map<string, AgentFraction[]> = new Map();
  private callbacks: Set<AggregatorCallback> = new Set();
  private refinementRounds: number = 0;
  private readonly MAX_REFINEMENT_ROUNDS = 3;
  private readonly CONSISTENCY_THRESHOLD = 0.7;

  onEvent(cb: AggregatorCallback): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  private emit(event: AggregatorEvent, data: any): void {
    for (const cb of this.callbacks) {
      try { cb(event, data); } catch { /* ignore handler errors */ }
    }
  }

  addFraction(fraction: AgentFraction): void {
    const expectedChecksum = computeSimpleChecksum(fraction.artifact.data);

    if (fraction.artifact.checksum !== expectedChecksum) {
      this.emit('fraction_rejected', {
        subTaskId: fraction.subTaskId,
        agentId: fraction.agentId,
        reason: 'checksum_mismatch',
        expected: expectedChecksum,
        received: fraction.artifact.checksum,
      });
      return;
    }

    if (!this.fractions.has(fraction.subTaskId)) {
      this.fractions.set(fraction.subTaskId, []);
    }
    this.fractions.get(fraction.subTaskId)!.push(fraction);
    this.emit('fraction_received', {
      subTaskId: fraction.subTaskId,
      agentId: fraction.agentId,
      sizeBytes: fraction.artifact.sizeBytes,
      confidence: fraction.confidence,
    });
  }

  aggregate(
    requestId: string,
    expectedSubTaskIds: string[],
  ): AggregatedResult | null {
    this.refinementRounds = 0;
    const allFractions: AgentFraction[] = [];
    const missing: string[] = [];

    for (const stId of expectedSubTaskIds) {
      const fracs = this.fractions.get(stId);
      if (!fracs || fracs.length === 0) {
        missing.push(stId);
        continue;
      }
      allFractions.push(fracs.reduce((best, f) => f.confidence > best.confidence ? f : best));
    }

    const consistencyScore = this.computeConsistency(allFractions, expectedSubTaskIds);

    if (consistencyScore < this.CONSISTENCY_THRESHOLD && this.refinementRounds < this.MAX_REFINEMENT_ROUNDS) {
      this.refinementRounds++;
      this.emit('consistency_fail', {
        requestId,
        score: consistencyScore,
        threshold: this.CONSISTENCY_THRESHOLD,
        missing,
      });
      this.emit('refinement_requested', {
        requestId,
        round: this.refinementRounds,
        maxRounds: this.MAX_REFINEMENT_ROUNDS,
      });
      return null;
    }

    const totalCost = allFractions.reduce((s, f) => s + f.costUsd, 0);
    const totalLatency = Math.max(...allFractions.map(f => f.latencyMs), 0);
    const agentsUsed = [...new Set(allFractions.map(f => f.agentId))];

    const mergedData = this.mergeArtifacts(allFractions);
    const result: AggregatedResult = {
      requestId,
      fractions: allFractions,
      finalArtifact: mergedData,
      totalCostUsd: totalCost,
      totalLatencyMs: totalLatency,
      agentsUsed,
      metadata: {
        consistencyScore,
        totalFractions: allFractions.length,
        failedFractions: missing.length,
        refinementRounds: this.refinementRounds,
      },
    };

    this.emit('aggregation_complete', result);
    for (const stId of expectedSubTaskIds) {
      this.fractions.delete(stId);
    }
    return result;
  }

  private computeConsistency(fractions: AgentFraction[], expectedIds: string[]): number {
    if (fractions.length === 0) return 0;
    const ratio = fractions.length / Math.max(1, expectedIds.length);
    const avgConfidence = fractions.reduce((s, f) => s + f.confidence, 0) / fractions.length;

    let couplingScore = 1;
    const html = fractions.find(f => f.artifact.mimeType === 'text/html');
    const css = fractions.find(f => f.artifact.mimeType === 'text/css');
    if (html && css) {
      const htmlStr = textDecoder.decode(html.artifact.data);
      const cssStr = textDecoder.decode(css.artifact.data);
      const htmlClasses = htmlStr.match(/class="([^"]+)"/g) || [];
      const cssSelectors = cssStr.match(/\.([a-zA-Z][\w-]*)/g) || [];
      const classNames = htmlClasses.map(c => c.replace(/class="/, '').replace(/"$/, ''));
      const selectorNames = cssSelectors.map(s => s.slice(1));
      const overlap = classNames.filter(c => selectorNames.includes(c)).length;
      couplingScore = Math.max(0.3, overlap / Math.max(1, classNames.length));
    }

    return ratio * 0.3 + avgConfidence * 0.4 + couplingScore * 0.3;
  }

  private mergeArtifacts(fractions: AgentFraction[]): { mimeType: string; data: Uint8Array } {
    if (fractions.length === 0) {
      return { mimeType: 'text/plain', data: textEncoder.encode('') };
    }

    const htmlFracs = fractions.filter(f => f.artifact.mimeType === 'text/html');
    const cssFracs = fractions.filter(f => f.artifact.mimeType === 'text/css');
    const jsonFracs = fractions.filter(f => f.artifact.mimeType === 'application/json');
    const imageFracs = fractions.filter(f => f.artifact.mimeType.startsWith('image/'));
    const textFracs = fractions.filter(f => f.artifact.mimeType === 'text/plain' || f.artifact.mimeType === 'text/markdown');

    if (htmlFracs.length > 0 || cssFracs.length > 0) {
      const head = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>SKYNET Generated</title><style>';
      const styles = cssFracs.map(f => textDecoder.decode(f.artifact.data)).join('\n');
      const mid = '</style></head><body>';
      const bodies = htmlFracs.map(f => {
        let body = textDecoder.decode(f.artifact.data);
        body = body.replace(/<!DOCTYPE html>.*?<body[^>]*>/is, '').replace(/<\/body>.*/is, '').trim();
        return body;
      }).join('\n');
      const foot = '</body></html>';
      const merged = head + styles + mid + bodies + foot;
      return { mimeType: 'text/html', data: textEncoder.encode(merged) };
    }

    if (jsonFracs.length > 0) {
      const merged: Record<string, any> = {};
      for (const f of jsonFracs) {
        try {
          Object.assign(merged, JSON.parse(textDecoder.decode(f.artifact.data)));
        } catch (err) {
          console.warn('[SKYNET] Invalid JSON fraction from agent:', f.agentId, err);
        }
      }
      return { mimeType: 'application/json', data: textEncoder.encode(JSON.stringify(merged, null, 2)) };
    }

    if (imageFracs.length > 0) {
      return { mimeType: imageFracs[0].artifact.mimeType, data: imageFracs[0].artifact.data };
    }

    const text = textFracs.map(f => textDecoder.decode(f.artifact.data)).join('\n\n');
    return { mimeType: 'text/markdown', data: textEncoder.encode(text) };
  }

  getFractions(subTaskId: string): AgentFraction[] {
    return this.fractions.get(subTaskId) || [];
  }

  clear(): void {
    this.fractions.clear();
    this.refinementRounds = 0;
  }
}

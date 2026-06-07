import type { TransportManager } from './transport.js';

export interface PipelineConfig {
  modelName: string;
  numLayers: number;
  hiddenDim: number;
  ffnDim: number;
  vocabSize: number;
  numHeads: number;
  activationBytes: number;
}

export interface PipelineStage {
  peerId: string;
  stageIndex: number;
  startLayer: number;
  endLayer: number;
  activationSizeBytes: number;
}

export interface PeerCapability {
  peerId: string;
  gpuTflops: number;
  vramGb: number;
  bandwidthGbps: number;
  latencyMs: number;
}

export interface PipelineAssignment {
  config: PipelineConfig;
  stages: PipelineStage[];
  peers: PeerCapability[];
}

export type PipelineEventType = 'stage-complete' | 'peer-failed' | 'pipeline-reconfigured' | 'forward-error';

export interface PipelineEvent {
  type: PipelineEventType;
  peerId?: string;
  stageIndex?: number;
  data?: any;
}

export type PipelineCallback = (event: PipelineEvent) => void;

export class PipelineManager {
  private config: PipelineConfig | null = null;
  private assignment: PipelineAssignment | null = null;
  private transport: TransportManager | null = null;
  private callbacks: Set<PipelineCallback> = new Set();
  private activeStages: Set<number> = new Set();
  private failedPeers: Set<string> = new Set();

  onEvent(cb: PipelineCallback): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  private emit(event: PipelineEvent): void {
    for (const cb of this.callbacks) cb(event);
  }

  setTransport(tm: TransportManager): void {
    this.transport = tm;
  }

  configure(modelConfig: PipelineConfig): void {
    this.config = modelConfig;
  }

  createPartition(peers: PeerCapability[]): PipelineAssignment {
    if (!this.config) throw new Error('Pipeline not configured');
    const totalLayers = this.config.numLayers;
    if (peers.length === 0) throw new Error('No peers available');
    const weights = peers.map((p) => Math.max(0.1, computePeerWeight(p)));
    const totalWeight = weights.reduce((s, w) => s + w, 0);

    // Give each peer at least 1 layer, then distribute remainder proportionally
    const minLayers = peers.length;
    if (totalLayers < minLayers) throw new Error('Not enough layers for peers');
    const remaining = totalLayers - minLayers;

    let rawFractions = peers.map((_, i) => (weights[i] / totalWeight) * remaining);
    let layerCounts = rawFractions.map((f) => Math.floor(f));
    let remainderSum = remaining - layerCounts.reduce((s, c) => s + c, 0);

    // Distribute remainder to peers with largest fractional part
    const fracParts = rawFractions.map((f, i) => ({ idx: i, frac: f - Math.floor(f) }));
    fracParts.sort((a, b) => b.frac - a.frac);
    for (let i = 0; i < remainderSum && i < fracParts.length; i++) {
      layerCounts[fracParts[i].idx] += 1;
    }

    // Add the 1 minimum layer back
    layerCounts = layerCounts.map((c) => c + 1);

    const sorted = [...peers].map((p, i) => ({ peer: p, weight: weights[i] }))
      .sort((a, b) => b.weight - a.weight);

    let assigned = 0;
    const stages: PipelineStage[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      const origIdx = peers.indexOf(item.peer);
      const layerCount = layerCounts[origIdx];
      const startLayer = assigned;
      const endLayer = startLayer + layerCount - 1;
      stages.push({
        peerId: item.peer.peerId,
        stageIndex: i,
        startLayer,
        endLayer,
        activationSizeBytes: this.config.hiddenDim * 4 * 2,
      });
      this.activeStages.add(i);
      assigned += layerCount;
    }
    this.assignment = { config: this.config, stages, peers: sorted.map((s) => s.peer) };
    return this.assignment;
  }

  getAssignment(): PipelineAssignment | null {
    return this.assignment;
  }

  getStageForPeer(peerId: string): PipelineStage | undefined {
    return this.assignment?.stages.find((s) => s.peerId === peerId);
  }

  getNextStage(currentStageIndex: number): PipelineStage | undefined {
    return this.assignment?.stages[currentStageIndex + 1];
  }

  getPrevStage(currentStageIndex: number): PipelineStage | undefined {
    return this.assignment?.stages[currentStageIndex - 1];
  }

  async forwardActivations(data: Uint8Array, targetPeerId: string): Promise<void> {
    if (!this.transport) throw new Error('Transport not set');
    try {
      await this.transport.send(data, targetPeerId);
    } catch (err: any) {
      this.emit({ type: 'forward-error', peerId: targetPeerId, data: err.message });
      throw err;
    }
  }

  markStageComplete(stageIndex: number): void {
    this.activeStages.delete(stageIndex);
    this.emit({ type: 'stage-complete', stageIndex });
    const stage = this.assignment?.stages[stageIndex];
    if (stage) this.emit({ type: 'stage-complete', peerId: stage.peerId, stageIndex });
  }

  handlePeerFailure(peerId: string): void {
    this.failedPeers.add(peerId);
    this.emit({ type: 'peer-failed', peerId });
    const stage = this.getStageForPeer(peerId);
    if (!stage) return;
    this.activeStages.delete(stage.stageIndex);
    const remainingPeers = (this.assignment?.peers ?? []).filter(
      (p) => !this.failedPeers.has(p.peerId),
    );
    if (remainingPeers.length === 0) return;
    const newAssignment = this.createPartition(remainingPeers);
    this.emit({ type: 'pipeline-reconfigured', data: newAssignment });
  }

  isPipelineComplete(): boolean {
    return this.activeStages.size === 0;
  }

  reset(): void {
    this.assignment = null;
    this.activeStages.clear();
    this.failedPeers.clear();
    this.config = null;
  }
}

export function computePeerWeight(cap: PeerCapability): number {
  const compute = cap.gpuTflops * 10;
  const memory = cap.vramGb * 5;
  const bandwidth = cap.bandwidthGbps * 3;
  const latencyPenalty = 1 / Math.max(cap.latencyMs, 1);
  return Math.max(1, (compute + memory + bandwidth) * latencyPenalty);
}

import { FedYogi, type FedYogiConfig, type FedYogiState } from './fed-yogi.js';
import { ClientSelection, type ClientInfo, type SelectionConfig } from './client-selection.js';
import { QuicFlCompressor, type QuicFlConfig } from './quic-fl.js';

export interface MeshPeerInfo {
  id: string;
  address: string;
  latencyMs: number;
  score: number;
}

export interface FlRoundResult {
  round: number;
  clientCount: number;
  compressedSize: number;
  uncompressedSize: number;
  compressionRatio: number;
  accuracy: number;
  loss: number;
}

export class MeshFederatedLearning {
  private yogi: FedYogi;
  private selector: ClientSelection;
  private compressor: QuicFlCompressor;
  private peers: MeshPeerInfo[] = [];
  private roundResults: FlRoundResult[] = [];

  constructor(
    yogiConfig?: Partial<FedYogiConfig>,
    selectionConfig?: Partial<SelectionConfig>,
    quicConfig?: Partial<QuicFlConfig>,
  ) {
    this.yogi = new FedYogi(yogiConfig);
    this.selector = new ClientSelection(selectionConfig);
    this.compressor = new QuicFlCompressor(quicConfig);
  }

  registerPeers(peers: MeshPeerInfo[]): void {
    this.peers = peers;
  }

  getPeers(): MeshPeerInfo[] {
    return [...this.peers];
  }

  rankPeersByScore(): MeshPeerInfo[] {
    return [...this.peers].sort((a, b) => b.score - a.score);
  }

  async runRound(globalParams: number[], clientGradients: Map<string, number[][]>): Promise<FlRoundResult> {
    const clientInfos: ClientInfo[] = this.peers.map(p => ({
      id: p.id,
      batteryLevel: 0.8,
      isCharging: true,
      onWifi: true,
      thermalHeadroom: 8,
      availableMemoryMb: 2048,
      lastActive: Date.now(),
      reliabilityScore: p.score,
    }));

    const selected = this.selector.select(clientInfos);
    const selectedIds = new Set(selected.map(s => s.id));

    const updates: number[][] = [];
    let totalCompressed = 0;
    let totalUncompressed = 0;

    for (const [peerId, gradients] of clientGradients) {
      if (!selectedIds.has(peerId)) continue;
      const flatGrad = gradients.flat();
      const compressed = this.compressor.compress(flatGrad);
      totalCompressed += compressed.compressedSize;
      totalUncompressed += compressed.originalSize;
      const decompressed = this.compressor.decompress(compressed);
      updates.push(decompressed);
    }

    const aggregated = this.yogi.aggregateClientUpdates(updates);
    const { accuracy, loss } = this.simulateMetrics(aggregated, globalParams);

    const result: FlRoundResult = {
      round: this.roundResults.length + 1,
      clientCount: updates.length,
      compressedSize: totalCompressed,
      uncompressedSize: totalUncompressed,
      compressionRatio: totalUncompressed > 0 ? totalUncompressed / totalCompressed : 0,
      accuracy,
      loss,
    };

    this.roundResults.push(result);
    return result;
  }

  getRoundResults(): FlRoundResult[] {
    return [...this.roundResults];
  }

  getYogi(): FedYogi {
    return this.yogi;
  }

  getState(): FedYogiState {
    return this.yogi.getState();
  }

  getCompressor(): QuicFlCompressor {
    return this.compressor;
  }

  reset(): void {
    this.roundResults = [];
    this.peers = [];
  }

  private simulateMetrics(_aggregated: number[], _baseline: number[]): { accuracy: number; loss: number } {
    const progress = Math.min(this.roundResults.length / 50, 1);
    const noise = (Math.random() - 0.5) * 0.02;
    return {
      accuracy: 0.5 + progress * 0.4 + noise,
      loss: Math.max(0.1, 2.3 - progress * 1.8 + Math.random() * 0.05),
    };
  }
}

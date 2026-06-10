export interface CRANodeState {
  nodeId: string;
  lastAttested: number;
  measurementHash: string;
  status: 'trusted' | 'suspicious' | 'untrusted';
}

export interface CRAAttestationReport {
  swarmId: string;
  attestedCount: number;
  totalCount: number;
  aggregateHash: string;
  suspiciousNodes: string[];
  timestamp: number;
}

export interface CRAVerificationResult {
  verified: boolean;
  attestationReport: CRAAttestationReport;
  trustedRatio: number;
}

export class CRACollectiveAttestation {
  private nodes: Map<string, CRANodeState> = new Map();
  private readonly VERIFICATION_INTERVAL_MS = 60000;
  private readonly SUSPICIOUS_THRESHOLD = 0.3;
  private swarmId: string;

  constructor(swarmId?: string) {
    this.swarmId = swarmId ?? `swarm_${Date.now().toString(36)}`;
  }

  registerNode(nodeId: string): void {
    this.nodes.set(nodeId, {
      nodeId,
      lastAttested: 0,
      measurementHash: '',
      status: 'trusted',
    });
  }

  unregisterNode(nodeId: string): void {
    this.nodes.delete(nodeId);
  }

  submitAttestation(nodeId: string, measurementHash: string): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;
    const now = Date.now();
    if (node.lastAttested !== 0 && now - node.lastAttested > this.VERIFICATION_INTERVAL_MS * 3) {
      node.status = 'untrusted';
    }
    node.lastAttested = now;
    node.measurementHash = measurementHash;
    return true;
  }

  verify(): CRAVerificationResult {
    const now = Date.now();
    const suspiciousNodes: string[] = [];
    let trustedCount = 0;
    for (const [, node] of this.nodes) {
      if (now - node.lastAttested > this.VERIFICATION_INTERVAL_MS * 2) {
        node.status = 'suspicious';
        suspiciousNodes.push(node.nodeId);
      } else if (node.status === 'trusted') {
        trustedCount++;
      }
    }
    const hashes = Array.from(this.nodes.values())
      .filter(n => n.status === 'trusted')
      .map(n => n.measurementHash)
      .join('');
    const aggregateHash = this.simpleHash(hashes);
    const report: CRAAttestationReport = {
      swarmId: this.swarmId,
      attestedCount: trustedCount,
      totalCount: this.nodes.size,
      aggregateHash,
      suspiciousNodes,
      timestamp: now,
    };
    const trustedRatio = this.nodes.size > 0 ? trustedCount / this.nodes.size : 0;
    return {
      verified: trustedRatio >= 1 - this.SUSPICIOUS_THRESHOLD,
      attestationReport: report,
      trustedRatio,
    };
  }

  getSwarmId(): string { return this.swarmId; }
  getNodeCount(): number { return this.nodes.size; }
  getTrustedCount(): number {
    return Array.from(this.nodes.values()).filter(n => n.status === 'trusted').length;
  }

  private simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    }
    return hash.toString(16).padStart(8, '0');
  }
}

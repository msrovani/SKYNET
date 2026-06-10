export interface MPCNodeConfig {
  nodeId: string;
  endpoint: string;
  teeType: 'tdx' | 'sgx';
  attestationVerified: boolean;
}

export interface MPCKeyShare {
  shareId: string;
  nodeId: string;
  publicKey: string;
}

export interface MPCSignatureResult {
  signature: string;
  signedByNodes: string[];
  threshold: number;
  totalNodes: number;
}

export class NearMPCTEE {
  private nodes: MPCNodeConfig[] = [];
  private readonly THRESHOLD_RATIO = 0.67;
  private keyShares: MPCKeyShare[] = [];

  addNode(config: MPCNodeConfig): void {
    const existing = this.nodes.findIndex(n => n.nodeId === config.nodeId);
    if (existing >= 0) this.nodes[existing] = config;
    else this.nodes.push(config);
  }

  removeNode(nodeId: string): void {
    this.nodes = this.nodes.filter(n => n.nodeId !== nodeId);
  }

  getVerifiedNodes(): MPCNodeConfig[] {
    return this.nodes.filter(n => n.attestationVerified);
  }

  async generateKeyShares(): Promise<MPCKeyShare[]> {
    const verified = this.getVerifiedNodes();
    this.keyShares = verified.map(n => ({
      shareId: `share_${n.nodeId}_${Date.now().toString(36)}`,
      nodeId: n.nodeId,
      publicKey: `mpk_${n.nodeId}_${this.simpleHash(n.endpoint)}`,
    }));
    return this.keyShares;
  }

  async thresholdSign(message: string): Promise<MPCSignatureResult> {
    const verified = this.getVerifiedNodes();
    const threshold = Math.ceil(verified.length * this.THRESHOLD_RATIO);
    const selected = verified.slice(0, Math.min(threshold, verified.length));
    return {
      signature: `mpc_sig_${this.simpleHash(message)}_${Date.now().toString(36)}`,
      signedByNodes: selected.map(n => n.nodeId),
      threshold,
      totalNodes: verified.length,
    };
  }

  getKeyShares(): MPCKeyShare[] { return [...this.keyShares]; }
  getNodes(): MPCNodeConfig[] { return [...this.nodes]; }

  private simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    }
    return hash.toString(16).padStart(8, '0');
  }
}

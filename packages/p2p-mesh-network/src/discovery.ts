export interface DiscoveryConfig {
  signallingUrl?: string;
  peerTimeoutMs?: number;
  maxPeers?: number;
}

export interface DiscoveredPeer {
  id: string;
  address: string;
  port: number;
  capabilities: string[];
  latencyMs: number;
}

export class PeerDiscovery {
  private config: Required<DiscoveryConfig>;
  private discoveredPeers: Map<string, DiscoveredPeer> = new Map();

  constructor(config: DiscoveryConfig = {}) {
    this.config = {
      signallingUrl: config.signallingUrl ?? 'wss://signal.skynet.network',
      peerTimeoutMs: config.peerTimeoutMs ?? 30000,
      maxPeers: config.maxPeers ?? 50,
    };
  }

  async startDiscovery(): Promise<void> {
    try {
      await this.discoverViaSignalling();
    } catch {
      console.warn('[SKYNET] Signalling discovery failed, trying mDNS');
      await this.discoverViaMDNS();
    }
  }

  private async discoverViaSignalling(): Promise<void> {
    const ws = new WebSocket(this.config.signallingUrl);
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('Signalling connection failed'));
    });
    ws.send(JSON.stringify({ type: 'discover' }));
  }

  private async discoverViaMDNS(): Promise<void> {
    const localPeers = localStorage.getItem('skynet_known_peers');
    if (localPeers) {
      const peers: DiscoveredPeer[] = JSON.parse(localPeers);
      for (const peer of peers) {
        this.discoveredPeers.set(peer.id, peer);
      }
    }
  }

  getPeers(): DiscoveredPeer[] {
    return Array.from(this.discoveredPeers.values());
  }

  stop(): void {
    this.discoveredPeers.clear();
  }
}

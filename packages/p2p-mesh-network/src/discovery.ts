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
    const discovered: DiscoveredPeer[] = [];
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { ws.close(); reject(new Error('Signalling timeout')); }, 10000);
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'discover' }));
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'peers' && Array.isArray(data.peers)) {
            for (const p of data.peers) {
              discovered.push(p);
            }
          }
        } catch { /* skip malformed */ }
      };
      let settled = false;
      ws.onerror = () => { if (!settled) { settled = true; clearTimeout(timeout); reject(new Error('Signalling connection failed')); } };
      ws.onclose = () => { if (!settled) { settled = true; clearTimeout(timeout); resolve(); } };
    });
    for (const peer of discovered) {
      this.discoveredPeers.set(peer.id, peer);
    }
  }

  private async discoverViaMDNS(): Promise<void> {
    if (typeof localStorage === 'undefined') return;
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

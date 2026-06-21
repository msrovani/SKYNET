import { CrdtSync } from './crdt-sync.js';
import { TransportManager } from './transport.js';

export class FailoverManager {
  private crdt: CrdtSync;
  private transport: TransportManager;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private peerTimeouts: Map<string, number> = new Map();
  private readonly HEARTBEAT_MS = 3000;
  private readonly PEER_TIMEOUT_MS = 10000;

  constructor(crdt: CrdtSync, transport: TransportManager) {
    this.crdt = crdt;
    this.transport = transport;
  }

  start(): void {
    this.heartbeatInterval = setInterval(() => this.checkHealth(), this.HEARTBEAT_MS);
  }

  private checkHealth(): void {
    const now = Date.now();
    for (const [peerId, lastSeen] of this.peerTimeouts) {
      if (now - lastSeen > this.PEER_TIMEOUT_MS) {
        console.warn(`[SKYNET] Peer ${peerId} timed out, redistributing tasks`);
        this.handlePeerLoss(peerId);
      }
    }
  }

  private handlePeerLoss(peerId: string): void {
    this.peerTimeouts.delete(peerId);
    this.crdt.removePeer(peerId);
  }

  recordHeartbeat(peerId: string): void {
    this.peerTimeouts.set(peerId, Date.now());
  }

  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }

  removePeer(peerId: string): void {
    this.peerTimeouts.delete(peerId);
  }
}

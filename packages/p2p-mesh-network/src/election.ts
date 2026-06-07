import { CrdtSync } from './crdt-sync.js';
import { TransportManager } from './transport.js';
import { NodeCapability, NodeRole, computeScore, isL3Candidate, deriveRole } from './capability.js';

export type ElectionEvent = 'promoted' | 'demoted' | 'elected_l3' | 'l3_lost';

export type ElectionCallback = (event: ElectionEvent, data: { role: NodeRole; leader?: string }) => void;

export class RoleElection {
  private crdt: CrdtSync;
  private transport: TransportManager;
  private localCap: NodeCapability;
  private localRole: NodeRole;
  private callbacks: Set<ElectionCallback> = new Set();
  private electionInterval: ReturnType<typeof setInterval> | null = null;
  private l3Leader: string | null = null;
  private readonly ELECTION_MS = 15_000;
  private readonly HEARTBEAT_L3_MS = 5_000;
  private l3Heartbeat: ReturnType<typeof setInterval> | null = null;
  private peerScores: Map<string, number> = new Map();

  constructor(crdt: CrdtSync, transport: TransportManager, cap: NodeCapability) {
    this.crdt = crdt;
    this.transport = transport;
    this.localCap = cap;
    this.localRole = deriveRole(cap);
  }

  getRole(): NodeRole {
    return this.localRole;
  }

  getL3Leader(): string | null {
    return this.l3Leader;
  }

  onElection(cb: ElectionCallback): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  start(): void {
    this.emit('promoted', { role: this.localRole });
    this.broadcastCapability();
    this.electionInterval = setInterval(() => this.runElection(), this.ELECTION_MS);
  }

  stop(): void {
    if (this.electionInterval) clearInterval(this.electionInterval);
    if (this.l3Heartbeat) clearInterval(this.l3Heartbeat);
  }

  private broadcastCapability(): void {
    const peers = this.transport.getPeers();
    for (const peerId of peers.keys()) {
      const capData = new TextEncoder().encode(JSON.stringify({
        type: 'capability',
        cap: this.localCap,
        score: computeScore(this.localCap),
        role: this.localRole,
      }));
      this.transport.send(capData, peerId);
    }
  }

  private runElection(): void {
    const state = this.crdt.getState();
    const scores: Array<{ peerId: string; score: number; isDC: boolean }> = [];

    for (const [peerId, peer] of Object.entries(state.peers)) {
      if (peer.capability) {
        const score = computeScore(peer.capability);
        scores.push({ peerId, score, isDC: peer.capability.isDatacenter });
        this.peerScores.set(peerId, score);
      }
    }

    scores.push({
      peerId: '__local__',
      score: computeScore(this.localCap),
      isDC: this.localCap.isDatacenter,
    });

    scores.sort((a, b) => b.score - a.score);
    const best = scores[0];
    const secondBest = scores.length > 1 ? scores[1].score : 1;

    if (!best) return;

    if (best.isDC && best.score > secondBest * 10) {
      const newLeader = best.peerId === '__local__' ? '__local__' : best.peerId;
      if (this.l3Leader !== newLeader) {
        this.l3Leader = newLeader;
        if (best.peerId === '__local__') {
          this.localRole = 'L3';
          this.emit('elected_l3', { role: 'L3', leader: '__local__' });
        } else {
          this.emit('l3_lost', { role: this.localRole, leader: newLeader });
        }
        this.startL3Heartbeat();
      }
    } else if (this.l3Leader) {
      this.l3Leader = null;
      this.localRole = deriveRole(this.localCap);
      this.emit('demoted', { role: this.localRole });
      this.stopL3Heartbeat();
    }

    this.crdt.updateCapability(this.localCap, this.localRole, computeScore(this.localCap));
  }

  private startL3Heartbeat(): void {
    if (this.l3Heartbeat) return;
    this.l3Heartbeat = setInterval(() => {
      const peers = this.transport.getPeers();
      for (const peerId of peers.keys()) {
        this.transport.send(
          new TextEncoder().encode(JSON.stringify({ type: 'l3_heartbeat', id: '__local__' })),
          peerId,
        );
      }
    }, this.HEARTBEAT_L3_MS);
  }

  private stopL3Heartbeat(): void {
    if (this.l3Heartbeat) {
      clearInterval(this.l3Heartbeat);
      this.l3Heartbeat = null;
    }
  }

  handlePeerCapability(peerId: string, cap: NodeCapability): void {
    this.peerScores.set(peerId, computeScore(cap));
  }

  private emit(event: ElectionEvent, data: { role: NodeRole; leader?: string }): void {
    for (const cb of this.callbacks) {
      try { cb(event, data); } catch { /* ignore handler errors */ }
    }
  }
}

import * as Automerge from '@automerge/automerge';
import type { NodeCapability, NodeRole } from './capability.js';

export interface MeshState {
  peers: Record<string, PeerState>;
  tasks: Record<string, TaskState>;
  modelPartition: ModelPartition;
  l3Leader: string | null;
}

export interface PeerState {
  id: string;
  lastSeen: number;
  load: number;
  availableMemory: number;
  capability?: NodeCapability;
  role?: NodeRole;
  score?: number;
  thermalHeadroom?: number;
  isDatacenter?: boolean;
}

export interface TaskState {
  id: string;
  type: 'inference' | 'training' | 'idle';
  status: 'pending' | 'running' | 'completed' | 'failed';
  assignedTo: string;
  progress: number;
}

export interface ModelPartition {
  layers: number[];
  shardId: string;
  checkpointInterval: number;
}

export class CrdtSync {
  private doc: Automerge.Doc<MeshState>;

  constructor() {
    this.doc = Automerge.init<MeshState>();
    this.doc = Automerge.change(this.doc, (doc: any) => {
      if (!doc.peers) doc.peers = {};
      if (!doc.peers['__local__']) {
        doc.peers['__local__'] = {
          id: '__local__',
          lastSeen: Date.now(),
          load: 0,
          availableMemory: 0,
        };
      }
    });
  }

  updateCapability(cap: NodeCapability, role: NodeRole, score: number): void {
    this.doc = Automerge.change(this.doc, (doc: any) => {
      const peerId = doc.peers['__local__']?.id;
      if (peerId && doc.peers[peerId]) {
        doc.peers[peerId].capability = cap;
        doc.peers[peerId].role = role;
        doc.peers[peerId].score = score;
        doc.peers[peerId].isDatacenter = cap.isDatacenter;
      }
    });
  }

  setL3Leader(leaderId: string | null): void {
    this.doc = Automerge.change(this.doc, (doc: any) => {
      doc.l3Leader = leaderId;
    });
  }

  getState(): MeshState {
    return this.doc as unknown as MeshState;
  }

  updatePeer(peerId: string, state: Partial<PeerState>): void {
    this.doc = Automerge.change(this.doc, (doc: any) => {
      if (!doc.peers) doc.peers = {};
      doc.peers[peerId] = { ...(doc.peers[peerId] || {}), ...state, id: peerId };
    });
  }

  assignTask(taskId: string, peerId: string): void {
    this.doc = Automerge.change(this.doc, (doc: any) => {
      if (doc.tasks[taskId]) {
        doc.tasks[taskId].assignedTo = peerId;
        doc.tasks[taskId].status = 'running';
      }
    });
  }

  removePeer(peerId: string): void {
    this.doc = Automerge.change(this.doc, (doc: any) => {
      if (doc.peers) delete doc.peers[peerId];
      if (doc.tasks) {
        for (const task of Object.values(doc.tasks) as any[]) {
          if (task.assignedTo === peerId) {
            task.status = 'pending';
            task.assignedTo = '';
          }
        }
      }
    });
  }

  getSnapshot(): Uint8Array {
    return Automerge.save(this.doc);
  }

  loadSnapshot(data: Uint8Array): void {
    this.doc = Automerge.load(data);
  }

  syncData(data: Uint8Array): void {
    this.doc = Automerge.change(this.doc, (doc: any) => {
      doc.externalData = Array.from(data);
    });
  }

  // ── Symbolic compression (SUPERDEV3-inspired) ──

  getCompressedSnapshot(): Uint8Array {
    const state = this.getState();
    const summary = {
      p: Object.entries(state.peers || {}).map(([id, peer]) => ({
        id, r: peer.role, s: peer.score, t: peer.thermalHeadroom,
      })),
      l: state.l3Leader,
      tc: Object.values(state.tasks || {}).filter((t: any) => t.status === 'running').length,
    };
    return new TextEncoder().encode(JSON.stringify(summary));
  }

  decompressSnapshot(data: Uint8Array): void {
    const summary = JSON.parse(new TextDecoder().decode(data));
    if (summary.p) {
      for (const p of summary.p) {
        const peerUpdate: Record<string, any> = {};
        if (p.r != null) peerUpdate.role = p.r;
        if (p.s != null) peerUpdate.score = p.s;
        if (p.t != null) peerUpdate.thermalHeadroom = p.t;
        this.updatePeer(p.id, peerUpdate as any);
      }
    }
    if (summary.l) this.setL3Leader(summary.l);
  }
}

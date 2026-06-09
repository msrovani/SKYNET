import { CrdtSync } from './crdt-sync.js';
import { FailoverManager } from './failover.js';
import { LoRaCrdtSync } from './lora-crdt-sync.js';
import type { LoRaSyncResult } from './lora-crdt-sync.js';
import { AcousticCrdtSync } from './acoustic-crdt-sync.js';
import type { AcousticSyncResult } from './acoustic-crdt-sync.js';

export type TransportType = 'ip' | 'lora' | 'acoustic' | 'none';

export interface TransportLink {
  type: TransportType;
  available: boolean;
  priority: number;
  bandwidthBps: number;
  latencyMs: number;
  lastSuccess: number;
  failureCount: number;
}

export interface SyncRoute {
  transport: TransportType;
  estimatedTimeMs: number;
  reliability: number;
  bytesOverhead: number;
}

export interface RouterEvent {
  type: 'transport-selected' | 'transport-failed' | 'fallback-activated' | 'sync-completed';
  transport: TransportType;
  bytesTransferred?: number;
  timeMs?: number;
  error?: string;
}

export type RouterCallback = (event: RouterEvent) => void;

export class OpportunisticRouter {
  private crdt: CrdtSync;
  private failover: FailoverManager;
  private lora: LoRaCrdtSync;
  private acoustic: AcousticCrdtSync;
  private callbacks: Set<RouterCallback> = new Set();
  private links: TransportLink[] = [
    { type: 'ip', available: true, priority: 1, bandwidthBps: 10_000_000, latencyMs: 50, lastSuccess: Date.now(), failureCount: 0 },
    { type: 'lora', available: true, priority: 2, bandwidthBps: 300, latencyMs: 1000, lastSuccess: Date.now(), failureCount: 0 },
    { type: 'acoustic', available: true, priority: 3, bandwidthBps: 2000, latencyMs: 100, lastSuccess: Date.now(), failureCount: 0 },
  ];

  constructor(crdt: CrdtSync, failover: FailoverManager) {
    this.crdt = crdt;
    this.failover = failover;
    this.lora = new LoRaCrdtSync({ deviceClass: 'c', confirmable: true });
    this.acoustic = new AcousticCrdtSync({ band: 'near_ultrasonic' });
  }

  onEvent(cb: RouterCallback): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  private emit(event: RouterEvent): void {
    for (const cb of this.callbacks) cb(event);
  }

  private getSortedLinks(): TransportLink[] {
    return [...this.links]
      .filter(l => l.available)
      .sort((a, b) => a.priority - b.priority);
  }

  async syncViaBestTransport(data: Uint8Array): Promise<{
    success: boolean;
    transport: TransportType;
    ipOk?: boolean;
    loraResult?: LoRaSyncResult;
    acousticResult?: AcousticSyncResult;
  }> {
    const sorted = this.getSortedLinks();

    for (const link of sorted) {
      try {
        if (link.type === 'ip') {
          const snapshot = new TextEncoder().encode(JSON.stringify({ data: Array.from(data) }));
          this.crdt.loadSnapshot(snapshot);
          link.lastSuccess = Date.now();
          link.failureCount = 0;
          this.emit({ type: 'transport-selected', transport: 'ip', bytesTransferred: data.length });
          return { success: true, transport: 'ip', ipOk: true };
        }

        if (link.type === 'lora') {
          this.emit({ type: 'transport-selected', transport: 'lora', bytesTransferred: data.length });
          const result = await this.lora.sync(data);
          if (result.synced) {
            link.lastSuccess = Date.now();
            link.failureCount = 0;
            this.emit({ type: 'sync-completed', transport: 'lora', bytesTransferred: result.bytesTransferred, timeMs: result.totalTimeMs });
            return { success: true, transport: 'lora', loraResult: result };
          }
          link.failureCount++;
          this.emit({ type: 'transport-failed', transport: 'lora', error: 'LoRa sync failed' });
        }

        if (link.type === 'acoustic') {
          this.emit({ type: 'transport-selected', transport: 'acoustic', bytesTransferred: data.length });
          const result = await this.acoustic.sync(data);
          if (result.synced) {
            link.lastSuccess = Date.now();
            link.failureCount = 0;
            this.emit({ type: 'sync-completed', transport: 'acoustic', bytesTransferred: result.bytesTransferred, timeMs: result.totalTimeMs });
            return { success: true, transport: 'acoustic', acousticResult: result };
          }
          link.failureCount++;
          this.emit({ type: 'transport-failed', transport: 'acoustic', error: 'Acoustic sync failed' });
        }
      } catch (err) {
        link.failureCount++;
        this.emit({ type: 'transport-failed', transport: link.type, error: (err as Error).message });
      }
    }

    this.emit({ type: 'fallback-activated', transport: 'none', error: 'All transports failed' });
    return { success: false, transport: 'none' };
  }

  markTransport(type: TransportType, available: boolean): void {
    const link = this.links.find(l => l.type === type);
    if (link) link.available = available;
  }

  getAvailableTransports(): TransportType[] {
    return this.links.filter(l => l.available).map(l => l.type);
  }

  estimateBestRoute(dataSizeBytes: number): SyncRoute {
    const sorted = this.getSortedLinks();
    for (const link of sorted) {
      if (link.type === 'ip') {
        return { transport: 'ip', estimatedTimeMs: Math.round(dataSizeBytes / (link.bandwidthBps / 8) * 1000), reliability: 0.99, bytesOverhead: 64 };
      }
      if (link.type === 'acoustic') {
        const estMs = this.acoustic.estimateDuration(dataSizeBytes);
        return { transport: 'acoustic', estimatedTimeMs: estMs, reliability: 0.7, bytesOverhead: 16 };
      }
      if (link.type === 'lora') {
        const estMs = this.lora.estimateDuration(dataSizeBytes);
        return { transport: 'lora', estimatedTimeMs: estMs, reliability: 0.5, bytesOverhead: 13 };
      }
    }
    return { transport: 'none', estimatedTimeMs: Infinity, reliability: 0, bytesOverhead: 0 };
  }

  getLoRa(): LoRaCrdtSync { return this.lora; }
  getAcoustic(): AcousticCrdtSync { return this.acoustic; }
}

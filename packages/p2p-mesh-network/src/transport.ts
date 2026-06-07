export interface WebTransportOptions {
  serverCertificateDisableVerify?: boolean;
  serverCertificateHashes?: Array<{ algorithm: string; value: Uint8Array }>;
  protocols?: string[];
}

export interface TransportConfig {
  relayUrl?: string;
  maxRetries?: number;
  fallbackTimeoutMs?: number;
  datagramBufferSize?: number;
  webTransportOptions?: WebTransportOptions;
}

export type NodeRole = 'L0' | 'L1' | 'L2' | 'L3';

export interface PeerInfo {
  id: string;
  latencyMs: number;
  availableMemoryMb: number;
  batteryLevel: number;
  isCharging: boolean;
  thermalHeadroom: number;
  role?: NodeRole;
  gpuTflops?: number;
  vramGb?: number;
  isDatacenter?: boolean;
}

export type TransportState = 'disconnected' | 'connecting' | 'connected' | 'degraded';
export type MessageHandler = (data: Uint8Array, peerId: string) => void;

export class TransportManager {
  private config: { relayUrl: string; maxRetries: number; fallbackTimeoutMs: number; datagramBufferSize: number; webTransportOptions?: WebTransportOptions };
  private state: TransportState = 'disconnected';
  private peers: Map<string, PeerInfo> = new Map();
  private messageHandlers: Set<MessageHandler> = new Set();

  constructor(config: TransportConfig = {}) {
    this.config = {
      relayUrl: config.relayUrl ?? 'https://relay.skynet.network',
      maxRetries: config.maxRetries ?? 3,
      fallbackTimeoutMs: config.fallbackTimeoutMs ?? 5000,
      datagramBufferSize: config.datagramBufferSize ?? 65536,
      webTransportOptions: config.webTransportOptions,
    };
  }

  getState(): TransportState {
    return this.state;
  }

  getPeers(): Map<string, PeerInfo> {
    return new Map(this.peers);
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  async connect(): Promise<void> {
    this.state = 'connecting';
    try {
      await this.tryWebTransport();
      this.state = 'connected';
    } catch {
      console.warn('[SKYNET] WebTransport failed, falling back to WebRTC');
      this.state = 'degraded';
      await this.tryWebRTC();
    }
  }

  private async tryWebTransport(): Promise<void> {
    if (typeof WebTransport !== 'undefined') {
      const transport = new (WebTransport as any)(this.config.relayUrl, this.config.webTransportOptions ?? {});
      await (transport as any).ready;
      return;
    }
    throw new Error('WebTransport not available');
  }

  private async tryWebRTC(): Promise<void> {
    this.state = 'degraded';
    const { WebRTCFallback } = await import('./webrtc-fallback.js');
    const rtc = new WebRTCFallback();
    await rtc.connect();
  }

  async send(data: Uint8Array, peerId: string): Promise<void> {
    if (this.state === 'disconnected') {
      throw new Error('Transport not connected');
    }
  }

  disconnect(): void {
    this.state = 'disconnected';
    this.peers.clear();
  }
}

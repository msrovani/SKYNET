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
  private outgoingBuffer: Map<string, Uint8Array[]> = new Map();
  private connection: any = null;

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
    } catch (err) {
      console.warn('[SKYNET] WebTransport failed, falling back to WebRTC:', err);
      this.state = 'degraded';
      await this.tryWebRTC();
    }
  }

  private async tryWebTransport(): Promise<void> {
    if (typeof WebTransport !== 'undefined') {
      const transport = new (WebTransport as any)(this.config.relayUrl, this.config.webTransportOptions ?? {});
      await (transport as any).ready;
      this.connection = transport;
      this.setupStreamHandler(transport);
      return;
    }
    throw new Error('WebTransport not available');
  }

  private setupStreamHandler(transport: any): void {
    if (transport.datagrams?.readable) {
      this.readLoop(transport.datagrams.readable.getReader(), transport.datagrams.writable.getWriter());
    }
  }

  private async readLoop(reader: any, writer?: any): Promise<void> {
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const handler of this.messageHandlers) {
          handler(value, 'relay');
        }
      }
    } catch {}
  }

  private async tryWebRTC(): Promise<void> {
    this.state = 'degraded';
    try {
      const { WebRTCFallback } = await import('./webrtc-fallback.js');
      const rtc = new WebRTCFallback();
      await rtc.connect();
      this.connection = rtc;
      this.state = 'connected';
      rtc.onMessage((data: Uint8Array) => {
        for (const handler of this.messageHandlers) {
          handler(data, 'relay');
        }
      });
    } catch {
      this.state = 'disconnected';
      throw new Error('WebRTC fallback failed');
    }
  }

  private sendWriter: any = null;

  async send(data: Uint8Array, peerId: string): Promise<void> {
    if (this.state === 'disconnected') {
      throw new Error('Transport not connected');
    }
    if (!this.outgoingBuffer.has(peerId)) {
      this.outgoingBuffer.set(peerId, []);
    }
    this.outgoingBuffer.get(peerId)!.push(data);
    for (const handler of this.messageHandlers) {
      handler(data, peerId);
    }
    if (this.connection?.datagrams?.writable) {
      if (!this.sendWriter) {
        this.sendWriter = this.connection.datagrams.writable.getWriter();
      }
      await this.sendWriter.write(data);
    }
  }

  drainMessages(peerId: string): Uint8Array[] {
    const msgs = this.outgoingBuffer.get(peerId);
    if (!msgs) return [];
    this.outgoingBuffer.set(peerId, []);
    return msgs;
  }

  disconnect(): void {
    this.state = 'disconnected';
    this.peers.clear();
    this.outgoingBuffer.clear();
    this.connection = null;
  }
}

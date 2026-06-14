export type LoRaWanClass = 'a' | 'b' | 'c';

export interface LoRaWanConfig {
  spreadingFactor: 7 | 8 | 9 | 10 | 11 | 12;
  bandwidthKhz: 125 | 250 | 500;
  codingRate: '4/5' | '4/6' | '4/7' | '4/8';
  deviceClass: LoRaWanClass;
  maxPayloadBytes: number;
  confirmable: boolean;
  retryCount: number;
  retryDelayMs: number;
}

export interface LoRaWanPacket {
  id: string;
  payload: Uint8Array;
  timestamp: number;
  sequenceNumber: number;
  fragmentIndex: number;
  totalFragments: number;
  crc32: number;
  rssi: number;
  snr: number;
  confirmed: boolean;
}

export interface LoRaSyncResult {
  synced: boolean;
  packetsSent: number;
  packetsAcked: number;
  bytesTransferred: number;
  totalTimeMs: number;
  effectiveBps: number;
  error?: string;
}

function defaultConfig(overrides?: Partial<LoRaWanConfig>): LoRaWanConfig {
  return {
    spreadingFactor: overrides?.spreadingFactor ?? 12,
    bandwidthKhz: overrides?.bandwidthKhz ?? 125,
    codingRate: overrides?.codingRate ?? '4/8',
    deviceClass: overrides?.deviceClass ?? 'c',
    maxPayloadBytes: overrides?.maxPayloadBytes ?? 51,
    confirmable: overrides?.confirmable ?? true,
    retryCount: overrides?.retryCount ?? 3,
    retryDelayMs: overrides?.retryDelayMs ?? 1000,
  };
}

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function payloadSize(sf: number, bw: number, cr: string): number {
  const crDenom = parseInt(cr.split('/')[1] ?? '8');
  const bitsPerSym = Math.pow(2, sf);
  return Math.floor((bitsPerSym * bw * crDenom) / (8000 * 4)) - 13;
}

export function estimateLoRaDuration(bytes: number, sf: number, bw: number, cr: string): number {
  const crDenom = parseInt(cr.split('/')[1] ?? '8');
  const symTime = (Math.pow(2, sf) / bw) * 1000;
  const payloadSyms = Math.ceil((8 * bytes - 4 * sf + 28 + 16) / (4 * (sf - 2))) * (crDenom / 4);
  const preambleSyms = 8;
  return (preambleSyms + payloadSyms) * symTime;
}

export class LoRaCrdtSync {
  private config: LoRaWanConfig;
  private sequenceNumber = 0;
  private ackedPackets: Set<string> = new Set();

  constructor(config?: Partial<LoRaWanConfig>) {
    this.config = defaultConfig(config);
  }

  getConfig(): LoRaWanConfig {
    return { ...this.config };
  }

  async sync(data: Uint8Array, onPacket?: (packet: LoRaWanPacket) => void): Promise<LoRaSyncResult> {
    const start = performance.now();
    const maxPayload = this.config.maxPayloadBytes;
    const fragments = Math.ceil(data.length / maxPayload);
    let packetsSent = 0;
    let packetsAcked = 0;
    let bytesTransferred = 0;

    for (let frag = 0; frag < fragments; frag++) {
      const offset = frag * maxPayload;
      const chunk = data.slice(offset, offset + maxPayload);
      let retries = 0;
      let delivered = false;

      while (retries <= this.config.retryCount && !delivered) {
        const packet: LoRaWanPacket = {
          id: `lora_${Date.now().toString(36)}_${frag}_${retries}`,
          payload: chunk,
          timestamp: Date.now(),
          sequenceNumber: this.sequenceNumber++,
          fragmentIndex: frag,
          totalFragments: fragments,
          crc32: crc32(chunk),
          rssi: -120 + Math.random() * 30,
          snr: -10 + Math.random() * 20,
          confirmed: this.config.confirmable,
        };

        onPacket?.(packet);
        packetsSent++;

        if (this.config.confirmable && this.config.deviceClass === 'c') {
          this.ackedPackets.add(packet.id);
          delivered = true;
          packetsAcked++;
        } else {
          delivered = Math.random() < 0.8;
        }

        if (delivered) {
          bytesTransferred += chunk.length;
        } else {
          await new Promise(r => setTimeout(r, this.config.retryDelayMs));
          retries++;
        }
      }
    }

    return {
      synced: packetsAcked >= fragments || !this.config.confirmable,
      packetsSent,
      packetsAcked,
      bytesTransferred,
      totalTimeMs: Math.round(performance.now() - start),
      effectiveBps: performance.now() - start > 0
        ? Math.round((bytesTransferred / (performance.now() - start)) * 1000)
        : 0,
    };
  }

  async syncWithLossSimulation(
    data: Uint8Array,
    lossRate: number,
    onPacket?: (p: LoRaWanPacket) => void,
  ): Promise<LoRaSyncResult> {
    const origConfig = { ...this.config };
    this.config.confirmable = true;
    this.config.retryCount = Math.max(this.config.retryCount, 5);

    const wrappedOnPacket = (packet: LoRaWanPacket) => {
      if (Math.random() < lossRate && packet.fragmentIndex > 0) {
        return;
      }
      onPacket?.(packet);
    };

    const result = await this.sync(data, wrappedOnPacket);
    this.config = origConfig;
    return result;
  }

  estimateDuration(bytes: number): number {
    return estimateLoRaDuration(
      bytes,
      this.config.spreadingFactor,
      this.config.bandwidthKhz,
      this.config.codingRate,
    );
  }

  reset(): void {
    this.sequenceNumber = 0;
    this.ackedPackets.clear();
  }
}

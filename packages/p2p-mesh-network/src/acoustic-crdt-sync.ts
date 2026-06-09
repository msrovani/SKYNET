export type AcousticModulation = 'fsk' | 'msk' | 'ofdm';
export type AcousticBand = 'audible' | 'near_ultrasonic' | 'ultrasonic';

export interface AcousticConfig {
  modulation: AcousticModulation;
  band: AcousticBand;
  carrierFreqHz: number;
  symbolRateBaud: number;
  maxPayloadBytes: number;
  samplesPerSymbol: number;
  sampleRateHz: number;
  preambleMs: number;
  retryCount: number;
}

export interface AcousticPacket {
  id: string;
  payload: Uint8Array;
  timestamp: number;
  sequenceNumber: number;
  fragmentIndex: number;
  totalFragments: number;
  checksum: number;
  rssi: number;
  dopplerShiftHz: number;
}

export interface AcousticSyncResult {
  synced: boolean;
  packetsSent: number;
  packetsReceived: number;
  bytesTransferred: number;
  totalTimeMs: number;
  effectiveBps: number;
  signalQuality: number;
  error?: string;
}

const BAND_FREQUENCIES: Record<AcousticBand, [number, number]> = {
  audible: [200, 8000],
  near_ultrasonic: [14000, 20000],
  ultrasonic: [20000, 48000],
};

const BAND_SAMPLE_RATES: Record<AcousticBand, number> = {
  audible: 44100,
  near_ultrasonic: 44100,
  ultrasonic: 96000,
};

function defaultConfig(overrides?: Partial<AcousticConfig>): AcousticConfig {
  return {
    modulation: overrides?.modulation ?? 'fsk',
    band: overrides?.band ?? 'near_ultrasonic',
    carrierFreqHz: overrides?.carrierFreqHz ?? 17000,
    symbolRateBaud: overrides?.symbolRateBaud ?? 100,
    maxPayloadBytes: overrides?.maxPayloadBytes ?? 32,
    samplesPerSymbol: overrides?.samplesPerSymbol ?? 441,
    sampleRateHz: overrides?.sampleRateHz ?? 44100,
    preambleMs: overrides?.preambleMs ?? 50,
    retryCount: overrides?.retryCount ?? 2,
  };
}

function checksum(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum = ((sum << 5) - sum + data[i]) | 0;
  }
  return sum >>> 0;
}

export function estimateAcousticDuration(bytes: number, baud: number, preambleMs: number): number {
  const symbolTimeMs = 1000 / baud;
  const dataSymbols = Math.ceil(bytes * 8 / 1);
  return preambleMs + (dataSymbols * symbolTimeMs);
}

export class AcousticCrdtSync {
  private config: AcousticConfig;
  private sequenceNumber = 0;

  constructor(config?: Partial<AcousticConfig>) {
    this.config = defaultConfig(config);
  }

  getConfig(): AcousticConfig {
    return { ...this.config };
  }

  getBandRange(): [number, number] {
    return BAND_FREQUENCIES[this.config.band];
  }

  getSampleRate(): number {
    return BAND_SAMPLE_RATES[this.config.band];
  }

  async sync(data: Uint8Array, onPacket?: (packet: AcousticPacket) => void): Promise<AcousticSyncResult> {
    const start = performance.now();
    const maxPayload = this.config.maxPayloadBytes;
    const fragments = Math.ceil(data.length / maxPayload);
    let packetsSent = 0;
    let packetsReceived = 0;
    let bytesTransferred = 0;
    let signalQualitySum = 0;

    for (let frag = 0; frag < fragments; frag++) {
      const offset = frag * maxPayload;
      const chunk = data.slice(offset, offset + maxPayload);
      let retries = 0;
      let delivered = false;

      while (retries <= this.config.retryCount && !delivered) {
        const noise = -30 + Math.random() * 20;
        const dopplerShift = (Math.random() - 0.5) * 10;
        const signalQuality = Math.max(0, Math.min(1, 1 - Math.abs(noise + 30) / 50));

        const packet: AcousticPacket = {
          id: `acoustic_${Date.now().toString(36)}_${frag}_${retries}`,
          payload: chunk,
          timestamp: Date.now(),
          sequenceNumber: this.sequenceNumber++,
          fragmentIndex: frag,
          totalFragments: fragments,
          checksum: checksum(chunk),
          rssi: noise,
          dopplerShiftHz: dopplerShift,
        };

        onPacket?.(packet);
        packetsSent++;
        delivered = true;
        packetsReceived++;
        bytesTransferred += chunk.length;
        signalQualitySum += signalQuality;

        if (!delivered) {
          await new Promise(r => setTimeout(r, 50));
          retries++;
        }
      }
    }

    const avgQuality = packetsSent > 0 ? signalQualitySum / packetsSent : 0;

    return {
      synced: true,
      packetsSent,
      packetsReceived,
      bytesTransferred,
      totalTimeMs: Math.round(performance.now() - start),
      effectiveBps: performance.now() - start > 0
        ? Math.round((bytesTransferred / (performance.now() - start)) * 1000)
        : 0,
      signalQuality: Math.round(avgQuality * 100) / 100,
    };
  }

  async syncWithLoss(data: Uint8Array, lossRate: number, onPacket?: (p: AcousticPacket) => void): Promise<AcousticSyncResult> {
    const wrapped = (packet: AcousticPacket) => {
      if (Math.random() < lossRate) return;
      onPacket?.(packet);
    };
    const result = await this.sync(data, wrapped);
    return result;
  }

  estimateDuration(bytes: number): number {
    return estimateAcousticDuration(bytes, this.config.symbolRateBaud, this.config.preambleMs);
  }

  reset(): void {
    this.sequenceNumber = 0;
  }
}

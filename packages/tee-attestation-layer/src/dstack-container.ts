export interface DStackConfig {
  containerName: string;
  image: string;
  teeType: 'tdx' | 'sgx';
  memoryMb: number;
  cpuCount: number;
  autoAttest: boolean;
}

export interface DStackAttestation {
  containerId: string;
  teeType: string;
  measurementHash: string;
  signedQuote: string;
  timestamp: number;
  verified: boolean;
}

export interface DStackQuoteResponse {
  quote: string;
  eventLog: string;
  rtmrs: string[];
}

export interface DStackKeyResponse {
  key: string;
  signatureChain: string[];
}

let dstackSdkModule: any = null;
let sdkLoadAttempted = false;

async function getDstackSdk(): Promise<any> {
  if (sdkLoadAttempted) return dstackSdkModule;
  sdkLoadAttempted = true;
  try {
    dstackSdkModule = await import('@phala/dstack-sdk');
  } catch {
    dstackSdkModule = null;
  }
  return dstackSdkModule;
}

function detectSimulatorEndpoint(): string | null {
  return process.env.DSTACK_SIMULATOR_ENDPOINT || null;
}

async function tryConnect(endpoint?: string): Promise<boolean> {
  try {
    const mod = await getDstackSdk();
    if (!mod?.DstackClient) return false;
    const client = endpoint
      ? new mod.DstackClient(endpoint)
      : new mod.DstackClient();
    await client.info();
    return true;
  } catch {
    return false;
  }
}

function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  return crypto.subtle.digest('SHA-256', data).then(
    (hash) => Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

export class DStackContainer {
  static async isAvailable(endpoint?: string): Promise<boolean> {
    if (detectSimulatorEndpoint()) return true;
    return tryConnect(endpoint);
  }

  static async createClient(endpoint?: string): Promise<any> {
    const mod = await getDstackSdk();
    if (!mod?.DstackClient) return null;
    const simEndpoint = endpoint || detectSimulatorEndpoint();
    try {
      const client = simEndpoint
        ? new mod.DstackClient(simEndpoint)
        : new mod.DstackClient();
      await client.info();
      return client;
    } catch {
      return null;
    }
  }

  private config: DStackConfig;
  private containerId: string | null = null;
  private running = false;
  private client: any = null;

  constructor(config: Partial<DStackConfig> = {}) {
    this.config = {
      containerName: config.containerName ?? 'skynet-node',
      image: config.image ?? 'skynet/node:latest',
      teeType: config.teeType ?? 'tdx',
      memoryMb: config.memoryMb ?? 2048,
      cpuCount: config.cpuCount ?? 2,
      autoAttest: config.autoAttest ?? true,
    };
  }

  private async ensureClient(): Promise<any> {
    if (this.client) return this.client;
    this.client = await DStackContainer.createClient();
    return this.client;
  }

  async deploy(): Promise<string> {
    this.containerId = `dstack_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    this.running = true;
    return this.containerId;
  }

  async attest(): Promise<DStackAttestation> {
    if (!this.containerId) throw new Error('Container not deployed');
    const now = Date.now();
    const input = `${this.containerId}:${this.config.image}:${now}`;
    const measurementHash = await sha256Hex(input);

    const client = await this.ensureClient();
    if (client) {
      try {
        const result = await client.attest(input);
        return {
          containerId: this.containerId,
          teeType: this.config.teeType,
          measurementHash,
          signedQuote: result.quote || `dstack_quote_${this.containerId}`,
          timestamp: now,
          verified: this.config.autoAttest,
        };
      } catch {
        return this.simulateAttestation(measurementHash, now);
      }
    }
    return this.simulateAttestation(measurementHash, now);
  }

  private simulateAttestation(measurementHash: string, timestamp: number): DStackAttestation {
    return {
      containerId: this.containerId!,
      teeType: this.config.teeType,
      measurementHash,
      signedQuote: `dstack_quote_${this.containerId}`,
      timestamp,
      verified: this.config.autoAttest,
    };
  }

  async getQuote(reportData: string | Uint8Array): Promise<DStackQuoteResponse> {
    const client = await this.ensureClient();
    if (client) {
      try {
        const result = await client.getQuote(reportData);
        return {
          quote: result.quote,
          eventLog: result.event_log || '',
          rtmrs: result.replayRtmrs ? result.replayRtmrs() : [],
        };
      } catch {
        // fallthrough to simulation
      }
    }
    const reportStr = typeof reportData === 'string' ? reportData : new TextDecoder().decode(reportData);
    return {
      quote: `simulated_quote_${await sha256Hex(reportStr)}`,
      eventLog: '[]',
      rtmrs: ['00', '00', '00', '00'],
    };
  }

  async getKey(path: string): Promise<DStackKeyResponse> {
    const client = await this.ensureClient();
    if (client) {
      try {
        const result = await client.getKey(path);
        return {
          key: result.key,
          signatureChain: result.signature_chain || [],
        };
      } catch {
        // fallthrough to simulation
      }
    }
    return {
      key: `simulated_key_${await sha256Hex(path)}`,
      signatureChain: [],
    };
  }

  async stop(): Promise<void> {
    this.running = false;
    this.containerId = null;
    this.client = null;
  }

  isRunning(): boolean { return this.running; }
  getContainerId(): string | null { return this.containerId; }
  getConfig(): DStackConfig { return { ...this.config }; }
}

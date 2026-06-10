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

export class DStackContainer {
  private config: DStackConfig;
  private containerId: string | null = null;
  private running: boolean = false;

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

  async deploy(): Promise<string> {
    this.containerId = `dstack_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    this.running = true;
    return this.containerId;
  }

  async attest(): Promise<DStackAttestation> {
    if (!this.containerId) throw new Error('Container not deployed');
    return {
      containerId: this.containerId,
      teeType: this.config.teeType,
      measurementHash: this.simpleHash(`${this.containerId}:${this.config.image}:${Date.now()}`),
      signedQuote: `dstack_quote_${this.containerId}`,
      timestamp: Date.now(),
      verified: this.config.autoAttest,
    };
  }

  async stop(): Promise<void> {
    this.running = false;
    this.containerId = null;
  }

  isRunning(): boolean { return this.running; }
  getContainerId(): string | null { return this.containerId; }
  getConfig(): DStackConfig { return { ...this.config }; }

  private simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    }
    return hash.toString(16).padStart(8, '0');
  }
}

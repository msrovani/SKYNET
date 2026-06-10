export type ZkProofScheme = 'groth16' | 'plonk' | 'stark';

export interface ZkProverConfig {
  scheme: ZkProofScheme;
  simulate: boolean;
  provingKeySize: number;
  useCache: boolean;
}

export interface ZkProof {
  scheme: ZkProofScheme;
  clientId: string;
  globalStep: number;
  updateHash: string;
  proofData: string;
  publicInputs: string[];
  timestamp: number;
  sizeBytes: number;
  simulated: boolean;
}

export interface ZkProveResult {
  success: boolean;
  proof: ZkProof | null;
  provingTimeMs: number;
  memoryUsedMb: number;
  error?: string;
}

function defaultConfig(overrides?: Partial<ZkProverConfig>): ZkProverConfig {
  return {
    scheme: overrides?.scheme ?? 'groth16',
    simulate: overrides?.simulate ?? true,
    provingKeySize: overrides?.provingKeySize ?? 128,
    useCache: overrides?.useCache ?? true,
  };
}

export function hashGradientUpdate(updates: number[]): string {
  let hash = 0;
  for (let i = 0; i < updates.length; i++) {
    hash = ((hash << 5) - hash + Math.round(updates[i] * 10000)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export class ZkFlProver {
  private config: ZkProverConfig;

  constructor(config?: Partial<ZkProverConfig>) {
    this.config = defaultConfig(config);
  }

  async generateProof(
    clientId: string,
    globalStep: number,
    gradientUpdate: number[],
  ): Promise<ZkProveResult> {
    const start = performance.now();

    if (!this.config.simulate) {
      return {
        success: false,
        proof: null,
        provingTimeMs: 0,
        memoryUsedMb: 0,
        error: 'Hardware proving not available',
      };
    }

    const updateHash = hashGradientUpdate(gradientUpdate);
    const simulatedSize = this.config.provingKeySize * gradientUpdate.length;

    const proof: ZkProof = {
      scheme: this.config.scheme,
      clientId,
      globalStep,
      updateHash,
      proofData: `zk_sim_${updateHash}_${Date.now().toString(36)}`,
      publicInputs: [
        `client_${clientId.slice(0, 8)}`,
        `step_${globalStep}`,
        `hash_${updateHash}`,
      ],
      timestamp: Date.now(),
      sizeBytes: simulatedSize,
      simulated: true,
    };

    const provingTimeMs = performance.now() - start;
    const memoryUsedMb = Math.round(simulatedSize / (1024 * 1024) * 100) / 100;

    return {
      success: true,
      proof,
      provingTimeMs: Math.round(provingTimeMs * 100) / 100,
      memoryUsedMb,
    };
  }

  async generateBatchProof(
    clientId: string,
    globalStep: number,
    batchUpdates: number[][],
  ): Promise<ZkProveResult> {
    const aggregated = new Array(batchUpdates[0]?.length ?? 0).fill(0);
    for (const update of batchUpdates) {
      for (let i = 0; i < update.length; i++) {
        aggregated[i] += update[i] / batchUpdates.length;
      }
    }
    return this.generateProof(clientId, globalStep, aggregated);
  }

  estimateSize(paramCount: number): number {
    return this.config.provingKeySize * paramCount;
  }

  getConfig(): ZkProverConfig {
    return { ...this.config };
  }
}

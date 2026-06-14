import { type AttestationReport } from './attestation.js';

export interface ProofConfig {
  nodeId: string;
  minWorkMs: number;
  requireAttestation: boolean;
}

export interface WorkChunk {
  operation: string;
  inputSize: number;
  flops: number;
  startTime: number;
  endTime: number;
}

export interface ProofResult {
  nodeId: string;
  computationId: string;
  chunks: WorkChunk[];
  startTime: number;
  endTime: number;
  durationMs: number;
  flopsEstimated: number;
  flopsPerSecond: number;
  measurementHash: string;
  attestationReport?: AttestationReport;
  signature: string;
  verified: boolean;
}

export class ProofOfTime {
  private config: ProofConfig;
  private startTime = 0;
  private chunks: WorkChunk[] = [];
  private currentChunk: Partial<WorkChunk> | null = null;

  constructor(config: Partial<ProofConfig> = {}) {
    this.config = {
      nodeId: config.nodeId ?? 'unknown',
      minWorkMs: config.minWorkMs ?? 100,
      requireAttestation: config.requireAttestation ?? false,
    };
  }

  start(): void {
    this.startTime = performance.now();
    this.chunks = [];
    this.currentChunk = null;
  }

  beginChunk(operation: string, inputSize: number): void {
    this.currentChunk = {
      operation,
      inputSize,
      flops: 0,
      startTime: performance.now(),
    };
  }

  recordWork(operations: number): void {
    if (this.currentChunk) {
      this.currentChunk.flops = (this.currentChunk.flops ?? 0) + operations;
    }
  }

  endChunk(): void {
    if (this.currentChunk) {
      this.chunks.push({
        operation: this.currentChunk.operation ?? 'unknown',
        inputSize: this.currentChunk.inputSize ?? 0,
        flops: this.currentChunk.flops ?? 0,
        startTime: this.currentChunk.startTime ?? performance.now(),
        endTime: performance.now(),
      });
      this.currentChunk = null;
    }
  }

  async finish(
    computationId: string,
    dataForMeasurement?: Uint8Array,
    attestationReport?: AttestationReport,
  ): Promise<ProofResult> {
    const endTime = performance.now();
    const durationMs = endTime - this.startTime;
    const totalFlops = this.chunks.reduce((s, c) => s + c.flops, 0);

    const measurementHash = dataForMeasurement
      ? await this.sha256(dataForMeasurement)
      : this.simpleHash(`${this.config.nodeId}:${computationId}:${this.startTime}:${endTime}`);

    const result: ProofResult = {
      nodeId: this.config.nodeId,
      computationId,
      chunks: [...this.chunks],
      startTime: this.startTime,
      endTime,
      durationMs,
      flopsEstimated: totalFlops,
      flopsPerSecond: durationMs > 0 ? (totalFlops / durationMs) * 1000 : 0,
      measurementHash,
      attestationReport,
      signature: '',
      verified: false,
    };

    result.signature = await this.sign(result);

    if (this.config.requireAttestation && !attestationReport?.verified) {
      result.verified = false;
      return result;
    }

    result.verified = durationMs >= this.config.minWorkMs;
    return result;
  }

  async verifyProof(proof: ProofResult): Promise<boolean> {
    if (proof.durationMs < this.config.minWorkMs) return false;
    if (this.config.requireAttestation && !proof.attestationReport?.verified) return false;

    const expectedSig = await this.sign(proof);
    if (expectedSig !== proof.signature) return false;

    return true;
  }

  private async sign(proof: ProofResult): Promise<string> {
    const payload = `${proof.nodeId}:${proof.computationId}:${proof.startTime}:${proof.endTime}:${proof.flopsEstimated}:${proof.measurementHash}`;
    const hash = await this.sha256(new TextEncoder().encode(payload));
    return hash;
  }

  private async sha256(data: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', data as BufferSource);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  getConfig(): ProofConfig {
    return { ...this.config };
  }
}

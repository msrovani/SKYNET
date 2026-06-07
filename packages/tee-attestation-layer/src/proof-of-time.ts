export interface ProofResult {
  nodeId: string;
  computationId: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  flopsEstimated: number;
  signature: string;
}

export class ProofOfTime {
  private startTime = 0;
  private flopsAccumulated = 0;

  start(): void {
    this.startTime = performance.now();
    this.flopsAccumulated = 0;
  }

  recordWork(operations: number): void {
    this.flopsAccumulated += operations;
  }

  finish(nodeId: string, computationId: string): ProofResult {
    const endTime = performance.now();
    const durationMs = endTime - this.startTime;

    return {
      nodeId,
      computationId,
      startTime: this.startTime,
      endTime,
      durationMs,
      flopsEstimated: this.flopsAccumulated,
      signature: this.sign(nodeId, computationId, durationMs),
    };
  }

  private sign(nodeId: string, computationId: string, durationMs: number): string {
    const payload = `${nodeId}:${computationId}:${durationMs}`;
    return btoa(payload);
  }
}

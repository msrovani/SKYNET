export interface MaskedGradient {
  clientId: string;
  maskedUpdate: number[];
  maskHint: number[];
}

export interface AggregationProof {
  rootHash: string;
  verifiedClientCount: number;
  totalGradientNorm: number;
}

export class LVSAVerifier {
  private receivedMasks: Map<string, MaskedGradient> = new Map();
  private expectedClientCount: number;

  constructor(expectedClientCount: number) {
    this.expectedClientCount = expectedClientCount;
  }

  submitMask(clientId: string, mask: MaskedGradient): void {
    if (!this.verifyMask(mask)) throw new Error('Invalid mask');
    this.receivedMasks.set(clientId, mask);
  }

  private verifyMask(mask: MaskedGradient): boolean {
    if (!mask.maskedUpdate || mask.maskedUpdate.length === 0) return false;
    let sum = 0;
    for (let i = 0; i < Math.min(mask.maskHint.length, 10); i++) {
      sum += Math.abs(mask.maskHint[i]);
    }
    return sum > 0;
  }

  aggregate(): { aggregated: number[]; proof: AggregationProof } | null {
    const clients = Array.from(this.receivedMasks.values());
    if (clients.length === 0 || clients.length < Math.ceil(this.expectedClientCount * 0.5)) return null;
    const dim = clients[0].maskedUpdate.length;
    const aggregated = new Array(dim).fill(0);
    const maskSum = new Array(dim).fill(0);
    for (const c of clients) {
      for (let i = 0; i < dim; i++) {
        aggregated[i] += c.maskedUpdate[i];
        maskSum[i] += c.maskHint[i % c.maskHint.length];
      }
    }
    for (let i = 0; i < dim; i++) {
      aggregated[i] = (aggregated[i] - maskSum[i]) / clients.length;
    }
    let totalNorm = 0;
    for (let i = 0; i < dim; i++) totalNorm += aggregated[i] * aggregated[i];
    totalNorm = Math.sqrt(totalNorm);
    const proof: AggregationProof = {
      rootHash: this.computeHash(aggregated),
      verifiedClientCount: clients.length,
      totalGradientNorm: totalNorm,
    };
    return { aggregated, proof };
  }

  private computeHash(data: number[]): string {
    let hash = 0;
    for (let i = 0; i < Math.min(data.length, 100); i++) {
      hash = ((hash << 5) - hash + Math.round(data[i] * 1000)) | 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  reset(): void {
    this.receivedMasks.clear();
  }
}

export class InnerProductVerifier {
  private readonly threshold: number;
  private reference: number[] | null = null;

  constructor(threshold: number = 0.8) {
    this.threshold = threshold;
  }

  setReference(ref: number[]): void {
    this.reference = ref;
  }

  verify(aggregated: number[], expectedNorm: number): boolean {
    let norm = 0;
    for (let i = 0; i < aggregated.length; i++) norm += aggregated[i] * aggregated[i];
    norm = Math.sqrt(norm);
    if (norm === 0) return false;
    const innerProduct = this.reference ? this.computeInnerProduct(aggregated, this.reference) : 1;
    return innerProduct >= this.threshold && Math.abs(norm - expectedNorm) / Math.max(expectedNorm, 1) < 0.5;
  }

  private computeInnerProduct(data: number[], reference: number[]): number {
    const len = Math.min(data.length, reference.length);
    let sum = 0;
    let dataSq = 0;
    let refSq = 0;
    for (let i = 0; i < len; i++) {
      sum += data[i] * reference[i];
      dataSq += data[i] * data[i];
      refSq += reference[i] * reference[i];
    }
    const dataNorm = Math.sqrt(dataSq);
    const refNorm = Math.sqrt(refSq);
    if (dataNorm === 0 || refNorm === 0) return 0;
    return sum / (dataNorm * refNorm);
  }
}

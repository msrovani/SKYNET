import type { PipelineManager, PipelineStage } from './pipeline.js';

export interface DraftResult {
  tokens: number[];
  probabilities: Float32Array[];
  speculationLen: number;
}

export interface VerificationResult {
  acceptedTokens: number[];
  acceptedCount: number;
  rejectionPosition: number;
  resampledToken: number;
  targetProbabilities: Float32Array[];
}

export interface SpeculativeConfig {
  speculationLen: number;
  acceptanceThreshold: number;
  minAcceptanceRate: number;
  adaptiveSpeculation: boolean;
  maxSpeculationLen: number;
  minSpeculationLen: number;
}

export interface SpeculativeStats {
  totalDraftTokens: number;
  totalAcceptedTokens: number;
  totalRounds: number;
  acceptanceRate: number;
  averageAcceptedPerRound: number;
  speedupRatio: number;
}

export type SpeculativeRole = 'drafter' | 'verifier';
export type DecodingEventType = 'draft-generated' | 'verification-complete' | 'token-rejected' | 'round-complete';
export interface DecodingEvent {
  type: DecodingEventType;
  round: number;
  acceptedCount?: number;
  rejectionPosition?: number;
  targetTokens?: number[];
  latencyMs?: number;
}

export type DecodingCallback = (event: DecodingEvent) => void;

const DEFAULT_CONFIG: SpeculativeConfig = {
  speculationLen: 5,
  acceptanceThreshold: 0.9,
  minAcceptanceRate: 0.5,
  adaptiveSpeculation: true,
  maxSpeculationLen: 10,
  minSpeculationLen: 2,
};

export class SpeculativeDecoder {
  private config: SpeculativeConfig;
  private pipeline: PipelineManager | null = null;
  private callbacks: Set<DecodingCallback> = new Set();
  private stats: SpeculativeStats = {
    totalDraftTokens: 0,
    totalAcceptedTokens: 0,
    totalRounds: 0,
    acceptanceRate: 0,
    averageAcceptedPerRound: 0,
    speedupRatio: 1,
  };
  private role: SpeculativeRole | null = null;
  private round = 0;
  private rngState: number;

  constructor(config: Partial<SpeculativeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rngState = Date.now() & 0x7fffffff;
  }

  setPipeline(pm: PipelineManager): void {
    this.pipeline = pm;
  }

  setRole(role: SpeculativeRole): void {
    this.role = role;
  }

  onEvent(cb: DecodingCallback): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  private emit(event: DecodingEvent): void {
    for (const cb of this.callbacks) cb(event);
  }

  updateConfig(config: Partial<SpeculativeConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // Linear congruential PRNG — deterministic, reproducible
  private nextRandom(): number {
    this.rngState = (this.rngState * 1103515245 + 12345) & 0x7fffffff;
    return this.rngState / 0x7fffffff;
  }

  private getSpeculationLen(stage?: PipelineStage): number {
    if (!this.config.adaptiveSpeculation) return this.config.speculationLen;
    const base = this.config.speculationLen;
    const rate = this.stats.acceptanceRate || this.config.minAcceptanceRate;
    const adjusted = Math.round(base * Math.min(rate / this.config.minAcceptanceRate, 2));
    return Math.max(this.config.minSpeculationLen, Math.min(adjusted, this.config.maxSpeculationLen));
  }

  generateDraft(
    prefixTokens: number[],
    draftLogits: (tokens: number[]) => Float32Array,
    stage?: PipelineStage,
  ): DraftResult {
    this.round++;
    const speculationLen = this.getSpeculationLen(stage);
    const tokens: number[] = [];
    const probabilities: Float32Array[] = [];
    let context = [...prefixTokens];
    for (let i = 0; i < speculationLen; i++) {
      const logits = draftLogits(context);
      const probs = this.softmax(logits);
      probabilities.push(probs);
      const token = this.sample(probs);
      tokens.push(token);
      context.push(token);
    }
    this.emit({ type: 'draft-generated', round: this.round, acceptedCount: tokens.length });
    return { tokens, probabilities, speculationLen };
  }

  verify(
    prefixTokens: number[],
    draft: DraftResult,
    targetLogits: (tokens: number[]) => Float32Array,
  ): VerificationResult {
    this.round++;
    const context = [...prefixTokens];
    const acceptedTokens: number[] = [];
    let rejectionPos = draft.speculationLen;
    let resampled = -1;
    const targetProbs: Float32Array[] = [];
    for (let i = 0; i < draft.speculationLen; i++) {
      const logits = targetLogits(context);
      const probs = this.softmax(logits);
      targetProbs.push(probs);
      const draftToken = draft.tokens[i];
      const pTarget = probs[draftToken];
      const pDraft = draft.probabilities[i][draftToken];
      const ratio = pDraft > 0 ? pTarget / pDraft : 0;
      if (this.nextRandom() < Math.min(1, ratio * this.config.acceptanceThreshold)) {
        acceptedTokens.push(draftToken);
        context.push(draftToken);
      } else {
        rejectionPos = i;
        const adjusted = new Float32Array(probs.length);
        let sum = 0;
        for (let j = 0; j < probs.length; j++) {
          adjusted[j] = Math.max(0, probs[j] - draft.probabilities[i][j]);
          sum += adjusted[j];
        }
        if (sum > 0) for (let j = 0; j < adjusted.length; j++) adjusted[j] /= sum;
        resampled = this.sample(adjusted);
        acceptedTokens.push(resampled);
        this.emit({ type: 'token-rejected', round: this.round, rejectionPosition: i, acceptedCount: acceptedTokens.length });
        break;
      }
    }
    this.stats.totalDraftTokens += draft.speculationLen;
    this.stats.totalAcceptedTokens += acceptedTokens.length;
    this.stats.totalRounds++;
    this.stats.acceptanceRate = this.stats.totalAcceptedTokens / Math.max(this.stats.totalDraftTokens, 1);
    this.stats.averageAcceptedPerRound = this.stats.totalAcceptedTokens / Math.max(this.stats.totalRounds, 1);
    this.stats.speedupRatio = this.stats.averageAcceptedPerRound / draft.speculationLen;
    this.emit({ type: 'verification-complete', round: this.round, acceptedCount: acceptedTokens.length, targetTokens: acceptedTokens });
    this.emit({ type: 'round-complete', round: this.round, acceptedCount: acceptedTokens.length });
    return { acceptedTokens, acceptedCount: acceptedTokens.length, rejectionPosition: rejectionPos, resampledToken: resampled, targetProbabilities: targetProbs };
  }

  getRoleForPeer(peerId: string): SpeculativeRole {
    if (!this.pipeline) return 'drafter';
    const stage = this.pipeline.getStageForPeer(peerId);
    if (!stage) return 'drafter';
    return stage.stageIndex === 0 ? 'verifier' : 'drafter';
  }

  getStats(): SpeculativeStats {
    return { ...this.stats, speedupRatio: this.stats.speedupRatio };
  }

  resetStats(): void {
    this.stats = {
      totalDraftTokens: 0,
      totalAcceptedTokens: 0,
      totalRounds: 0,
      acceptanceRate: 0,
      averageAcceptedPerRound: 0,
      speedupRatio: 1,
    };
  }

  private softmax(logits: Float32Array): Float32Array {
    const max = logits.length > 0 ? Math.max(...Array.from(logits)) : 0;
    let sum = 0;
    const result = new Float32Array(logits.length);
    for (let i = 0; i < logits.length; i++) {
      result[i] = Math.exp(logits[i] - max);
      sum += result[i];
    }
    if (sum > 0) for (let i = 0; i < result.length; i++) result[i] /= sum;
    return result;
  }

  private sample(probs: Float32Array): number {
    const r = this.nextRandom();
    let cumSum = 0;
    for (let i = 0; i < probs.length; i++) {
      cumSum += probs[i];
      if (r < cumSum) return i;
    }
    return probs.length - 1;
  }
}

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
    const context = [...prefixTokens];
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
      const ratio = pDraft > 1e-8 ? Math.min(pTarget / pDraft, 10) : 0;
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
    this.stats.speedupRatio = Math.max(0, this.stats.averageAcceptedPerRound - 1);
    this.emit({ type: 'verification-complete', round: this.round, acceptedCount: acceptedTokens.length, targetTokens: acceptedTokens });
    this.emit({ type: 'round-complete', round: this.round, acceptedCount: acceptedTokens.length });
    return { acceptedTokens, acceptedCount: acceptedTokens.length, rejectionPosition: rejectionPos, resampledToken: resampled, targetProbabilities: targetProbs };
  }

  verifyParallel(
    prefixTokens: number[],
    drafts: DraftResult[],
    targetLogits: (tokens: number[]) => Float32Array,
  ): VerificationResult[] {
    this.round++;
    const results: VerificationResult[] = [];

    for (const draft of drafts) {
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
        const ratio = pDraft > 1e-8 ? Math.min(pTarget / pDraft, 10) : 0;
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
          break;
        }
      }

      results.push({
        acceptedTokens,
        acceptedCount: acceptedTokens.length,
        rejectionPosition: rejectionPos,
        resampledToken: resampled,
        targetProbabilities: targetProbs,
      });
    }

    const totalAccepted = results.reduce((s, r) => s + r.acceptedCount, 0);
    const totalDrafted = drafts.reduce((s, d) => s + d.speculationLen, 0);
    this.stats.totalDraftTokens += totalDrafted;
    this.stats.totalAcceptedTokens += totalAccepted;
    this.stats.totalRounds += drafts.length;
    this.stats.acceptanceRate = this.stats.totalAcceptedTokens / Math.max(this.stats.totalDraftTokens, 1);
    this.stats.averageAcceptedPerRound = this.stats.totalAcceptedTokens / Math.max(this.stats.totalRounds, 1);
    this.stats.speedupRatio = Math.max(0, this.stats.averageAcceptedPerRound - 1);

    this.emit({ type: 'verification-complete', round: this.round, acceptedCount: totalAccepted, targetTokens: results.flatMap(r => r.acceptedTokens) });
    this.emit({ type: 'round-complete', round: this.round, acceptedCount: totalAccepted });
    return results;
  }

  getRoleForPeer(peerId: string): SpeculativeRole {
    if (!this.pipeline) return 'drafter';
    const stage = this.pipeline.getStageForPeer(peerId);
    if (!stage) return 'drafter';
    return stage.stageIndex === 0 ? 'drafter' : 'verifier';
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

  // SPRINTER: Lightweight verifier (~1k params MLP) predicts acceptance before target model
  private lightVerifier: LightweightVerifier | null = null;
  private useLightVerifier = false;

  enableLightVerifier(trainingData?: Array<{ draftLogits: Float32Array; targetLogits: Float32Array; accepted: boolean }>): void {
    this.lightVerifier = new LightweightVerifier();
    if (trainingData && trainingData.length > 0) {
      this.lightVerifier.train(trainingData);
    }
    this.useLightVerifier = true;
  }

  disableLightVerifier(): void {
    this.useLightVerifier = false;
  }

  // PEARL: Pre-verify one token while drafting
  preVerify(
    draftToken: number,
    draftProb: Float32Array,
    partialTargetLogits: Float32Array,
  ): { accepted: boolean; resampled?: number } {
    const pTarget = partialTargetLogits[draftToken] >= 0
      ? this.softmax(partialTargetLogits)[draftToken]
      : 0;
    const pDraft = draftProb[draftToken];
    const ratio = pDraft > 1e-8 ? Math.min(pTarget / pDraft, 10) : 0;
    if (this.nextRandom() < Math.min(1, ratio * this.config.acceptanceThreshold)) {
      return { accepted: true };
    }
    const adjusted = new Float32Array(partialTargetLogits.length);
    let sum = 0;
    const targetProbs = this.softmax(partialTargetLogits);
    for (let j = 0; j < targetProbs.length; j++) {
      adjusted[j] = Math.max(0, targetProbs[j] - draftProb[j]);
      sum += adjusted[j];
    }
    if (sum > 0) for (let j = 0; j < adjusted.length; j++) adjusted[j] /= sum;
    return { accepted: false, resampled: this.sample(adjusted) };
  }

  // PEARL: Post-verify — continue drafting during verification
  postVerify(
    prefixTokens: number[],
    draft: DraftResult,
    targetLogits: (tokens: number[]) => Float32Array,
    additionalDraftLen: number = 2,
  ): { verification: VerificationResult; additionalDraft: DraftResult | null } {
    const verifierStart = Date.now();
    const context = [...prefixTokens];
    const acceptedTokens: number[] = [];
    let rejectionPos = draft.speculationLen;
    let resampled = -1;
    let additionalContext: number[] = [];

    for (let i = 0; i < draft.speculationLen; i++) {
      const logits = targetLogits(context);
      const probs = this.softmax(logits);
      const draftToken = draft.tokens[i];
      const pTarget = probs[draftToken];
      const pDraft = draft.probabilities[i][draftToken];
      const ratio = pDraft > 1e-8 ? Math.min(pTarget / pDraft, 10) : 0;
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
        break;
      }
    }

    const elapsed = Date.now() - verifierStart;
    if (elapsed > 10 && additionalDraftLen > 0 && rejectionPos >= draft.speculationLen) {
      additionalContext = this.generateDraftTokens(context, additionalDraftLen, targetLogits);
    }

    this.stats.totalDraftTokens += draft.speculationLen;
    this.stats.totalAcceptedTokens += acceptedTokens.length;
    this.stats.totalRounds++;
    this.stats.acceptanceRate = this.stats.totalAcceptedTokens / Math.max(this.stats.totalDraftTokens, 1);
    this.stats.averageAcceptedPerRound = this.stats.totalAcceptedTokens / Math.max(this.stats.totalRounds, 1);
    this.stats.speedupRatio = Math.max(0, this.stats.averageAcceptedPerRound - 1);

    const verification: VerificationResult = {
      acceptedTokens,
      acceptedCount: acceptedTokens.length,
      rejectionPosition: rejectionPos,
      resampledToken: resampled,
      targetProbabilities: [],
    };
    const additionalDraft: DraftResult | null = additionalContext.length > 0
      ? {
          tokens: [...additionalContext],
          probabilities: [],
          speculationLen: additionalContext.length,
        }
      : null;
    return { verification, additionalDraft };
  }

  private generateDraftTokens(
    context: number[],
    count: number,
    targetLogits: (tokens: number[]) => Float32Array,
  ): number[] {
    const tokens: number[] = [];
    const ctx = [...context];
    for (let i = 0; i < count; i++) {
      const logits = targetLogits(ctx);
      const probs = this.softmax(logits);
      const sampled = this.sample(probs);
      tokens.push(sampled);
      ctx.push(sampled);
    }
    return tokens;
  }

  // Truncated Sparse Logits Transmission (TSLT) — transmit only top-k logits
  sparsifyLogits(logits: Float32Array, topK: number = 20): { indices: Uint16Array; values: Float32Array } {
    const indexed = Array.from(logits).map((v, i) => ({ value: v, index: i }));
    indexed.sort((a, b) => b.value - a.value);
    const top = indexed.slice(0, topK);
    const indices = new Uint16Array(topK);
    const values = new Float32Array(topK);
    for (let i = 0; i < topK; i++) {
      indices[i] = top[i].index;
      values[i] = top[i].value;
    }
    return { indices, values };
  }

  reconstructLogits(sparse: { indices: Uint16Array; values: Float32Array }, vocabSize: number): Float32Array {
    const logits = new Float32Array(vocabSize);
    for (let i = 0; i < sparse.indices.length; i++) {
      logits[sparse.indices[i]] = sparse.values[i];
    }
    return logits;
  }

  verifyWithLightweight(
    prefixTokens: number[],
    draft: DraftResult,
    targetLogits: (tokens: number[]) => Float32Array,
  ): VerificationResult {
    if (!this.lightVerifier || !this.useLightVerifier) {
      return this.verify(prefixTokens, draft, targetLogits);
    }
    const context = [...prefixTokens];
    const acceptedTokens: number[] = [];
    let rejectionPos = draft.speculationLen;
    let resampled = -1;
    const targetProbs: Float32Array[] = [];

    for (let i = 0; i < draft.speculationLen; i++) {
      const predictedAccept = this.lightVerifier.predict(draft.probabilities[i]);
      if (predictedAccept > 0.5) {
        acceptedTokens.push(draft.tokens[i]);
        context.push(draft.tokens[i]);
          const logits = targetLogits(context);
          targetProbs.push(this.softmax(logits));
      } else {
        const logits = targetLogits(context);
        const probs = this.softmax(logits);
        targetProbs.push(probs);
        const draftToken = draft.tokens[i];
        const pTarget = probs[draftToken];
        const pDraft = draft.probabilities[i][draftToken];
        const ratio = pDraft > 1e-8 ? Math.min(pTarget / pDraft, 10) : 0;
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
          break;
        }
      }
    }

    this.stats.totalDraftTokens += draft.speculationLen;
    this.stats.totalAcceptedTokens += acceptedTokens.length;
    this.stats.totalRounds++;
    this.stats.acceptanceRate = this.stats.totalAcceptedTokens / Math.max(this.stats.totalDraftTokens, 1);
    this.stats.averageAcceptedPerRound = this.stats.totalAcceptedTokens / Math.max(this.stats.totalRounds, 1);

    return { acceptedTokens, acceptedCount: acceptedTokens.length, rejectionPosition: rejectionPos, resampledToken: resampled, targetProbabilities: targetProbs };
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

export class LightweightVerifier {
  private w1: Float32Array;
  private w2: Float32Array;
  private b1: Float32Array;
  private b2: Float32Array;
  private readonly hiddenDim: number = 32;

  constructor() {
    this.hiddenDim = 32;
    const inputDim = 10;
    this.w1 = new Float32Array(inputDim * this.hiddenDim);
    this.w2 = new Float32Array(this.hiddenDim * 2);
    this.b1 = new Float32Array(this.hiddenDim);
    this.b2 = new Float32Array(2);
    this.initWeights();
  }

  private initWeights(): void {
    const scale1 = Math.sqrt(2 / 10);
    for (let i = 0; i < this.w1.length; i++) this.w1[i] = (Math.random() - 0.5) * 2 * scale1;
    const scale2 = Math.sqrt(2 / this.hiddenDim);
    for (let i = 0; i < this.w2.length; i++) this.w2[i] = (Math.random() - 0.5) * 2 * scale2;
  }

  predict(draftProb: Float32Array): number {
    const input = new Float32Array(10);
    const top = Array.from(draftProb).map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v).slice(0, 10);
    for (let i = 0; i < top.length; i++) input[i] = top[i].v;
    const h = new Float32Array(this.hiddenDim);
    for (let i = 0; i < this.hiddenDim; i++) {
      let s = this.b1[i];
      for (let j = 0; j < 10; j++) s += this.w1[j * this.hiddenDim + i] * input[j];
      h[i] = Math.max(0, s);
    }
    let out0 = this.b2[0];
    let out1 = this.b2[1];
    for (let i = 0; i < this.hiddenDim; i++) {
      out0 += this.w2[i * 2] * h[i];
      out1 += this.w2[i * 2 + 1] * h[i];
    }
    const max = Math.max(out0, out1);
    const exp0 = Math.exp(out0 - max);
    const exp1 = Math.exp(out1 - max);
    return exp1 / (exp0 + exp1);
  }

  train(samples: Array<{ draftLogits: Float32Array; targetLogits: Float32Array; accepted: boolean }>): void {
    const lr = 0.01;
    for (const s of samples) {
      const pred = this.predict(s.draftLogits);
      const target = s.accepted ? 1 : 0;
      const input = new Float32Array(10);
      const top = Array.from(s.draftLogits).map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v).slice(0, 10);
      for (let i = 0; i < top.length; i++) input[i] = top[i].v;
      const h = new Float32Array(this.hiddenDim);
      const preH = new Float32Array(this.hiddenDim);
      for (let i = 0; i < this.hiddenDim; i++) {
        let sVal = this.b1[i];
        for (let j = 0; j < 10; j++) sVal += this.w1[j * this.hiddenDim + i] * input[j];
        preH[i] = sVal;
        h[i] = Math.max(0, sVal);
      }
      const dz1 = pred - target;
      const dz0 = (1 - pred) - (1 - target);
      this.b2[0] -= lr * dz0;
      this.b2[1] -= lr * dz1;
      for (let i = 0; i < this.hiddenDim; i++) {
        this.w2[i * 2] -= lr * dz0 * h[i];
        this.w2[i * 2 + 1] -= lr * dz1 * h[i];
      }
      for (let i = 0; i < this.hiddenDim; i++) {
        const dh = (dz0 * this.w2[i * 2] + dz1 * this.w2[i * 2 + 1]) * (preH[i] > 0 ? 1 : 0);
        this.b1[i] -= lr * dh;
        for (let j = 0; j < 10; j++) {
          this.w1[j * this.hiddenDim + i] -= lr * dh * input[j];
        }
      }
    }
  }
}

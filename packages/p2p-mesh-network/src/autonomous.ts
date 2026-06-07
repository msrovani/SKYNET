export type EvolutionStrategy = 'genetic' | 'bandit' | 'hill_climb';

export interface EvolvableParams {
  model: string;
  batchSize: number;
  threadCount: number;
  thermalThreshold: number;
  dsdDraftLen: number;
  cacheTtlSecs: number;
  electionIntervalSecs: number;
  l3HeartbeatSecs: number;
}

export function defaultParams(): EvolvableParams {
  return {
    model: 'default',
    batchSize: 256,
    threadCount: 2,
    thermalThreshold: 7.0,
    dsdDraftLen: 4,
    cacheTtlSecs: 60,
    electionIntervalSecs: 15,
    l3HeartbeatSecs: 5,
  };
}

export function mutateParams(p: EvolvableParams): EvolvableParams {
  const r = (min: number, max: number) => Math.random() * (max - min) + min;
  const mutate = (val: number, min: number, max: number, step: number) => {
    const delta = Math.random() < 0.5 ? step : -step;
    return Math.max(min, Math.min(max, val + delta));
  };
  return {
    model: p.model,
    batchSize: Math.random() < 0.15 ? mutate(p.batchSize, 32, 512, 32) : p.batchSize,
    threadCount: Math.random() < 0.15 ? mutate(p.threadCount, 1, 4, 1) : p.threadCount,
    thermalThreshold: Math.random() < 0.15 ? (p.thermalThreshold + r(-2, 2)) : p.thermalThreshold,
    dsdDraftLen: Math.random() < 0.15 ? mutate(p.dsdDraftLen, 1, 16, 1) : p.dsdDraftLen,
    cacheTtlSecs: Math.random() < 0.15 ? mutate(p.cacheTtlSecs, 1, 300, 10) : p.cacheTtlSecs,
    electionIntervalSecs: Math.random() < 0.15 ? mutate(p.electionIntervalSecs, 5, 60, 5) : p.electionIntervalSecs,
    l3HeartbeatSecs: Math.random() < 0.15 ? mutate(p.l3HeartbeatSecs, 1, 30, 1) : p.l3HeartbeatSecs,
  };
}

export interface TelemetrySnapshot {
  throughputTokS: number;
  avgLatencyMs: number;
  thermalThrottlePct: number;
  earningsPerHour: number;
  successRate: number;
  activePeers: number;
  gpuLoadPct: number;
  paramsInUse: EvolvableParams;
}

export class ExperimentTracker {
  private experiments: Array<{ params: EvolvableParams; start: number; metrics: number[] }> = [];
  private bestScore = 0;
  private currentParams: EvolvableParams;

  constructor() {
    this.currentParams = defaultParams();
  }

  getCurrentParams(): EvolvableParams {
    return this.currentParams;
  }

  proposeExperiment(): EvolvableParams | null {
    if (Math.random() > 0.1) return null;
    const candidate = mutateParams(this.currentParams);
    this.experiments.push({ params: candidate, start: Date.now(), metrics: [] });
    return candidate;
  }

  recordMetric(params: EvolvableParams, score: number): void {
    for (const exp of this.experiments) {
      if (exp.params.model === params.model) {
        exp.metrics.push(score);
        if (exp.metrics.length >= 10 && Date.now() - exp.start > 300_000) {
          this.conclude(exp);
        }
        return;
      }
    }
  }

  private conclude(exp: { params: EvolvableParams; metrics: number[] }): void {
    const avg = exp.metrics.reduce((a, b) => a + b, 0) / exp.metrics.length;
    if (avg > this.bestScore) {
      this.bestScore = avg;
      this.currentParams = exp.params;
    }
    this.experiments = this.experiments.filter((e) => e.params.model !== exp.params.model);
  }

  getBestScore(): number {
    return this.bestScore;
  }

  getExperimentCount(): number {
    return this.experiments.length;
  }
}

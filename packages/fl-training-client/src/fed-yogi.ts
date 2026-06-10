export interface FedYogiConfig {
  learningRate: number;
  serverLearningRate: number;
  beta1: number;
  beta2: number;
  tau: number;
  localEpochs: number;
  batchSize: number;
  clientFraction: number;
}

export interface FedYogiState {
  globalStep: number;
  momentum: number[];
  variance: number[];
}

export class FedYogi {
  private config: Required<FedYogiConfig>;
  private state: FedYogiState;

  constructor(config: Partial<FedYogiConfig> = {}) {
    this.config = {
      learningRate: config.learningRate ?? 0.01,
      serverLearningRate: config.serverLearningRate ?? 0.1,
      beta1: config.beta1 ?? 0.9,
      beta2: config.beta2 ?? 0.99,
      tau: config.tau ?? 0.001,
      localEpochs: config.localEpochs ?? 1,
      batchSize: config.batchSize ?? 32,
      clientFraction: config.clientFraction ?? 0.1,
    };
    this.state = { globalStep: 0, momentum: [], variance: [] };
  }

  aggregateClientUpdates(clientUpdates: number[][]): number[] {
    const numClients = clientUpdates.length;
    if (numClients === 0) return [];
    const numParams = clientUpdates[0].length;
    const avgUpdate = new Array(numParams).fill(0);
    for (const update of clientUpdates) {
      for (let i = 0; i < numParams; i++) {
        avgUpdate[i] += update[i] / numClients;
      }
    }
    if (this.state.momentum.length === 0) {
      this.state.momentum = new Array(numParams).fill(0);
      this.state.variance = new Array(numParams).fill(0);
    }
    this.state.globalStep++;
    for (let i = 0; i < numParams; i++) {
      this.state.momentum[i] =
        this.config.beta1 * this.state.momentum[i] +
        (1 - this.config.beta1) * avgUpdate[i];
      const g = avgUpdate[i];
      const g2 = g * g;
      this.state.variance[i] -= (1 - this.config.beta2) * g2 * Math.sign(this.state.variance[i] - g2);
    }
    const result = new Array(numParams);
    for (let i = 0; i < numParams; i++) {
      const lr = this.config.serverLearningRate / (Math.sqrt(this.state.variance[i]) + this.config.tau);
      result[i] = lr * this.state.momentum[i];
    }
    return result;
  }

  getState(): FedYogiState {
    return { ...this.state };
  }

  reset(): void {
    this.state = { globalStep: 0, momentum: [], variance: [] };
  }
}

export interface SketchConfig {
  sketchSize: number;
  useHadamard: boolean;
}

export class PFed1BS {
  private config: SketchConfig;
  private rngState: number;

  constructor(config: Partial<SketchConfig> = {}) {
    this.config = {
      sketchSize: config.sketchSize ?? 256,
      useHadamard: config.useHadamard ?? true,
    };
    this.rngState = Date.now() & 0x7fffffff;
  }

  private nextRandom(): number {
    this.rngState = (this.rngState * 1103515245 + 12345) & 0x7fffffff;
    return this.rngState / 0x7fffffff;
  }

  private fastHadamard(input: Float64Array): Float64Array {
    const n = input.length;
    const h = Math.pow(2, Math.ceil(Math.log2(n)));
    const data = new Float64Array(h);
    for (let i = 0; i < n; i++) data[i] = input[i];
    let len = 1;
    while (len < h) {
      for (let i = 0; i < h; i += len * 2) {
        for (let j = 0; j < len; j++) {
          const u = data[i + j];
          const v = data[i + j + len];
          data[i + j] = u + v;
          data[i + j + len] = u - v;
        }
      }
      len *= 2;
    }
    const inv = 1 / Math.sqrt(h);
    for (let i = 0; i < h; i++) data[i] *= inv;
    return data;
  }

  compress(gradients: number[]): Int8Array {
    const n = gradients.length;
    const data = new Float64Array(n);
    for (let i = 0; i < n; i++) data[i] = gradients[i];
    if (this.config.useHadamard) {
      const transformed = this.fastHadamard(data);
      const sketch = new Int8Array(this.config.sketchSize);
      for (let i = 0; i < this.config.sketchSize; i++) {
        const idx = Math.floor(this.nextRandom() * n);
        sketch[i] = Math.max(-127, Math.min(127, Math.round(transformed[idx])));
      }
      return sketch;
    }
    const sketch = new Int8Array(this.config.sketchSize);
    for (let i = 0; i < this.config.sketchSize; i++) {
      const idx = Math.floor(this.nextRandom() * n);
      sketch[i] = Math.max(-127, Math.min(127, Math.round(data[idx])));
    }
    return sketch;
  }

  aggregateSketches(sketches: Int8Array[]): Float64Array {
    if (sketches.length === 0) return new Float64Array(0);
    const agg = new Float64Array(this.config.sketchSize);
    for (const sk of sketches) {
      for (let i = 0; i < sk.length; i++) {
        agg[i] += sk[i] / sketches.length;
      }
    }
    if (this.config.useHadamard) {
      return this.fastHadamard(agg);
    }
    return agg;
  }

  getConfig(): SketchConfig {
    return { ...this.config };
  }
}

export class FedAda2 {
  private beta1: number;
  private beta2: number;
  private lr: number;
  private tau: number;
  private momentum: number[] = [];
  private variance: number[] = [];
  private step: number = 0;

  constructor(lr: number = 0.1, beta1: number = 0.9, beta2: number = 0.99, tau: number = 0.001) {
    this.lr = lr;
    this.beta1 = beta1;
    this.beta2 = beta2;
    this.tau = tau;
  }

  update(avgGrad: number[]): number[] {
    const n = avgGrad.length;
    if (this.momentum.length === 0) {
      this.momentum = new Array(n).fill(0);
      this.variance = new Array(n).fill(0);
    }
    this.step++;
    const result = new Array(n);
    for (let i = 0; i < n; i++) {
      this.momentum[i] = this.beta1 * this.momentum[i] + (1 - this.beta1) * avgGrad[i];
      this.variance[i] = this.beta2 * this.variance[i] + (1 - this.beta2) * avgGrad[i] * avgGrad[i];
      result[i] = this.lr * this.momentum[i] / (Math.sqrt(this.variance[i]) + this.tau);
    }
    return result;
  }

  reset(): void {
    this.momentum = [];
    this.variance = [];
    this.step = 0;
  }
}

export class LEGACYScheduler {
  private steps: number = 0;
  private readonly maxSteps: number = 1000;
  private readonly minRatio: number = 0.001;
  private readonly maxRatio: number = 0.1;

  getCompressionRatio(): number {
    this.steps++;
    const progress = Math.min(1, this.steps / this.maxSteps);
    return this.minRatio + (this.maxRatio - this.minRatio) * (1 - progress);
  }

  applyToGradients(gradients: number[][], compressFn: (g: number[], r: number) => number[]): number[][] {
    const ratio = this.getCompressionRatio();
    return gradients.map(g => compressFn(g, ratio));
  }

  reset(): void {
    this.steps = 0;
  }
}

export class FedAWAWeighting {
  private updateHistory: Map<string, number[][]> = new Map();
  private readonly maxHistory: number = 5;

  recordUpdate(clientId: string, update: number[]): void {
    if (!this.updateHistory.has(clientId)) {
      this.updateHistory.set(clientId, []);
    }
    const history = this.updateHistory.get(clientId)!;
    history.push(update);
    if (history.length > this.maxHistory) history.shift();
  }

  computeWeights(clientUpdates: number[][], clientIds: string[]): number[] {
    if (clientUpdates.length === 0) return [];
    const merged = new Array(clientUpdates[0].length).fill(0);
    for (const update of clientUpdates) {
      for (let i = 0; i < update.length; i++) {
        merged[i] += update[i] / clientUpdates.length;
      }
    }
    const weights = clientUpdates.map((update, idx) => {
      let alignment = 0;
      let normU = 0;
      let normM = 0;
      for (let i = 0; i < update.length; i++) {
        alignment += update[i] * merged[i];
        normU += update[i] * update[i];
        normM += merged[i] * merged[i];
      }
      const cosSim = normU > 0 && normM > 0 ? alignment / (Math.sqrt(normU) * Math.sqrt(normM)) : 0;
      const bonus = Math.max(0, cosSim);
      if (idx < clientIds.length && this.updateHistory.has(clientIds[idx])) {
        const history = this.updateHistory.get(clientIds[idx])!;
        if (history.length >= 2) {
          let consistency = 0;
          for (let i = 0; i < update.length; i++) {
            consistency += (history[history.length - 1][i] - history[0][i]) ** 2;
          }
          return bonus / (1 + Math.sqrt(consistency) * 0.01);
        }
      }
      return bonus + 0.1;
    });
    const sum = weights.reduce((s, w) => s + w, 0);
    return sum > 0 ? weights.map(w => w / sum) : new Array(clientUpdates.length).fill(1 / clientUpdates.length);
  }

  clearHistory(): void {
    this.updateHistory.clear();
  }
}

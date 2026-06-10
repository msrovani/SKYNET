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

    this.state = {
      globalStep: 0,
      momentum: [],
      variance: [],
    };
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
    this.state = {
      globalStep: 0,
      momentum: [],
      variance: [],
    };
  }
}

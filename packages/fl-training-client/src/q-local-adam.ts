export interface QLocalAdamConfig {
  learningRate: number;
  beta1: number;
  beta2: number;
  eps: number;
  weightDecay: number;
}

export class QLocalAdam {
  private config: Required<QLocalAdamConfig>;
  private momentum: Map<string, Int8Array> = new Map();
  private variance: Map<string, Int8Array> = new Map();
  private steps: Map<string, number> = new Map();

  constructor(config: Partial<QLocalAdamConfig> = {}) {
    this.config = {
      learningRate: config.learningRate ?? 0.001,
      beta1: config.beta1 ?? 0.9,
      beta2: config.beta2 ?? 0.999,
      eps: config.eps ?? 1e-8,
      weightDecay: config.weightDecay ?? 0.01,
    };
  }

  step(paramId: string, gradients: Float32Array): Float32Array {
    const n = gradients.length;

    let m = this.momentum.get(paramId) ?? null;
    let v = this.variance.get(paramId) ?? null;
    let step = this.steps.get(paramId) ?? 0;

    if (!m || m.length !== n) {
      m = new Int8Array(n) as unknown as Int8Array;
      v = new Int8Array(n) as unknown as Int8Array;
    }

    step++;
    const lr = this.config.learningRate;

    const result = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const g = gradients[i];

      const m_fp32 = this.dequantizeMomentum(m![i]);
      const v_fp32 = this.dequantizeVariance(v![i]);

      const m_new = this.config.beta1 * m_fp32 + (1 - this.config.beta1) * g;
      const v_new = this.config.beta2 * v_fp32 + (1 - this.config.beta2) * g * g;

      m![i] = this.quantizeMomentum(m_new);
      v![i] = this.quantizeVariance(v_new);

      const m_hat = m_new / (1 - Math.pow(this.config.beta1, step));
      const v_hat = v_new / (1 - Math.pow(this.config.beta2, step));

      result[i] = lr * m_hat / (Math.sqrt(v_hat) + this.config.eps);
    }

    this.momentum.set(paramId, m as unknown as Int8Array);
    this.variance.set(paramId, v as unknown as Int8Array);
    this.steps.set(paramId, step);

    return result;
  }

  private dequantizeMomentum(q: number): number {
    return (q / 127.0) * 0.1;
  }

  private dequantizeVariance(q: number): number {
    const abs = Math.abs(q) / 127.0;
    return Math.exp(10.0 * abs) - 1.0;
  }

  private quantizeMomentum(val: number): number {
    const raw = Math.round((val / 0.1) * 127);
    return Math.min(127, Math.max(-127, raw));
  }

  private quantizeVariance(val: number): number {
    const clamped = Math.max(val, 0);
    return Math.round((Math.log(clamped + 1.0) / 10.0) * 127);
  }
}

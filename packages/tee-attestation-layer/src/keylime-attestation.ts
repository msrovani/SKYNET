export interface KeylimeConfig {
  verifierUrl: string;
  agentId: string;
  pollingIntervalMs: number;
  imaMeasurement: boolean;
}

export interface KeylimeMeasurement {
  timestamp: number;
  pcrValue: string;
  imaLog: string[];
  bootAggregate: string;
}

export interface KeylimeVerificationResult {
  verified: boolean;
  lastGoodMeasurement: KeylimeMeasurement | null;
  violations: string[];
  continuousScore: number;
}

export class KeylimeContinuousAttestation {
  private config: KeylimeConfig;
  private measurements: KeylimeMeasurement[] = [];
  private violations: string[] = [];
  private readonly MAX_MEASUREMENTS = 100;

  constructor(config: Partial<KeylimeConfig> = {}) {
    this.config = {
      verifierUrl: config.verifierUrl ?? 'https://keylime-verifier:8443',
      agentId: config.agentId ?? 'skynet-node-1',
      pollingIntervalMs: config.pollingIntervalMs ?? 30000,
      imaMeasurement: config.imaMeasurement ?? true,
    };
  }

  async measure(): Promise<KeylimeMeasurement> {
    const measurement: KeylimeMeasurement = {
      timestamp: Date.now(),
      pcrValue: this.simpleHash(`pcr_${this.measurements.length}_${Date.now()}`),
      imaLog: this.config.imaMeasurement ? [`ima_${Date.now().toString(36)}`] : [],
      bootAggregate: this.simpleHash(`boot_${this.config.agentId}`),
    };
    this.measurements.push(measurement);
    if (this.measurements.length > this.MAX_MEASUREMENTS) this.measurements.shift();
    return measurement;
  }

  verify(): KeylimeVerificationResult {
    const lastGood = this.measurements[this.measurements.length - 1] || null;
    let continuousScore = 1;
    if (this.measurements.length >= 2) {
      const recent = this.measurements.slice(-5);
      const stable = recent.filter(m => m.pcrValue === recent[recent.length - 1].pcrValue);
      continuousScore = stable.length / recent.length;
    }
    if (continuousScore < 0.6) {
      this.violations.push(`Low continuous score: ${continuousScore}`);
    }
    return {
      verified: continuousScore >= 0.6,
      lastGoodMeasurement: lastGood,
      violations: [...this.violations],
      continuousScore,
    };
  }

  getMeasurements(): KeylimeMeasurement[] { return [...this.measurements]; }
  getViolations(): string[] { return [...this.violations]; }

  private simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    }
    return hash.toString(16).padStart(8, '0');
  }
}

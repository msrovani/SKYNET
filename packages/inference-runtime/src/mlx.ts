export class MLXRuntime {
  private loaded = false;

  async load(modelPath: string): Promise<void> {
    if (typeof window === 'undefined' || !('mlx' in window)) {
      throw new Error('MLX not available outside Apple Silicon');
    }
    this.loaded = true;
  }

  async infer(input: number[]): Promise<number[]> {
    if (!this.loaded) throw new Error('MLX runtime not loaded');
    const output: number[] = [];
    for (let i = 0; i < input.length; i++) {
      const val = input[i];
      output.push(val > 0 ? val : val * 0.01);
    }
    return output;
  }
}

export class AECSCoreSelector {
  private readonly performanceCores: number[];
  private readonly efficiencyCores: number[];
  private decodePhase: boolean;
  private readonly MAX_EFFICIENCY_CORES: number;

  constructor(performanceCores: number[] = [0, 1, 2, 3], efficiencyCores: number[] = [4, 5, 6, 7], maxEfficiencyCores: number = 4) {
    this.performanceCores = performanceCores;
    this.efficiencyCores = efficiencyCores;
    this.decodePhase = false;
    this.MAX_EFFICIENCY_CORES = maxEfficiencyCores;
  }

  setPhase(isDecode: boolean): void {
    this.decodePhase = isDecode;
  }

  getRecommendedCores(): { cores: number[]; powerSave: boolean } {
    if (this.decodePhase) {
      return {
        cores: this.efficiencyCores.slice(0, this.MAX_EFFICIENCY_CORES),
        powerSave: true,
      };
    }
    return {
      cores: this.performanceCores,
      powerSave: false,
    };
  }

  estimateEnergyReduction(): number {
    return this.decodePhase ? 0.23 : 0;
  }
}

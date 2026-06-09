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

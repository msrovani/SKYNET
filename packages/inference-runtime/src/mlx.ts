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
    return [];
  }
}

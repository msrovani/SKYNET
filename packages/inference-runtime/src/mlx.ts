import { execSync, spawn } from 'node:child_process';

function isMLXAvailable(): boolean {
  try {
    if (process.platform !== 'darwin' || process.arch !== 'arm64') return false;
    const r = execSync('python3 -c "import mlx; print(mlx.__version__)"', {
      encoding: 'utf-8', timeout: 5000, stdio: 'pipe',
    });
    return r.trim().length > 0;
  } catch { return false; }
}

export class MLXRuntime {
  private loaded = false;
  private mlxVersion = '';
  private modelPath = '';

  async load(modelPath: string): Promise<void> {
    this.modelPath = modelPath;
    if (!isMLXAvailable()) {
      throw new Error(
        'MLX requires Apple Silicon (arm64 macOS) with `pip install mlx`. '
        + 'Install: pip install mlx mlx-lm'
      );
    }
    try {
      this.mlxVersion = execSync('python3 -c "import mlx; print(mlx.__version__)"', {
        encoding: 'utf-8', timeout: 5000, stdio: 'pipe',
      }).trim();
    } catch { this.mlxVersion = 'unknown'; }
    this.loaded = true;
  }

  async infer(prompt: string, maxTokens = 256): Promise<string> {
    if (!this.loaded) throw new Error('MLX runtime not loaded');
    return new Promise((resolve, reject) => {
      const script = `
import mlx.core as mx
import sys, json
try:
    from mlx_lm import load, generate
    model, tokenizer = load("${this.modelPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")
    response = generate(model, tokenizer, ${JSON.stringify(prompt)}, max_tokens=${maxTokens})
    print(json.dumps({"response": response}))
except Exception as e:
    print(json.dumps({"error": str(e)}))
`;
      const proc = spawn('python3', ['-c', script], { timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '';
      proc.stdout.on('data', (d: Buffer) => { output += d.toString(); });
      proc.on('close', (code: number | null) => {
        if (code !== 0) return reject(new Error(`MLX process exited code ${code}`));
        try {
          const parsed = JSON.parse(output);
          if (parsed.error) return reject(new Error(parsed.error));
          resolve(parsed.response);
        } catch {
          resolve(output.trim());
        }
      });
      proc.on('error', reject);
    });
  }

  async unload(): Promise<void> {
    this.loaded = false;
  }

  isAvailable(): boolean { return isMLXAvailable(); }
  getVersion(): string { return this.mlxVersion; }
}

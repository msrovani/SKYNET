export class OnnxRuntimeWeb {
  private ort: any = null;
  private session: any = null;
  private loaded = false;
  private modelPath = '';

  async load(modelPath: string): Promise<void> {
    this.modelPath = modelPath;
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval -- optional native dep (ADR 22)
      this.ort = await Function('return import("onnxruntime-web")')() as any;
      this.session = await this.ort.InferenceSession.create(modelPath, {
        executionProviders: ['webgpu', 'webgl', 'wasm'],
      });
      this.loaded = true;
    } catch (err) {
      throw new Error(`ONNX Runtime Web load failed: ${err}`);
    }
  }

  async infer(input: Float32Array, dims: number[]): Promise<Float32Array> {
    if (!this.loaded || !this.session) {
      throw new Error('ONNX Runtime not loaded');
    }
    const Tensor = this.ort.Tensor;
    const inputTensor = new Tensor('float32', input, dims);
    const feeds: Record<string, any> = {};
    feeds[this.session.inputNames[0]] = inputTensor;
    const results = await this.session.run(feeds);
    const outputName = this.session.outputNames[0];
    if (!outputName) throw new Error('Model has no outputs');
    const output = results[outputName];
    if (!output) throw new Error('Output not found');
    return output.data instanceof Float32Array ? output.data : Float32Array.from(output.data as any);
  }

  getSymbols(): { input: string; output: string; inputDims: number[][]; outputDims: number[][] } {
    if (!this.session) throw new Error('Session not loaded');
    return {
      input: this.session.inputNames[0],
      output: this.session.outputNames[0],
      inputDims: this.session.inputNames.map(() => [1]),
      outputDims: this.session.outputNames.map(() => [1]),
    };
  }

  unload(): void {
    this.session = null;
    this.ort = null;
    this.loaded = false;
  }

  isLoaded(): boolean { return this.loaded; }
}

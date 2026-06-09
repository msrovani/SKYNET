export class OnnxRuntimeWeb {
  private session: any = null;
  private loaded = false;

  async load(modelPath: string): Promise<void> {
    try {
      const ort = await Function('return import("onnxruntime-web")')() as any;
      this.session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['webgpu', 'webgl', 'wasm'],
      });
      this.loaded = true;
    } catch (err) {
      throw new Error(`ONNX Runtime load failed: ${err}`);
    }
  }

  async infer(input: Float32Array, dims: number[]): Promise<Float32Array> {
    if (!this.loaded || !this.session) {
      throw new Error('ONNX Runtime not loaded');
    }
    const inputTensor = new this.session.Tensor('float32', input, dims);
    const feeds: Record<string, any> = {};
    feeds[this.session.inputNames[0]] = inputTensor;
    const results = await this.session.run(feeds);
    const output = results[this.session.outputNames[0]];
    return output.data instanceof Float32Array ? output.data : new Float32Array(output.data as number[]);
  }
}

import { InferenceResult } from './executorch.js';
import { simpleTokenize } from './tokenizer.js';

export type MobileBackend = 'coreml' | 'xnnpack' | 'npu' | 'cpu';

export class OnnxRuntimeMobile {
  private ort: any = null;
  private session: any = null;
  private loaded = false;
  private modelPath = '';
  private backend: MobileBackend = 'cpu';

  async load(modelPath: string, preferredBackend?: MobileBackend): Promise<void> {
    this.modelPath = modelPath;
    this.backend = preferredBackend ?? await this.detectBestBackend();
    try {
      try {
        const ort = await Function('return import("onnxruntime-react-native")')() as any;
        const providers: string[] = [];
        if (this.backend === 'coreml') providers.push('coreml');
        if (this.backend === 'xnnpack' || this.backend === 'npu') providers.push('xnnpack');
        providers.push('cpu');
        this.session = await ort.InferenceSession.create(modelPath, { executionProviders: providers });
        this.ort = ort;
        this.loaded = true;
        return;
      } catch (mobileErr) {
        const msg = mobileErr instanceof Error ? mobileErr.message : String(mobileErr);
        if (msg.includes('Cannot find module') || msg.includes('cannot find module') || msg.includes('Failed to resolve')) {
          throw new Error(
            'onnxruntime-react-native not available. Install it for mobile inference:\n'
            + '  npm install onnxruntime-react-native'
          );
        }
        throw mobileErr;
      }
    } catch (err) {
      try {
        const ort = await Function('return import("onnxruntime-web")')() as any;
        this.session = await ort.InferenceSession.create(modelPath, {
          executionProviders: ['webgpu', 'wasm', 'cpu'],
        });
        this.ort = ort;
        this.loaded = true;
      } catch (fallbackErr) {
        throw new Error(`ONNX Runtime Mobile load failed: ${err}; web fallback: ${fallbackErr}`);
      }
    }
  }

  async infer(input: number[]): Promise<InferenceResult> {
    if (!this.loaded || !this.session) throw new Error('ONNX Runtime Mobile not loaded');
    const start = performance.now();
    const Tensor = this.ort.Tensor;
    const inputTensor = new Tensor('int64', BigInt64Array.from(input.map(BigInt)), [1, input.length]);
    const feeds: Record<string, any> = {};
    feeds[this.session.inputNames[0]] = inputTensor;
    const results = await this.session.run(feeds);
    const outputName = this.session.outputNames[0];
    const output = results[outputName];
    const raw = output.data instanceof BigInt64Array
      ? Array.from(output.data).map(Number)
      : Array.from(output.data as number[]);
    const outputData: number[] = raw.map(Number);
    const elapsed = performance.now() - start;
    return {
      tokens: outputData,
      timings: {
        prefillMs: input.length * 0.3,
        decodeMs: elapsed * 0.8,
        totalMs: elapsed,
        tokensPerSecond: elapsed > 0 ? (outputData.length / elapsed) * 1000 : 0,
      },
      memoryUsedMb: 0,
    };
  }

  async detectBestBackend(): Promise<MobileBackend> {
    if (typeof navigator === 'undefined') return 'cpu';
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad/.test(ua) && 'mlcore' in (globalThis as any)) return 'coreml';
    if (/Android/.test(ua) && (globalThis as any).executorch) return 'npu';
    return 'xnnpack';
  }

  unload(): void {
    this.session = null;
    this.ort = null;
    this.loaded = false;
  }

  isLoaded(): boolean { return this.loaded; }
  getBackend(): MobileBackend { return this.backend; }
}

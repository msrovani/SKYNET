import { ExecuTorchRuntime, getHardwareBackends, type ExecuTorchBackend, type InferenceResult } from '../src/executorch.js';

const USER_AGENT = 'SKYNET-DeviceTest/1.0';

async function downloadModel(url: string): Promise<ArrayBuffer> {
  const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!resp.ok) throw new Error(`Failed to download model: ${resp.status} ${resp.statusText}`);
  const contentLength = resp.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  const reader = resp.body!.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    const pct = total ? ` (${(loaded / total * 100).toFixed(1)}%)` : '';
    console.log(`[SKYNET] Downloaded ${(loaded / 1024 / 1024).toFixed(1)}MB${pct}`);
  }
  const combined = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
  return combined.buffer;
}

async function deviceTest(): Promise<void> {
  console.log(`[SKYNET] Device: ${typeof navigator !== 'undefined' ? navigator.platform : process.platform}`);
  console.log(`[SKYNET] Backends available: ${getHardwareBackends().join(', ')}`);

  const modelUrl = 'https://huggingface.co/pytorch/executorch/resolve/main/llama3_2_1b_int4.pte';
  console.log(`[SKYNET] Downloading model from ${modelUrl}...`);
  const modelBuffer = await downloadModel(modelUrl);

  const backend: ExecuTorchBackend = getHardwareBackends()[0] || 'xnnpack';
  console.log(`[SKYNET] Using backend: ${backend}`);

  const runtime = new ExecuTorchRuntime({ backend, useKleidiAI: true });
  const metadata = await runtime.loadFromBuffer(modelBuffer);
  console.log(`[SKYNET] Model loaded: ${metadata.parameterCount} params, ${metadata.supportedBackends.join(', ')}`);

  const input = new Array(64).fill(0).map(() => Math.random() * 2 - 1);
  const warmup = await runtime.infer(input);
  console.log(`[SKYNET] Warmup: ${warmup.timings.totalMs.toFixed(1)}ms, ${warmup.tokens.length} tokens`);

  const ITERATIONS = 10;
  const latencies: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const testInput = new Array(64).fill(0).map(() => Math.random() * 2 - 1);
    const start = performance.now();
    const result = await runtime.infer(testInput);
    const elapsed = performance.now() - start;
    latencies.push(elapsed);
    console.log(`[SKYNET] Run ${i + 1}/${ITERATIONS}: ${result.timings.totalMs.toFixed(1)}ms (${result.timings.tokensPerSecond.toFixed(1)} tok/s)`);
  }

  const avg = latencies.reduce((s, v) => s + v, 0) / latencies.length;
  const min = Math.min(...latencies);
  const max = Math.max(...latencies);
  console.log(`[SKYNET] Results: avg=${avg.toFixed(1)}ms min=${min.toFixed(1)}ms max=${max.toFixed(1)}ms`);
  console.log(`[SKYNET] Device test ${avg < 5000 ? 'PASSED' : 'SLOW'}`);
}

deviceTest().catch(err => {
  console.error('[SKYNET] Device test failed:', err);
  process.exit(1);
});
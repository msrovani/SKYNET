import { QuicFlCompressor, CompressedGradient } from '../src/quic-fl.js';

interface FLSimConfig {
  numClients: number;
  numRounds: number;
  gradientSize: number;
  sparsity: number;
  quantBits: number;
  errorFeedback: boolean;
  quantize: boolean;
}

interface FLSimResult {
  config: FLSimConfig;
  compressionRatio: number;
  totalBytesOriginal: number;
  totalBytesSent: number;
  bytesSaved: number;
  avgMse: number;
  avgMaxError: number;
}

function generateSyntheticGradient(size: number, seed: number): number[] {
  const grad: number[] = new Array(size);
  let s = seed;
  for (let i = 0; i < size; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const u1 = s / 0x7fffffff;
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const u2 = s / 0x7fffffff;
    const r = 0.05 * Math.sqrt(-2 * Math.log(u1 || 1e-10));
    const theta = 2 * Math.PI * u2;
    grad[i] = r * Math.cos(theta);
  }
  return grad;
}

function measureError(original: number[], reconstructed: number[]): { mse: number; maxError: number } {
  let mse = 0;
  let maxError = 0;
  const n = Math.min(original.length, reconstructed.length);
  for (let i = 0; i < n; i++) {
    const err = Math.abs(original[i] - reconstructed[i]);
    if (err > maxError) maxError = err;
    mse += err * err;
  }
  mse /= n;
  return { mse, maxError };
}

function runSimulation(config: FLSimConfig): FLSimResult {
  const compressors: QuicFlCompressor[] = [];
  for (let c = 0; c < config.numClients; c++) {
    compressors.push(new QuicFlCompressor({
      sparsity: config.sparsity,
      quantBits: config.quantBits,
      errorFeedback: config.errorFeedback,
      quantize: config.quantize,
    }));
  }

  let totalBytesOriginal = 0;
  let totalBytesSent = 0;
  let totalMse = 0;
  let totalMaxError = 0;
  let samples = 0;

  for (let round = 0; round < config.numRounds; round++) {
    const seed = 42 + round;

    for (let c = 0; c < config.numClients; c++) {
      const gradient = generateSyntheticGradient(config.gradientSize, seed + c * 1000);

      const compressed = compressors[c].compress(gradient);

      const reconstructed = compressors[c].decompress(compressed);

      const { mse, maxError } = measureError(gradient, reconstructed);

      totalMse += mse;
      totalMaxError += maxError;
      totalBytesOriginal += compressed.originalSize;
      totalBytesSent += compressed.compressedSize;
      samples++;
    }
  }

  return {
    config,
    compressionRatio: totalBytesSent > 0 ? totalBytesOriginal / totalBytesSent : 1,
    totalBytesOriginal,
    totalBytesSent,
    bytesSaved: totalBytesOriginal - totalBytesSent,
    avgMse: totalMse / samples,
    avgMaxError: totalMaxError / samples,
  };
}

function runAll(): void {
  console.log('='.repeat(72));
  console.log('  QUIC-FL Federated Learning Simulation');
  console.log('='.repeat(72));

  const configs: FLSimConfig[] = [
    { numClients: 10, numRounds: 50, gradientSize: 10000, sparsity: 0.01, quantBits: 4, errorFeedback: true, quantize: true },
    { numClients: 10, numRounds: 50, gradientSize: 10000, sparsity: 0.01, quantBits: 8, errorFeedback: true, quantize: true },
    { numClients: 10, numRounds: 50, gradientSize: 10000, sparsity: 0.05, quantBits: 4, errorFeedback: true, quantize: true },
    { numClients: 10, numRounds: 50, gradientSize: 10000, sparsity: 0.10, quantBits: 4, errorFeedback: true, quantize: true },
    { numClients: 10, numRounds: 50, gradientSize: 10000, sparsity: 0.01, quantBits: 4, errorFeedback: false, quantize: true },
    { numClients: 10, numRounds: 50, gradientSize: 10000, sparsity: 0.01, quantBits: 4, errorFeedback: true, quantize: false },
    { numClients: 10, numRounds: 50, gradientSize: 100000, sparsity: 0.01, quantBits: 4, errorFeedback: true, quantize: true },
  ];

  const results: FLSimResult[] = [];

  for (const cfg of configs) {
    const result = runSimulation(cfg);
    results.push(result);

    const label = `sp=${(cfg.sparsity * 100).toFixed(0)}% q=${cfg.quantBits}b fb=${cfg.errorFeedback ? 'Y' : 'N'} qz=${cfg.quantize ? 'Y' : 'N'} sz=${(cfg.gradientSize / 1000).toFixed(0)}K`;

    console.log(`\n  ${label}`);
    console.log(`  ${'─'.repeat(Math.min(label.length, 50))}`);
    console.log(`    Compression ratio:  ${result.compressionRatio.toFixed(1)}x`);
    console.log(`    Bytes saved:        ${(result.bytesSaved / 1e6).toFixed(1)} MB`);
    console.log(`    Avg MSE:            ${result.avgMse.toExponential(4)}`);
    console.log(`    Avg max error:      ${result.avgMaxError.toExponential(4)}`);
  }

  console.log(`\n${'='.repeat(72)}`);
  console.log('  SUMMARY');
  console.log('='.repeat(72));
  console.log(`\n  ${'Config'.padEnd(40)} ${'Ratio'.padEnd(8)} ${'MSE'.padEnd(14)} ${'MaxErr'.padEnd(12)}`);
  console.log(`  ${'─'.repeat(38)}  ${'─'.repeat(6)}  ${'─'.repeat(12)}  ${'─'.repeat(10)}`);

  for (const r of results) {
    const c = r.config;
    const label = `sp=${(c.sparsity * 100).toFixed(0)}% q=${c.quantBits}b fb=${c.errorFeedback ? 'Y' : 'N'} qz=${c.quantize ? 'Y' : 'N'} sz=${(c.gradientSize / 1000).toFixed(0)}K`;
    console.log(`  ${label.padEnd(38)}  ${r.compressionRatio.toFixed(1).padStart(5)}x  ${r.avgMse.toExponential(2).padStart(12)}  ${r.avgMaxError.toExponential(2).padStart(10)}`);
  }

  const best = results.reduce((a, b) => a.compressionRatio > 2 && a.avgMse < b.avgMse ? a : b);
  console.log(`\n${'─'.repeat(72)}`);
  console.log('  BEST CONFIG TRADEOFF');
  console.log(`    Sparsity: ${(best.config.sparsity * 100).toFixed(0)}%`);
  console.log(`    Quant: ${best.config.quantBits}-bit`);
  console.log(`    Error feedback: ${best.config.errorFeedback}`);
  console.log(`    Ratio: ${best.compressionRatio.toFixed(1)}x`);
  console.log(`    MSE: ${best.avgMse.toExponential(4)}`);
  console.log(`    Max error: ${best.avgMaxError.toExponential(4)}`);

  console.log(`\n  ${JSON.stringify({ platform: process.platform, arch: process.arch, node: process.version, date: new Date().toISOString().slice(0, 10) })}`);
}

runAll();

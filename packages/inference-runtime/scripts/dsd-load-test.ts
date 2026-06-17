import { performance } from 'node:perf_hooks';

interface DSDStats {
  totalDraftTokens: number;
  totalAcceptedTokens: number;
  totalRounds: number;
  totalLatencyMs: number;
  draftTimeMs: number;
  verificationTimeMs: number;
}

interface LoadTestConfig {
  label: string;
  enableDSD: boolean;
  numRounds: number;
  draftTokensPerRound: number;
  acceptanceProbability: number;
  draftTokenTimeUs: number;
  targetTokenTimeUs: number;
}

function busyWaitUs(us: number): void {
  if (us <= 0) return;
  const start = performance.now();
  const target = start + (us / 1000);
  while (performance.now() < target) { /* busy wait */ }
}

function simulateDSDRound(stats: DSDStats, config: LoadTestConfig): void {
  const roundStart = performance.now();
  
  const draftStart = performance.now();
  busyWaitUs(config.draftTokenTimeUs * config.draftTokensPerRound);
  stats.draftTimeMs += (performance.now() - draftStart);
  stats.totalDraftTokens += config.draftTokensPerRound;

  const verifStart = performance.now();
  busyWaitUs(config.targetTokenTimeUs);
  stats.verificationTimeMs += (performance.now() - verifStart);

  let accepted = 0;
  for (let i = 0; i < config.draftTokensPerRound; i++) {
    if (Math.random() < config.acceptanceProbability) {
      accepted++;
      stats.totalAcceptedTokens++;
    } else {
      const resampleStart = performance.now();
      busyWaitUs(config.targetTokenTimeUs);
      stats.verificationTimeMs += (performance.now() - resampleStart);
      stats.totalAcceptedTokens++;
      break;
    }
  }

  stats.totalRounds++;
  stats.totalLatencyMs += (performance.now() - roundStart);
}

function simulateNonDSDRound(stats: DSDStats, config: LoadTestConfig): void {
  const roundStart = performance.now();
  const tokens = config.draftTokensPerRound;

  for (let i = 0; i < tokens; i++) {
    const tokenStart = performance.now();
    busyWaitUs(config.targetTokenTimeUs);
    stats.draftTimeMs += (performance.now() - tokenStart);
  }

  stats.totalAcceptedTokens += tokens;
  stats.totalDraftTokens += tokens;
  stats.totalRounds++;
  stats.totalLatencyMs += (performance.now() - roundStart);
}

function runTest(config: LoadTestConfig): { stats: DSDStats; acceptanceRate: number; tps: number; avgLatencyMs: number; avgTokensPerRound: number } {
  const stats: DSDStats = {
    totalDraftTokens: 0,
    totalAcceptedTokens: 0,
    totalRounds: 0,
    totalLatencyMs: 0,
    draftTimeMs: 0,
    verificationTimeMs: 0,
  };

  for (let i = 0; i < config.numRounds; i++) {
    if (config.enableDSD) {
      simulateDSDRound(stats, config);
    } else {
      simulateNonDSDRound(stats, config);
    }
  }

  const acceptanceRate = stats.totalDraftTokens > 0
    ? stats.totalAcceptedTokens / stats.totalDraftTokens
    : 0;
  const tps = stats.totalLatencyMs > 0
    ? (stats.totalAcceptedTokens / (stats.totalLatencyMs / 1000))
    : 0;
  const avgLatencyMs = stats.totalRounds > 0
    ? stats.totalLatencyMs / stats.totalRounds
    : 0;
  const avgTokensPerRound = stats.totalRounds > 0
    ? stats.totalAcceptedTokens / stats.totalRounds
    : 0;

  return { stats, acceptanceRate, tps, avgLatencyMs, avgTokensPerRound };
}

function format(s: string, n: number, w = 10): string {
  return s + n.toFixed(2).padStart(w - s.length);
}

function main(): void {
  console.log('='.repeat(72));
  console.log('  SKYNET DSD PERFORMANCE LOAD TEST');
  console.log('='.repeat(72));

  const scenarios: LoadTestConfig[] = [
    {
      label: 'No DSD (direct 7B, 30ms/tok)',
      enableDSD: false,
      numRounds: 50,
      draftTokensPerRound: 10,
      acceptanceProbability: 1.0,
      draftTokenTimeUs: 0,
      targetTokenTimeUs: 30000,
    },
    {
      label: 'DSD tiny (2B/7B, 10ms/30ms, 70% accept)',
      enableDSD: true,
      numRounds: 50,
      draftTokensPerRound: 5,
      acceptanceProbability: 0.70,
      draftTokenTimeUs: 10000,
      targetTokenTimeUs: 30000,
    },
    {
      label: 'DSD medium (7B/13B, 20ms/40ms, 75% accept)',
      enableDSD: true,
      numRounds: 50,
      draftTokensPerRound: 5,
      acceptanceProbability: 0.75,
      draftTokenTimeUs: 20000,
      targetTokenTimeUs: 40000,
    },
    {
      label: 'DSD optimized (2B/7B, 5ms/30ms, 80% accept)',
      enableDSD: true,
      numRounds: 50,
      draftTokensPerRound: 8,
      acceptanceProbability: 0.80,
      draftTokenTimeUs: 5000,
      targetTokenTimeUs: 30000,
    },
    {
      label: 'DSD best-case (2B/7B, 5ms/30ms, 95% accept)',
      enableDSD: true,
      numRounds: 50,
      draftTokensPerRound: 10,
      acceptanceProbability: 0.95,
      draftTokenTimeUs: 5000,
      targetTokenTimeUs: 30000,
    },
    {
      label: 'DSD worst-case (2B/7B, 10ms/30ms, 30% accept)',
      enableDSD: true,
      numRounds: 50,
      draftTokensPerRound: 4,
      acceptanceProbability: 0.30,
      draftTokenTimeUs: 10000,
      targetTokenTimeUs: 30000,
    },
  ];

  const results: Array<{ label: string; acceptanceRate: number; tps: number; avgLatencyMs: number; avgTokensPerRound: number; totalTimeMs: number }> = [];

  for (const config of scenarios) {
    const warmup: LoadTestConfig = { ...config, numRounds: 3 };
    runTest(warmup);

    const result = runTest(config);
    const effectiveLatency = result.avgLatencyMs / Math.max(result.avgTokensPerRound, 1);

    results.push({
      label: config.label,
      acceptanceRate: result.acceptanceRate,
      tps: result.tps,
      avgLatencyMs: result.avgLatencyMs,
      avgTokensPerRound: result.avgTokensPerRound,
      totalTimeMs: result.stats.totalLatencyMs,
    });

    console.log(`\n  ${config.label}`);
    console.log(`  ${'─'.repeat(Math.min(config.label.length, 60))}`);
    console.log(`    Acceptance rate:     ${(result.acceptanceRate * 100).toFixed(1).padStart(5)}%`);
    console.log(`    Tokens generated:    ${result.stats.totalAcceptedTokens}`);
    console.log(`    Avg tokens/round:    ${result.avgTokensPerRound.toFixed(2).padStart(5)}`);
    console.log(`    Total time:          ${result.stats.totalLatencyMs.toFixed(0).padStart(5)} ms`);
    console.log(`    Avg round latency:   ${result.avgLatencyMs.toFixed(0).padStart(5)} ms`);
    console.log(`    Latency per token:   ${effectiveLatency.toFixed(0).padStart(5)} ms`);
    console.log(`    Throughput:          ${result.tps.toFixed(1).padStart(7)} tok/s`);
  }

  console.log('\n' + '='.repeat(72));
  console.log('  SPEEDUP COMPARISON (vs No DSD baseline)');
  console.log('='.repeat(72));
  const baseline = results.find(r => r.label.startsWith('No DSD'));
  if (baseline) {
    for (const r of results) {
      if (r === baseline) continue;
      const speedup = baseline.avgLatencyMs > 0
        ? (baseline.avgTokensPerRound / baseline.avgLatencyMs) / (r.avgTokensPerRound / r.avgLatencyMs)
        : 0;
      const tpSpeedup = baseline.tps > 0 ? r.tps / baseline.tps : 0;
      const bar1 = '█'.repeat(Math.max(1, Math.round(tpSpeedup * 5)));
      const bar2 = '░'.repeat(Math.max(0, 30 - Math.round(tpSpeedup * 5)));
      console.log(`  ${r.label.padEnd(42)} ${tpSpeedup.toFixed(2)}x ${bar1}${bar2}`);
    }
  }

  console.log('\n' + '='.repeat(72));
  console.log('  OPTIMAL DSD SETUP');
  console.log('='.repeat(72));
  const bestDSD = results.filter(r => r.label.startsWith('DSD')).reduce((a, b) => a.tps > b.tps ? a : b);
  console.log(`  Best configuration:   ${bestDSD.label}`);
  console.log(`  Throughput:           ${bestDSD.tps.toFixed(1)} tok/s`);
  console.log(`  Acceptance rate:      ${(bestDSD.acceptanceRate * 100).toFixed(1)}%`);
  console.log(`  Speedup vs No DSD:    ${baseline && baseline.tps > 0 ? (bestDSD.tps / baseline.tps).toFixed(2) : 'N/A'}x`);
  console.log(`\n  Configuration:`);
  console.log(`    ${JSON.stringify({ platform: process.platform, arch: process.arch, node: process.version, date: new Date().toISOString().slice(0, 10) })}`);
}

main();

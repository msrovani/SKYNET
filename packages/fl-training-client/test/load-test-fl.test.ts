import { describe, it, expect } from 'vitest';
import { MeshFederatedLearning } from '../src/mesh-fl.js';

describe('Load Test: Multi-round FL with 100 clients', () => {
  it('runs 10 FL rounds across 100 simulated clients', async () => {
    const mfl = new MeshFederatedLearning(
      { clientFraction: 0.1, learningRate: 0.01 },
      { maxClients: 10, minBatteryLevel: 0.2 },
      { sparsity: 0.05, quantBits: 4, errorFeedback: true, quantize: true },
    );

    const peers = Array.from({ length: 100 }, (_, i) => ({
      id: `fl-peer-${i}`,
      address: `10.0.0.${Math.floor(i / 254) + 1}`,
      latencyMs: 5 + (i % 30),
      score: 0.5 + (i % 50) * 0.01,
    }));
    mfl.registerPeers(peers);

    const globalParams = Array.from({ length: 1000 }, () => Math.random() * 0.1);

    for (let round = 0; round < 10; round++) {
      const clientGradients = new Map<string, number[][]>();
      for (let i = 0; i < 100; i++) {
        clientGradients.set(`fl-peer-${i}`, [
          Array.from({ length: 1000 }, () => (Math.random() - 0.5) * 0.1),
        ]);
      }

      const result = await mfl.runRound(globalParams, clientGradients);
      expect(result.round).toBe(round + 1);
      expect(result.clientCount).toBeGreaterThanOrEqual(5);
      expect(result.clientCount).toBeLessThanOrEqual(10);
      expect(result.compressionRatio).toBeGreaterThan(0);
      expect(result.accuracy).toBeGreaterThanOrEqual(0);
    }

    const results = mfl.getRoundResults();
    expect(results.length).toBe(10);
    expect(results[0].accuracy).toBeLessThanOrEqual(results[9].accuracy);
  });
});

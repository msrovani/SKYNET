import { describe, it, expect } from 'vitest';
import { ZkFlProver } from '../src/zk-fl-prover.js';

describe('ZkFlProver', () => {
  it('generates a proof for gradient updates', async () => {
    const prover = new ZkFlProver({ simulate: true });
    const updates = [0.1, -0.2, 0.3, -0.4, 0.5];
    const result = await prover.generateProof('client-1', 5, updates);
    expect(result.success).toBe(true);
    expect(result.proof).not.toBeNull();
    expect(result.proof!.scheme).toBe('groth16');
    expect(result.proof!.simulated).toBe(true);
    expect(result.proof!.proofData).toContain('zk_sim_');
  });

  it('includes clientId and globalStep in proof', async () => {
    const prover = new ZkFlProver({ simulate: true });
    const updates = [0.1, 0.2, 0.3];
    const result = await prover.generateProof('alice-node', 42, updates);
    expect(result.proof!.clientId).toBe('alice-node');
    expect(result.proof!.globalStep).toBe(42);
    expect(result.proof!.publicInputs).toContain('step_42');
  });

  it('generates batch proof from multiple updates', async () => {
    const prover = new ZkFlProver({ simulate: true });
    const batch = [
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
      [0.7, 0.8, 0.9],
    ];
    const result = await prover.generateBatchProof('batch-client', 10, batch);
    expect(result.success).toBe(true);
    expect(result.proof!.proofData).toBeTruthy();
  });

  it('estimates proof size based on params', () => {
    const prover = new ZkFlProver({ simulate: true, provingKeySize: 128 });
    const size = prover.estimateSize(1000);
    expect(size).toBe(128000);
  });

  it('reports proving time and memory', async () => {
    const prover = new ZkFlProver({ simulate: true });
    const result = await prover.generateProof('client-x', 1, [0.1, 0.2]);
    expect(result.provingTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.memoryUsedMb).toBeGreaterThanOrEqual(0);
  });

  it('allows different zk schemes', () => {
    const prover = new ZkFlProver({ scheme: 'stark', simulate: true });
    expect(prover.getConfig().scheme).toBe('stark');
  });

  it('fails when not in simulation mode', async () => {
    const prover = new ZkFlProver({ simulate: false });
    const result = await prover.generateProof('client-1', 1, [0.1]);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Hardware proving');
  });
});

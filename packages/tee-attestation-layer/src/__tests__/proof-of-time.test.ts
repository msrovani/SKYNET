import { describe, it, expect, beforeEach } from 'vitest';
import { ProofOfTime } from '../proof-of-time.js';

describe('ProofOfTime', () => {
  let pot: ProofOfTime;

  beforeEach(() => {
    pot = new ProofOfTime({ nodeId: 'test-node-1', minWorkMs: 10 });
  });

  it('produces proof with timing info', async () => {
    pot.start();
    await sleep(15);
    const proof = await pot.finish('comp-1');
    expect(proof.nodeId).toBe('test-node-1');
    expect(proof.computationId).toBe('comp-1');
    expect(proof.durationMs).toBeGreaterThanOrEqual(10);
    expect(proof.measurementHash).toBeTruthy();
    expect(proof.signature).toBeTruthy();
  });

  it('records work chunks', async () => {
    pot.start();
    pot.beginChunk('embed', 1024);
    pot.recordWork(10_000);
    await sleep(5);
    pot.endChunk();
    pot.beginChunk('attend', 2048);
    pot.recordWork(20_000);
    await sleep(5);
    pot.endChunk();

    const proof = await pot.finish('comp-2');
    expect(proof.chunks).toHaveLength(2);
    expect(proof.chunks[0].operation).toBe('embed');
    expect(proof.chunks[0].flops).toBe(10_000);
    expect(proof.chunks[1].operation).toBe('attend');
    expect(proof.chunks[1].flops).toBe(20_000);
    expect(proof.flopsEstimated).toBe(30_000);
  });

  it('verifies own proof', async () => {
    pot.start();
    await sleep(15);
    const proof = await pot.finish('comp-3');
    const verified = await pot.verifyProof(proof);
    expect(verified).toBe(true);
  });

  it('fails verification for short computation', async () => {
    pot.start();
    const proof = await pot.finish('comp-fast');
    const verified = await pot.verifyProof(proof);
    expect(verified).toBe(false);
  });

  it('fails verification when attestation required but missing', async () => {
    const strictPot = new ProofOfTime({ nodeId: 'strict', minWorkMs: 10, requireAttestation: true });
    strictPot.start();
    await sleep(15);
    const proof = await strictPot.finish('comp-4');
    const verified = await strictPot.verifyProof(proof);
    expect(verified).toBe(false);
  });

  it('fails verification with tampered signature', async () => {
    pot.start();
    await sleep(15);
    const proof = await pot.finish('comp-5');
    proof.signature = 'tampered';
    const verified = await pot.verifyProof(proof);
    expect(verified).toBe(false);
  });

  it('computes flopsPerSecond correctly', async () => {
    pot.start();
    pot.beginChunk('compute', 512);
    pot.recordWork(50_000);
    await sleep(10);
    pot.endChunk();

    const proof = await pot.finish('comp-6');
    expect(proof.flopsPerSecond).toBeGreaterThan(0);
  });

  it('returns config', () => {
    const cfg = pot.getConfig();
    expect(cfg.nodeId).toBe('test-node-1');
    expect(cfg.minWorkMs).toBe(10);
    expect(cfg.requireAttestation).toBe(false);
  });

  it('handles multiple chunks with same operation', async () => {
    pot.start();
    for (let i = 0; i < 5; i++) {
      pot.beginChunk('repeat', 128);
      pot.recordWork(1000);
      await sleep(2);
      pot.endChunk();
    }
    const proof = await pot.finish('comp-multi');
    expect(proof.chunks).toHaveLength(5);
    expect(proof.flopsEstimated).toBe(5000);
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

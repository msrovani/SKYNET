import { describe, it, expect } from 'vitest';
import { ZkFlProver, hashGradientUpdate } from '../src/zk-fl-prover.js';
import { ZkFlVerifier } from '../src/zk-fl-verifier.js';

describe('ZkFlVerifier', () => {
  it('verifies a valid simulated proof', async () => {
    const prover = new ZkFlProver({ simulate: true });
    const verifier = new ZkFlVerifier();
    const updates = [0.1, -0.2, 0.3];
    const result = await prover.generateProof('client-1', 5, updates);
    const verification = await verifier.verifyProof(result.proof!, updates);
    expect(verification.verified).toBe(true);
    expect(verification.clientId).toBe('client-1');
    expect(verification.globalStep).toBe(5);
  });

  it('rejects proof with disallowed scheme', async () => {
    const prover = new ZkFlProver({ scheme: 'stark', simulate: true });
    const verifier = new ZkFlVerifier({ allowedSchemes: ['groth16'] });
    const updates = [0.1, 0.2];
    const result = await prover.generateProof('client-1', 1, updates);
    const verification = await verifier.verifyProof(result.proof!, updates);
    expect(verification.verified).toBe(false);
    expect(verification.reason).toContain('not allowed');
  });

  it('rejects oversized proof', async () => {
    const prover = new ZkFlProver({ simulate: true, provingKeySize: 999999 });
    const verifier = new ZkFlVerifier({ maxProofSizeBytes: 100 });
    const updates = [0.1, 0.2, 0.3];
    const result = await prover.generateProof('client-1', 1, updates);
    const verification = await verifier.verifyProof(result.proof!, updates);
    expect(verification.verified).toBe(false);
    expect(verification.reason).toContain('exceeds max');
  });

  it('verifies batch proofs', async () => {
    const prover = new ZkFlProver({ simulate: true });
    const verifier = new ZkFlVerifier();
    const updates1 = [0.1, 0.2];
    const updates2 = [0.3, 0.4];
    const r1 = await prover.generateProof('c1', 1, updates1);
    const r2 = await prover.generateProof('c2', 2, updates2);
    const results = await verifier.verifyBatch([r1.proof!, r2.proof!], [updates1, updates2]);
    expect(results).toHaveLength(2);
    expect(results[0].verified).toBe(true);
    expect(results[1].verified).toBe(true);
  });

  it('checks gradient integrity', () => {
    const verifier = new ZkFlVerifier();
    const updates = new Array(256).fill(0.1);
    const computedHash = hashGradientUpdate(updates);
    const proof = {
      scheme: 'groth16' as const,
      clientId: 'c1',
      globalStep: 1,
      updateHash: computedHash,
      proofData: 'zk_sim_test',
      publicInputs: ['client_c1', 'step_1', 'hash_deadbeef'],
      timestamp: Date.now(),
      sizeBytes: 1000,
      simulated: true,
    };
    expect(verifier.verifyGradientIntegrity(updates, proof)).toBe(true);
  });

  it('fails gradient integrity for small updates', () => {
    const verifier = new ZkFlVerifier();
    const updates = [0.1, 0.2];
    const proof = {
      scheme: 'groth16' as const,
      clientId: 'c1',
      globalStep: 1,
      updateHash: 'beef',
      proofData: 'zk_sim_test',
      publicInputs: ['client_c1'],
      timestamp: Date.now(),
      sizeBytes: 100,
      simulated: true,
    };
    expect(verifier.verifyGradientIntegrity(updates, proof)).toBe(false);
  });
});

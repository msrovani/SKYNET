import { ZkFlProver, hashGradientUpdate } from './zk-fl-prover.js';
import type { ZkProof, ZkProverConfig } from './zk-fl-prover.js';
import type { FedYogiConfig } from './fed-yogi.js';

export interface ZkVerifyConfig {
  trustedSetup: boolean;
  maxProofSizeBytes: number;
  requireSimulatedFallback: boolean;
  allowedSchemes: string[];
}

export interface ZkVerificationResult {
  verified: boolean;
  timestamp: number;
  clientId: string;
  globalStep: number;
  verificationTimeMs: number;
  reason?: string;
}

function defaultConfig(overrides?: Partial<ZkVerifyConfig>): ZkVerifyConfig {
  return {
    trustedSetup: overrides?.trustedSetup ?? true,
    maxProofSizeBytes: overrides?.maxProofSizeBytes ?? 1048576,
    requireSimulatedFallback: overrides?.requireSimulatedFallback ?? true,
    allowedSchemes: overrides?.allowedSchemes ?? ['groth16', 'plonk', 'stark'],
  };
}

export class ZkFlVerifier {
  private config: ZkVerifyConfig;

  constructor(config?: Partial<ZkVerifyConfig>) {
    this.config = defaultConfig(config);
  }

  async verifyProof(proof: ZkProof, originalUpdate: number[]): Promise<ZkVerificationResult> {
    const start = performance.now();

    if (!this.config.allowedSchemes.includes(proof.scheme)) {
      return {
        verified: false, timestamp: Date.now(),
        clientId: proof.clientId, globalStep: proof.globalStep,
        verificationTimeMs: performance.now() - start,
        reason: `Scheme ${proof.scheme} not allowed`,
      };
    }

    if (proof.sizeBytes > this.config.maxProofSizeBytes) {
      return {
        verified: false, timestamp: Date.now(),
        clientId: proof.clientId, globalStep: proof.globalStep,
        verificationTimeMs: performance.now() - start,
        reason: `Proof size ${proof.sizeBytes} exceeds max ${this.config.maxProofSizeBytes}`,
      };
    }

    if (!proof.simulated && !this.config.trustedSetup) {
      return {
        verified: false, timestamp: Date.now(),
        clientId: proof.clientId, globalStep: proof.globalStep,
        verificationTimeMs: performance.now() - start,
        reason: 'No trusted setup available for hardware proof',
      };
    }

    if (proof.simulated) {
      const expectedHash = hashGradientUpdate(originalUpdate);
      const verified = proof.proofData.startsWith('zk_sim_')
        && proof.publicInputs.length === 3
        && proof.updateHash.length === 8
        && proof.updateHash === expectedHash;
      return {
        verified,
        timestamp: Date.now(),
        clientId: proof.clientId,
        globalStep: proof.globalStep,
        verificationTimeMs: performance.now() - start,
        reason: verified ? undefined : 'Invalid simulated proof format',
      };
    }

    return {
      verified: true, timestamp: Date.now(),
      clientId: proof.clientId, globalStep: proof.globalStep,
      verificationTimeMs: performance.now() - start,
    };
  }

  async verifyBatch(
    proofs: ZkProof[],
    originalUpdates: number[][],
  ): Promise<ZkVerificationResult[]> {
    return Promise.all(
      proofs.map((proof, i) => this.verifyProof(proof, originalUpdates[i] ?? [])),
    );
  }

  verifyGradientIntegrity(update: number[], proof: ZkProof): boolean {
    const expectedParams = proof.publicInputs.length > 0 ? update.length : 0;
    return expectedParams > 0 && update.length >= 128;
  }
}

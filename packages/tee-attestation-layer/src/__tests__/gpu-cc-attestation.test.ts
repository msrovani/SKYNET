import { describe, it, expect, beforeEach } from 'vitest';
import { GpuCcAttestation, type GpuEvidence } from '../gpu-cc-attestation.js';

describe('GpuCcAttestation', () => {
  let attester: GpuCcAttestation;

  beforeEach(() => {
    attester = new GpuCcAttestation({ nonceLength: 32 });
  });

  it('detectPlatforms returns at least one platform (simulate)', () => {
    const platforms = GpuCcAttestation.detectPlatforms();
    expect(platforms.length).toBeGreaterThanOrEqual(1);
    expect(platforms[0]).toMatch(/^nvidia_/);
  });

  it('constructor initializes with default config', () => {
    const defaultAttester = new GpuCcAttestation();
    expect(defaultAttester).toBeDefined();
    expect(defaultAttester.getStatus()).toBe('unchecked');
  });

  it('initialize returns true', async () => {
    const result = await attester.initialize();
    expect(result).toBe(true);
  });

  it('getStatus returns unchecked before attest', () => {
    expect(attester.getStatus()).toBe('unchecked');
  });

  it('attest returns valid evidence with all fields', async () => {
    const evidence = await attester.attest();
    expect(evidence).toBeDefined();
    expect(evidence.platform).toMatch(/^nvidia_/);
    expect(evidence.gpuModel).toBeTruthy();
    expect(evidence.driverVersion).toBeTruthy();
    expect(evidence.vbiosVersion).toBeTruthy();
    expect(evidence.attestationReport).toBeTruthy();
    expect(evidence.measurementHash).toHaveLength(64);
    expect(evidence.nonce).toBeTruthy();
    expect(evidence.timestamp).toBeGreaterThan(0);
    expect(evidence.ccMode).toBe('enabled');
    expect(typeof evidence.pcieTeeCapable).toBe('boolean');
  });

  it('attest evidence has correct platform', async () => {
    const evidence = await attester.attest();
    expect(evidence.platform).toBe('nvidia_blackwell');
  });

  it('attest evidence has nonce matching input', async () => {
    const nonce = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
    const evidence = await attester.attest(nonce);
    expect(evidence.nonce).toBe(nonce);
  });

  it('verifyReport returns true for valid evidence', async () => {
    const evidence = await attester.attest();
    const result = await attester.verifyReport(evidence, evidence.nonce);
    expect(result).toBe(true);
  });

  it('verifyReport returns false for wrong nonce', async () => {
    const evidence = await attester.attest();
    const result = await attester.verifyReport(evidence, 'wrong-nonce');
    expect(result).toBe(false);
  });

  it('verifyReport returns false for expired timestamp (>30s)', async () => {
    const evidence: GpuEvidence = {
      platform: 'nvidia_blackwell',
      gpuModel: 'B200',
      driverVersion: '570.0',
      vbiosVersion: '96.00.2E.00.01',
      attestationReport: '00'.repeat(256),
      measurementHash: 'a'.repeat(64),
      nonce: 'test-nonce',
      timestamp: Date.now() - 60_000,
      ccMode: 'enabled',
      pcieTeeCapable: true,
    };
    const result = await attester.verifyReport(evidence, 'test-nonce');
    expect(result).toBe(false);
  });

  it('getStatus returns verified after successful verification', async () => {
    const evidence = await attester.attest();
    await attester.verifyReport(evidence, evidence.nonce);
    expect(attester.getStatus()).toBe('verified');
  });

  it('reset clears status back to unchecked', async () => {
    const evidence = await attester.attest();
    await attester.verifyReport(evidence, evidence.nonce);
    expect(attester.getStatus()).toBe('verified');
    attester.reset();
    expect(attester.getStatus()).toBe('unchecked');
  });

  it('getLastEvidence returns null before attest', () => {
    expect(attester.getLastEvidence()).toBeNull();
  });

  it('getLastEvidence returns evidence after attest', async () => {
    const evidence = await attester.attest();
    expect(attester.getLastEvidence()).toEqual(evidence);
  });
});

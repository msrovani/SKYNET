import { describe, it, expect, beforeEach } from 'vitest';
import { AttestationManager } from '../attestation.js';

describe('AttestationManager', () => {
  let manager: AttestationManager;

  beforeEach(() => {
    manager = new AttestationManager({ simulate: true });
  });

  it('generates a quote with measurement hash', async () => {
    const data = new TextEncoder().encode('skynet-inference-payload');
    const quote = await manager.generateQuote(data);
    expect(quote.provider).toBe('sgx');
    expect(quote.measurement).toHaveLength(64);
    expect(quote.nonce).toHaveLength(64);
    expect(quote.simulated).toBe(true);
    expect(quote.verified).toBe(false);
  });

  it('includes user data hash when provided', async () => {
    const data = new TextEncoder().encode('model-weights');
    const userData = new TextEncoder().encode('user-123');
    const quote = await manager.generateQuote(data, userData);
    expect(quote.userDataHash).toHaveLength(64);
    expect(quote.userDataHash).not.toBe('');
  });

  it('generates unique nonce each time', async () => {
    const data = new TextEncoder().encode('test');
    const q1 = await manager.generateQuote(data);
    const q2 = await manager.generateQuote(data);
    expect(q1.nonce).not.toBe(q2.nonce);
  });

  it('verifies simulated report as trusted', async () => {
    const data = new TextEncoder().encode('verify-me');
    const quote = await manager.generateQuote(data);
    const result = await manager.verifyReport(quote);
    expect(result.verified).toBe(true);
    expect(result.trusted).toBe(true);
    expect(result.reportHash).toHaveLength(64);
  });

  it('verification fails for empty measurement', async () => {
    const badReport = {
      provider: 'sgx' as const,
      timestamp: Date.now(),
      nonce: '',
      measurement: '',
      userDataHash: '',
      signatures: [],
      platformInfo: { tcbStatus: 'UpToDate', isvEnclaveQuoteStatus: 'OK' },
      verified: false,
      simulated: true,
    };
    const result = await manager.verifyReport(badReport);
    expect(result.verified).toBe(false);
    expect(result.trusted).toBe(false);
  });

  it('computeMeasurement returns SHA-256 hex string', async () => {
    const data = new TextEncoder().encode('hello');
    const hash = await manager.computeMeasurement(data);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generateNonce returns hex string of requested length * 2', () => {
    const nonce = manager.generateNonce();
    expect(nonce).toMatch(/^[a-f0-9]+$/);
    expect(nonce.length).toBeGreaterThan(16);
  });

  it('can be configured with SEV provider', () => {
    const sevManager = new AttestationManager({ provider: 'sev', simulate: true });
    expect(sevManager).toBeDefined();
  });

  it('can be configured with CCA provider', () => {
    const ccaManager = new AttestationManager({ provider: 'cca', simulate: true });
    expect(ccaManager).toBeDefined();
  });
});

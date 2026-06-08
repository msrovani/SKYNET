import { describe, it, expect } from 'vitest';
import { TeeBridge } from '../tee-bridge.js';

describe('TeeBridge', () => {
  it('detects capabilities (simulated environment)', async () => {
    const bridge = new TeeBridge();
    const caps = await bridge.detect();
    expect(caps).toHaveProperty('available');
    expect(caps).toHaveProperty('type');
    expect(caps).toHaveProperty('gpuSupport');
    expect(caps).toHaveProperty('maxMemoryMb');
    expect(caps).toHaveProperty('attestationSupported');
  });

  it('executes operation in secure context', async () => {
    const bridge = new TeeBridge({ fallbackToSimulation: true });
    const input = new TextEncoder().encode('secret-data');
    const result = await bridge.executeSecure(input, (data) => {
      const processed = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) {
        processed[i] = data[i] ^ 0xFF;
      }
      return processed;
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeInstanceOf(Uint8Array);
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('returns execution error when operation throws', async () => {
    const bridge = new TeeBridge({ fallbackToSimulation: true });
    const input = new TextEncoder().encode('fail-data');
    const result = await bridge.executeSecure(input, () => {
      throw new Error('Computation failed');
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Computation failed');
  });

  it('fails when fallback disabled and no TEE', async () => {
    const bridge = new TeeBridge({ fallbackToSimulation: false });
    const input = new TextEncoder().encode('data');
    const result = await bridge.executeSecure(input, (d) => d);

    if (!(await bridge.detect()).available) {
      expect(result.success).toBe(false);
      expect(result.error).toContain('No TEE available');
    }
  });

  it('returns config', () => {
    const bridge = new TeeBridge({ minMemoryMb: 256, requireAttestation: true });
    const cfg = bridge.getConfig();
    expect(cfg.minMemoryMb).toBe(256);
    expect(cfg.requireAttestation).toBe(true);
    expect(cfg.allowedProviders).toContain('sgx');
    expect(cfg.fallbackToSimulation).toBe(true);
  });

  it('rejects TEE type not in allowed providers', async () => {
    const bridge = new TeeBridge({ allowedProviders: ['sev'], fallbackToSimulation: false });
    const input = new TextEncoder().encode('data');
    const result = await bridge.executeSecure(input, (d) => d);

    const caps = await bridge.detect();
    if (caps.available && caps.type !== 'sev') {
      expect(result.success).toBe(false);
      expect(result.error).toContain('not in allowed providers');
    }
  });
});

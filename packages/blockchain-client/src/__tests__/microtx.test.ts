import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@solana/web3.js', () => ({
  Connection: vi.fn(() => ({
    getBalance: vi.fn().mockResolvedValue(10_000_000_000),
    getTransaction: vi.fn().mockResolvedValue(null),
    sendTransaction: vi.fn().mockResolvedValue('mock-sig'),
    getFeeForMessage: vi.fn().mockResolvedValue({ value: 5000 }),
  })),
  PublicKey: vi.fn(() => ({})),
  Transaction: vi.fn(() => ({ add: vi.fn() })),
  SystemProgram: { transfer: vi.fn() },
  LAMPORTS_PER_SOL: 1_000_000_000,
}));

import { MicroTxManager } from '../microtx.js';
import { SolanaX402 } from '../solana-x402.js';

describe('MicroTxManager', () => {
  let x402: SolanaX402;
  let mgr: MicroTxManager;

  beforeEach(() => {
    x402 = new SolanaX402({ simulate: true, merchantWallet: 'merchant' });
    mgr = new MicroTxManager(x402);
  });

  it('pays for inference and records tx', async () => {
    const result = await mgr.payForInference('inf-1', 0.5);
    expect(result.success).toBe(true);
    expect(result.signature).toContain('sim_sig_');
    expect(result.amountUsd).toBe(0.5);
    expect(result.feeUsd).toBeGreaterThan(0);
    expect(result.status).toBe('confirmed');
  });

  it('records failed payments on error', async () => {
    const realX402 = new SolanaX402({ simulate: false });
    const errorMgr = new MicroTxManager(realX402);
    const result = await errorMgr.payForInference('fail-inf', 999);
    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.error).toBeTruthy();
  });

  it('tracks total spent', async () => {
    await mgr.payForInference('a', 1.0);
    await mgr.payForInference('b', 2.0);
    const spent = mgr.getTotalSpent();
    expect(spent).toBeCloseTo(3.0, 1);
  });

  it('tracks total fees', async () => {
    await mgr.payForInference('a', 1.0);
    await mgr.payForInference('b', 1.0);
    expect(mgr.getTotalFees()).toBeGreaterThan(0);
  });

  it('returns tx history', async () => {
    await mgr.payForInference('inf-1', 1.0);
    const history = mgr.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].amountUsd).toBe(1.0);
  });

  it('submits batch payments via channel', async () => {
    const channel = await x402.openChannel('peer', 1.0, 60);
    const batch = await mgr.submitBatch(channel.channelId, [
      { to: 'alice', amountLamports: 100_000, reference: 'ref1' },
      { to: 'bob', amountLamports: 200_000, reference: 'ref2' },
    ]);

    expect(batch.status).toBe('confirmed');
    expect(batch.totalLamports).toBe(300_000);
    expect(batch.payments.length).toBe(2);
  });

  it('pays via channel', async () => {
    const channel = await mgr.openInferenceChannel('peer', 0.5, 30);
    const result = await mgr.payViaChannel(channel.channelId, 50_000_000, 'inf-ref');
    expect(result.success).toBe(true);
    expect(result.channelId).toBe(channel.channelId);
  });

  it('closes inference channel', async () => {
    const channel = await mgr.openInferenceChannel('peer', 1, 10);
    const closed = await mgr.closeInferenceChannel(channel.channelId);
    expect(closed.finalized).toBe(true);
    expect(mgr.getOpenChannels().length).toBe(0);
  });

  it('verifies tx signature', async () => {
    const ok = await mgr.verifyTx('test-sig');
    expect(ok).toBe(true);
  });

  it('tracks batch history', async () => {
    const channel = await x402.openChannel('peer', 1, 10);
    await mgr.submitBatch(channel.channelId, [{ to: 'x', amountLamports: 100, reference: 'r1' }]);
    expect(mgr.getBatchHistory().length).toBe(1);
  });

  it('does not exceed max history size', async () => {
    const smallMgr = new MicroTxManager(x402);
    for (let i = 0; i < 10; i++) {
      await smallMgr.payForInference(`inf-${i}`, 0.001);
    }
    expect(smallMgr.getHistory().length).toBe(10);
  });
});

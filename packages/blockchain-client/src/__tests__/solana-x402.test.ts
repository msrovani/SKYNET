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

import { SolanaX402 } from '../solana-x402.js';

describe('SolanaX402', () => {
  let x402: SolanaX402;

  beforeEach(() => {
    x402 = new SolanaX402({ simulate: true, merchantWallet: 'test-wallet-123' });
  });

  it('requests a quote with pricing', async () => {
    const quote = await x402.requestQuote(5.0);
    expect(quote.amountUsd).toBe(5.0);
    expect(quote.amountLamports).toBeGreaterThan(0);
    expect(quote.currency).toBe('USDC');
    expect(quote.recipient).toBe('test-wallet-123');
    expect(quote.expiresAt).toBeGreaterThan(Date.now());
    expect(quote.exchangeRateUsdPerSol).toBe(150);
    expect(quote.feeEstimate).toBeGreaterThan(0);
  });

  it('creates a simulated payment', async () => {
    const quote = await x402.requestQuote(2.5);
    const receipt = await x402.createPayment(quote);
    expect(receipt.signature).toContain('sim_sig_');
    expect(receipt.confirmed).toBe(true);
    expect(receipt.amount).toBe(2.5);
    expect(receipt.currency).toBe('USDC');
  });

  it('verifies payment as confirmed in simulate mode', async () => {
    const status = await x402.verifyPayment('any_sig');
    expect(status).toBe('confirmed');
  });

  it('returns simulated balance', async () => {
    const balance = await x402.getBalance('any-address');
    expect(balance).toBe(10.0);
  });

  it('opens a state channel', async () => {
    const channel = await x402.openChannel('peer-456', 1.0, 60);
    expect(channel.channelId).toBeTruthy();
    expect(channel.peer).toBe('peer-456');
    expect(channel.capacity).toBe(1_000_000_000);
    expect(channel.balanceLocal).toBe(1_000_000_000);
    expect(channel.balanceRemote).toBe(0);
    expect(channel.nonce).toBe(0);
    expect(channel.finalized).toBe(false);
  });

  it('processes channel payments', async () => {
    const channel = await x402.openChannel('peer', 0.5, 30);
    const ok = await x402.channelPayment(channel.channelId, 100_000_000);
    expect(ok).toBe(true);

    const updated = await x402.closeChannel(channel.channelId);
    expect(updated.balanceLocal).toBe(400_000_000);
    expect(updated.balanceRemote).toBe(100_000_000);
    expect(updated.nonce).toBe(1);
  });

  it('rejects channel payment when insufficient balance', async () => {
    const channel = await x402.openChannel('peer', 0.1, 10);
    await expect(
      x402.channelPayment(channel.channelId, 999_000_000_000),
    ).rejects.toThrow('Insufficient channel balance');
  });

  it('rejects payment on finalized channel', async () => {
    const channel = await x402.openChannel('peer', 1, 10);
    await x402.closeChannel(channel.channelId);
    await expect(
      x402.channelPayment(channel.channelId, 100),
    ).rejects.toThrow('already finalized');
  });

  it('generates unique references', async () => {
    const refs = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const quote = await x402.requestQuote(1);
      refs.add(quote.reference);
    }
    expect(refs.size).toBe(100);
  });
});

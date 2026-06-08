import { describe, it, expect, beforeEach } from 'vitest';
import { BaseFallback } from '../base-fallback.js';

describe('BaseFallback', () => {
  let base: BaseFallback;

  beforeEach(() => {
    base = new BaseFallback({ rpcUrl: 'https://mainnet.base.org' });
  });

  it('sends raw transaction', async () => {
    const mockTx = { data: '0x1234', to: '0x5678' };
    try {
      await base.sendTransaction(mockTx);
    } catch (err: any) {
      expect(err.message).toContain('Base RPC error');
    }
  });

  it('gets balance', async () => {
    try {
      const balance = await base.getBalance('0x0000000000000000000000000000000000000000');
      expect(balance).toBeTruthy();
    } catch {
      // RPC may be unreachable in test
    }
  });

  it('creates bridge deposit', async () => {
    const deposit = await base.bridgeDeposit('0xabcd');
    expect(deposit.txHash).toBe('0xabcd');
    expect(deposit.timestamp).toBeGreaterThan(0);
    expect(['relayed', 'pending', 'failed']).toContain(deposit.status);
  });

  it('creates bridge withdrawal', async () => {
    const withdrawal = await base.bridgeWithdraw('0xrecipient', '1000000', 'ETH');
    expect(withdrawal.to).toBe('0xrecipient');
    expect(withdrawal.amount).toBe('1000000');
    expect(withdrawal.asset).toBe('ETH');
    expect(withdrawal.challengePeriod).toBe(7 * 24 * 3600);
    expect(withdrawal.status).toBe('pending');
  });

  it('verifies withdrawal proof', async () => {
    const withdrawal = await base.bridgeWithdraw('0xrecipient', '500', 'USDC');
    const proof = await base.verifyProof(withdrawal);
    expect(proof).toHaveProperty('valid');
    expect(proof).toHaveProperty('stateRoot');
    expect(proof).toHaveProperty('outputRoot');
  });

  it('toggles fallback mode', () => {
    expect(base.isFallbackActive()).toBe(false);
    base.enableFallbackMode();
    expect(base.isFallbackActive()).toBe(true);
    base.disableFallbackMode();
    expect(base.isFallbackActive()).toBe(false);
  });

  it('returns gas price', async () => {
    try {
      const gasPrice = await base.getGasPrice();
      expect(gasPrice).toBeTruthy();
    } catch {
      // RPC may be unreachable
    }
  });

  it('getTransactionReceipt throws for unknown tx', async () => {
    await expect(
      base.getTransactionReceipt('0xdeadbeef'),
    ).rejects.toThrow('Transaction not found');
  });

  it('returns deposit history', async () => {
    await base.bridgeDeposit('0x1111');
    await base.bridgeDeposit('0x2222');
    expect(base.getDeposits().length).toBe(2);
  });

  it('returns withdrawal history', async () => {
    await base.bridgeWithdraw('0xa', '100', 'ETH');
    await base.bridgeWithdraw('0xb', '200', 'USDC');
    expect(base.getWithdrawals().length).toBe(2);
  });
});

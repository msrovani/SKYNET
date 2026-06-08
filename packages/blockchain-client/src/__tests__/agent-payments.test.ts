import { describe, it, expect, beforeEach } from 'vitest';
import { AgentX402Payments } from '../agent-payments.js';

describe('AgentX402Payments', () => {
  let payments: AgentX402Payments;

  beforeEach(() => {
    // Create with minimal mock config (real SolanaX402/MicroTxManager not needed for quote tests)
    const mockX402 = {} as any;
    const mockMicrotx = {} as any;
    payments = new AgentX402Payments(mockX402, mockMicrotx, {
      ratePerTaskLamports: 1000,
      maxTaskBudget: 50_000,
      merchantWallet: 'merchant123',
    });
  });

  it('quotes task cost based on tool count', async () => {
    const quote = await payments.quoteTask('agent-1', 'task-1', 3);
    expect(quote.agentId).toBe('agent-1');
    expect(quote.taskId).toBe('task-1');
    expect(quote.toolCosts.length).toBe(3);
    expect(quote.estimatedCost).toBe(1000 + 3 * 100); // ratePerTask + 3*tool cost
  });

  it('caps cost at maxTaskBudget', async () => {
    const quote = await payments.quoteTask('agent-1', 'task-big', 1000);
    expect(quote.estimatedCost).toBe(50_000); // capped
  });

  it('provides validUntil in the future', async () => {
    const quote = await payments.quoteTask('a1', 't1', 0);
    expect(quote.validUntil).toBeGreaterThan(Date.now());
  });

  it('returns config', () => {
    const cfg = payments.getConfig();
    expect(cfg.ratePerTaskLamports).toBe(1000);
    expect(cfg.maxTaskBudget).toBe(50_000);
    expect(cfg.merchantWallet).toBe('merchant123');
  });

  it('verifyPaymentResult returns false for invalid receipt', async () => {
    const result = await payments.verifyPaymentResult({ success: false } as any, 'task-1');
    expect(result).toBe(false);
  });
});

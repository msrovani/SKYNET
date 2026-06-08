import { SolanaX402, type PaymentReceipt } from './solana-x402.js';
import { MicroTxManager, type TxResult } from './microtx.js';

export interface AgentPaymentConfig {
  ratePerTaskLamports: number;
  maxTaskBudget: number;
  merchantWallet: string;
}

export interface AgentPaymentQuote {
  taskId: string;
  agentId: string;
  estimatedCost: number;
  currency: 'USDC' | 'SOL';
  validUntil: number;
  toolCosts: Array<{ tool: string; cost: number }>;
}

export class AgentX402Payments {
  private x402: SolanaX402;
  private microtx: MicroTxManager;
  private config: AgentPaymentConfig;

  constructor(x402: SolanaX402, microtx: MicroTxManager, config: AgentPaymentConfig) {
    this.x402 = x402;
    this.microtx = microtx;
    this.config = config;
  }

  async quoteTask(agentId: string, taskId: string, toolCount: number): Promise<AgentPaymentQuote> {
    const toolCosts = Array.from({ length: toolCount }, (_, i) => ({
      tool: `tool-${i}`,
      cost: 100,
    }));
    const totalToolCost = toolCosts.reduce((s, t) => s + t.cost, 0);
    const estimatedCost = this.config.ratePerTaskLamports + totalToolCost;

    return {
      taskId,
      agentId,
      estimatedCost: Math.min(estimatedCost, this.config.maxTaskBudget),
      currency: 'USDC',
      validUntil: Date.now() + 60_000,
      toolCosts,
    };
  }

  async payTask(quote: AgentPaymentQuote, _userWallet: string): Promise<TxResult> {
    if (quote.estimatedCost <= 1000) {
      return this.microtx.payForInference(quote.taskId, quote.estimatedCost / 1e9);
    }

    return this.microtx.payForInference(quote.taskId, quote.estimatedCost / 1e9);
  }

  async verifyPaymentResult(receipt: TxResult, _taskId: string): Promise<boolean> {
    return receipt.success === true;
  }

  getConfig(): AgentPaymentConfig {
    return this.config;
  }
}

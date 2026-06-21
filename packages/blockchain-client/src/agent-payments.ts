import { SolanaX402 } from './solana-x402.js';
import { MicroTxManager, type TxResult } from './microtx.js';

const LAMPORTS_PER_SOL = 1_000_000_000; // matches @solana/web3.js LAMPORTS_PER_SOL

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

export interface PaymentChannel {
  channelId: string;
  merchantWallet: string;
  totalDeposited: number;
  spentAmount: number;
  remainingBalance: number;
  nonce: number;
  status: 'open' | 'closed' | 'disputed';
  createdAt: number;
}

export class AgentX402Payments {
  private x402: SolanaX402;
  private microtx: MicroTxManager;
  private config: AgentPaymentConfig;
  private channels: Map<string, PaymentChannel> = new Map();
  private readonly CHANNEL_COST_THRESHOLD = 10;

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
    const solPrice = await this.x402.getSolPrice();
    const freq = await this.estimateFrequency(quote.agentId);
    if (freq >= this.CHANNEL_COST_THRESHOLD) {
      return this.payViaChannel(quote, solPrice, _userWallet);
    }
    return this.microtx.payForInference(quote.taskId, quote.estimatedCost / LAMPORTS_PER_SOL * solPrice);
  }

  private async estimateFrequency(_agentId: string): Promise<number> {
    return 5;
  }

  async openChannel(merchantWallet: string, depositLamports: number): Promise<PaymentChannel> {
    const channelId = `ch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const channel: PaymentChannel = {
      channelId,
      merchantWallet,
      totalDeposited: depositLamports,
      spentAmount: 0,
      remainingBalance: depositLamports,
      nonce: 0,
      status: 'open',
      createdAt: Date.now(),
    };
    this.channels.set(channelId, channel);
    return channel;
  }

  private creatingChannels = new Set<string>();

  async payViaChannel(quote: AgentPaymentQuote, solPrice: number, _userWallet: string): Promise<TxResult> {
    const merchantWallet = this.config.merchantWallet;
    let channel = Array.from(this.channels.values())
      .find(c => c.merchantWallet === merchantWallet && c.status === 'open');

    if (!channel && !this.creatingChannels.has(merchantWallet)) {
      this.creatingChannels.add(merchantWallet);
      try {
        channel = await this.openChannel(merchantWallet, quote.estimatedCost * 10);
      } finally {
        this.creatingChannels.delete(merchantWallet);
      }
    }

    if (!channel) {
      channel = Array.from(this.channels.values())
        .find(c => c.merchantWallet === merchantWallet && c.status === 'open');
      if (!channel) throw new Error('Failed to create or find payment channel');
    }

    if (channel.remainingBalance < quote.estimatedCost) {
      channel.totalDeposited += quote.estimatedCost * 5;
      channel.remainingBalance = channel.totalDeposited - channel.spentAmount;
    }

    channel.nonce++;
    channel.spentAmount += quote.estimatedCost;
    channel.remainingBalance = channel.totalDeposited - channel.spentAmount;

    return {
      success: true,
      txHash: `channel:${channel.channelId}:nonce:${channel.nonce}`,
      feeUsd: 0,
      amountUsd: (quote.estimatedCost / LAMPORTS_PER_SOL) * solPrice,
      timestamp: Date.now(),
      channelId: channel.channelId,
      status: 'confirmed',
    };
  }

  async closeChannel(channelId: string): Promise<boolean> {
    const channel = this.channels.get(channelId);
    if (!channel) return false;
    channel.status = 'closed';
    return true;
  }

  async verifyPaymentResult(receipt: TxResult, _taskId: string): Promise<boolean> {
    return receipt.success === true;
  }

  getChannel(channelId: string): PaymentChannel | undefined {
    return this.channels.get(channelId);
  }

  getChannels(): PaymentChannel[] {
    return Array.from(this.channels.values());
  }

  getConfig(): AgentPaymentConfig {
    return this.config;
  }
}

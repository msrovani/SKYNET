import { SolanaX402, type ChannelState } from './solana-x402.js';
import { SettlementCache, UptoAuthorizer } from './x402-settlement-cache.js';

export interface TxResult {
  success: boolean;
  signature?: string;
  txHash?: string;
  error?: string;
  feeUsd: number;
  amountUsd: number;
  timestamp: number;
  channelId?: string;
  status: 'pending' | 'confirmed' | 'failed';
}

export interface BatchPayment {
  id: string;
  payments: Array<{ to: string; amountLamports: number; reference: string }>;
  totalLamports: number;
  channelId: string;
  status: 'pending' | 'submitted' | 'confirmed' | 'failed';
  submittedAt?: number;
  confirmedAt?: number;
  signature?: string;
}

export class MicroTxManager {
  private solana: SolanaX402;
  private txHistory: TxResult[] = [];
  private openChannels: Map<string, ChannelState> = new Map();
  private batches: BatchPayment[] = [];
  private readonly MAX_TX_HISTORY = 1000;
  private readonly MIN_INTERVAL_MS = 100;
  private lastTxTime = 0;
  private settlementCache: SettlementCache;
  private uptoAuthorizer: UptoAuthorizer;

  constructor(solana: SolanaX402) {
    this.solana = solana;
    this.settlementCache = solana.getSettlementCache();
    this.uptoAuthorizer = solana.getUptoAuthorizer();
  }

  async payForInference(inferenceId: string, costUsd: number): Promise<TxResult> {
    await this.throttle();

    try {
      const quote = await this.solana.requestQuote(costUsd);
      const receipt = await this.solana.createPayment(quote);

      const result: TxResult = {
        success: receipt.confirmed,
        signature: receipt.signature,
        feeUsd: receipt.feePaid,
        amountUsd: receipt.amount,
        timestamp: Date.now(),
        status: receipt.confirmed ? 'confirmed' : 'pending',
      };

      this.recordTx(result);
      return result;
    } catch (err) {
      const result: TxResult = {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        feeUsd: 0,
        amountUsd: 0,
        timestamp: Date.now(),
        status: 'failed',
      };
      this.recordTx(result);
      return result;
    }
  }

  async payViaChannel(channelId: string, amountLamports: number, _reference: string): Promise<TxResult> {
    await this.throttle();

    try {
      const ok = await this.solana.channelPayment(channelId, amountLamports);
      if (!ok) throw new Error('Channel payment failed');
      const solPrice = await this.solana.getSolPrice();

      const result: TxResult = {
        success: true,
        channelId,
        feeUsd: 0,
        amountUsd: amountLamports / 1e9 * solPrice,
        timestamp: Date.now(),
        status: 'confirmed',
      };

      this.recordTx(result);
      return result;
    } catch (err) {
      const result: TxResult = {
        success: false,
        error: err instanceof Error ? err.message : 'Channel payment failed',
        feeUsd: 0,
        amountUsd: 0,
        timestamp: Date.now(),
        status: 'failed',
        channelId,
      };
      this.recordTx(result);
      return result;
    }
  }

  async payViaUptoAuthorization(channelId: string, amountLamports: number): Promise<TxResult> {
    await this.throttle();
    const authorized = this.uptoAuthorizer.authorize(channelId, amountLamports);
    if (!authorized) {
      const result: TxResult = {
        success: false,
        error: 'Upto authorization rejected',
        feeUsd: 0,
        amountUsd: 0,
        timestamp: Date.now(),
        status: 'failed',
        channelId,
      };
      this.recordTx(result);
      return result;
    }
    try {
      const ok = await this.solana.channelPayment(channelId, amountLamports);
      if (!ok) throw new Error('Channel payment failed');
      const solPrice = await this.solana.getSolPrice();
      const result: TxResult = {
        success: true,
        channelId,
        feeUsd: 0,
        amountUsd: amountLamports / 1e9 * solPrice,
        timestamp: Date.now(),
        status: 'confirmed',
      };
      this.recordTx(result);
      return result;
    } catch (err) {
      const result: TxResult = {
        success: false,
        error: err instanceof Error ? err.message : 'Channel payment failed',
        feeUsd: 0,
        amountUsd: 0,
        timestamp: Date.now(),
        status: 'failed',
        channelId,
      };
      this.recordTx(result);
      return result;
    }
  }

  async settleSettlementCache(channelId: string, nonce: number, amount: number): Promise<boolean> {
    if (this.settlementCache.isDuplicate(channelId, nonce)) {
      return false;
    }
    this.settlementCache.markSettled(channelId, nonce, amount);
    return true;
  }

  async submitBatch(channelId: string, payments: Array<{ to: string; amountLamports: number; reference: string }>): Promise<BatchPayment> {
    const total = payments.reduce((s, p) => s + p.amountLamports, 0);
    const batch: BatchPayment = {
      id: `batch_${Date.now().toString(36)}`,
      payments,
      totalLamports: total,
      channelId,
      status: 'submitted',
      submittedAt: Date.now(),
    };

    try {
      for (let i = 0; i < payments.length; i++) {
        const p = payments[i];
        try {
          await this.solana.channelPayment(channelId, p.amountLamports);
        } catch (err) {
          for (let j = 0; j < i; j++) {
            await this.solana.channelPayment(channelId, -payments[j].amountLamports);
          }
          batch.status = 'failed';
          this.batches.push(batch);
          return batch;
        }
      }
      batch.status = 'confirmed';
      batch.confirmedAt = Date.now();
    } catch (err) {
      batch.status = 'failed';
      this.batches.push(batch);
      return batch;
    }

    this.batches.push(batch);
    return batch;
  }

  async openInferenceChannel(peer: string, capacitySol: number, durationMin: number): Promise<ChannelState> {
    const channel = await this.solana.openChannel(peer, capacitySol, durationMin);
    this.openChannels.set(channel.channelId, channel);
    return channel;
  }

  async closeInferenceChannel(channelId: string): Promise<ChannelState> {
    const state = await this.solana.closeChannel(channelId);
    this.openChannels.delete(channelId);
    return state;
  }

  async verifyTx(signature: string): Promise<boolean> {
    const status = await this.solana.verifyPayment(signature);
    return status === 'confirmed';
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastTxTime;
    if (elapsed < this.MIN_INTERVAL_MS) {
      await this.sleep(this.MIN_INTERVAL_MS - elapsed);
    }
    this.lastTxTime = Date.now();
  }

  private recordTx(result: TxResult): void {
    this.txHistory.push(result);
    if (this.txHistory.length > this.MAX_TX_HISTORY) {
      this.txHistory.shift();
    }
  }

  getHistory(): TxResult[] {
    return [...this.txHistory];
  }

  getTotalSpent(): number {
    return this.txHistory
      .filter(tx => tx.success)
      .reduce((sum, tx) => sum + tx.amountUsd, 0);
  }

  getTotalFees(): number {
    return this.txHistory
      .filter(tx => tx.success)
      .reduce((sum, tx) => sum + tx.feeUsd, 0);
  }

  getBatchHistory(): BatchPayment[] {
    return [...this.batches];
  }

  getOpenChannels(): ChannelState[] {
    return Array.from(this.openChannels.values());
  }

  getSettlementCache(): SettlementCache {
    return this.settlementCache;
  }

  getUptoAuthorizer(): UptoAuthorizer {
    return this.uptoAuthorizer;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}

export interface TokenCommitment {
  tokenIndex: number;
  tokenId: number;
  amountLamports: number;
  nonce: number;
  signature: string;
}

export class StreamingPayment {
  private channelId: string;
  private totalDeposited: number;
  private spentAmount: number = 0;
  private nonce: number = 0;
  private commitments: TokenCommitment[] = [];
  private status: 'open' | 'closed' = 'open';

  constructor(channelId: string, depositLamports: number) {
    this.channelId = channelId;
    this.totalDeposited = depositLamports;
  }

  commitToken(tokenIndex: number, tokenId: number, priceLamports: number): TokenCommitment {
    if (this.status !== 'open') throw new Error('Channel closed');
    if (this.spentAmount + priceLamports > this.totalDeposited) throw new Error('Insufficient balance');

    this.nonce++;
    this.spentAmount += priceLamports;
    const commitment: TokenCommitment = {
      tokenIndex,
      tokenId,
      amountLamports: priceLamports,
      nonce: this.nonce,
      signature: `tap:${this.channelId}:${this.nonce}:${priceLamports}`,
    };
    this.commitments.push(commitment);
    return commitment;
  }

  getPendingSettlement(): { commitments: TokenCommitment[]; totalSpent: number; nonce: number } {
    return {
      commitments: [...this.commitments],
      totalSpent: this.spentAmount,
      nonce: this.nonce,
    };
  }

  close(refundAddress: string): { spentAmount: number; refundAmount: number; refundAddress: string } {
    this.status = 'closed';
    return {
      spentAmount: this.spentAmount,
      refundAmount: this.totalDeposited - this.spentAmount,
      refundAddress,
    };
  }

  getStatus(): string { return this.status; }
  getSpent(): number { return this.spentAmount; }
  getRemaining(): number { return this.totalDeposited - this.spentAmount; }
  getChannelId(): string { return this.channelId; }
  getCommitmentCount(): number { return this.commitments.length; }

  halt(): boolean {
    if (this.status !== 'open') return false;
    this.status = 'closed';
    return true;
  }
}

export class TAPStream {
  private readonly channelId: string;
  private readonly maxTokens: number;
  private tokensCommitted: number = 0;
  private tokenChain: string[] = [];
  private halted: boolean = false;
  private readonly pricePerToken: number;

  constructor(channelId: string, maxTokens: number, pricePerToken: number = 100) {
    this.channelId = channelId;
    this.maxTokens = maxTokens;
    this.pricePerToken = pricePerToken;
  }

  commitToken(tokenId: number, secret: string): TokenCommitment {
    if (this.halted) throw new Error('Stream halted');
    if (this.tokensCommitted >= this.maxTokens) throw new Error('Max tokens reached');
    const hash = this.simpleHash(`${secret}:${this.tokensCommitted}`);
    this.tokenChain.push(hash);
    this.tokensCommitted++;
    const commitment: TokenCommitment = {
      tokenIndex: this.tokensCommitted - 1,
      tokenId,
      amountLamports: this.pricePerToken,
      nonce: this.tokensCommitted,
      signature: `tap:${this.channelId}:${this.tokensCommitted}:${hash.slice(0, 16)}`,
    };
    return commitment;
  }

  halt(): boolean {
    this.halted = true;
    return true;
  }

  isHalted(): boolean { return this.halted; }

  close(): { channelId: string; tokensCommitted: number; tokenChain: string[]; hashRoot: string } {
    const root = this.tokenChain.length > 0 ? this.tokenChain[this.tokenChain.length - 1] : 'none';
    return {
      channelId: this.channelId,
      tokensCommitted: this.tokensCommitted,
      tokenChain: [...this.tokenChain],
      hashRoot: root,
    };
  }

  private simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    }
    return hash.toString(16).padStart(8, '0');
  }
}

export interface MPPSubscription {
  planId: string;
  tier: string;
  monthlyUsd: number;
  tokenAllowance: number;
  status: 'active' | 'paused' | 'cancelled';
  startDate: number;
}

export class MPPStreaming {
  private subscriptions: Map<string, MPPSubscription> = new Map();
  private usageRecords: Array<{ planId: string; tokens: number; costUsd: number; timestamp: number }> = [];
  private readonly MAX_USAGE_RECORDS = 10000;

  createSubscription(planId: string, tier: string, monthlyUsd: number, tokenAllowance: number): MPPSubscription {
    const sub: MPPSubscription = {
      planId,
      tier,
      monthlyUsd,
      tokenAllowance,
      status: 'active',
      startDate: Date.now(),
    };
    this.subscriptions.set(planId, sub);
    return sub;
  }

  recordUsage(planId: string, tokens: number): { costUsd: number; remaining: number } | null {
    const sub = this.subscriptions.get(planId);
    if (!sub || sub.status !== 'active') return null;
    if (sub.tokenAllowance <= 0) return null;
    const costUsd = (tokens / sub.tokenAllowance) * sub.monthlyUsd;
    this.usageRecords.push({ planId, tokens, costUsd, timestamp: Date.now() });
    if (this.usageRecords.length > this.MAX_USAGE_RECORDS) {
      this.usageRecords.shift();
    }
    return { costUsd, remaining: sub.tokenAllowance - this.usageRecords.filter(r => r.planId === planId).reduce((s, r) => s + r.tokens, 0) };
  }

  cancelSubscription(planId: string): boolean {
    const sub = this.subscriptions.get(planId);
    if (!sub) return false;
    sub.status = 'cancelled';
    return true;
  }

  getSubscriptions(): MPPSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  getUsage(planId: string): Array<{ tokens: number; costUsd: number; timestamp: number }> {
    return this.usageRecords.filter(r => r.planId === planId);
  }
}

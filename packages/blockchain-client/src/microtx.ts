import { SolanaX402, type PaymentQuote, type PaymentReceipt, type ChannelState } from './solana-x402.js';

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

  constructor(solana: SolanaX402) {
    this.solana = solana;
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

  async payViaChannel(channelId: string, amountLamports: number, reference: string): Promise<TxResult> {
    await this.throttle();

    try {
      const ok = await this.solana.channelPayment(channelId, amountLamports);
      if (!ok) throw new Error('Channel payment failed');

      const result: TxResult = {
        success: true,
        channelId,
        feeUsd: 0,
        amountUsd: amountLamports / 1e9 * 150,
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
      for (const p of payments) {
        await this.solana.channelPayment(channelId, p.amountLamports);
      }
      batch.status = 'confirmed';
      batch.confirmedAt = Date.now();
    } catch (err) {
      batch.status = 'failed';
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
      await sleep(this.MIN_INTERVAL_MS - elapsed);
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
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

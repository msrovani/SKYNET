import { SolanaX402 } from './solana-x402.js';

export interface TxResult {
  success: boolean;
  signature?: string;
  error?: string;
  feeUsd: number;
}

export class MicroTxManager {
  private solana: SolanaX402;
  private txHistory: TxResult[] = [];
  private readonly MAX_TX_HISTORY = 1000;
  private readonly MIN_INTERVAL_MS = 100;

  constructor(solana: SolanaX402) {
    this.solana = solana;
  }

  async payForInference(inferenceId: string, costUsd: number): Promise<TxResult> {
    try {
      const request = await this.solana.createPaymentRequest(costUsd);
      const receipt: TxResult = {
        success: true,
        feeUsd: 0.00001,
      };
      this.recordTx(receipt);
      return receipt;
    } catch (err) {
      const result: TxResult = {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        feeUsd: 0,
      };
      this.recordTx(result);
      return result;
    }
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
      .reduce((sum, tx) => sum + tx.feeUsd, 0);
  }
}

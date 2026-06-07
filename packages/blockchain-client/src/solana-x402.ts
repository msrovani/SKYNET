import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';

export interface X402Config {
  endpoint?: string;
  merchantWallet?: string;
  usdcMint?: string;
  maxRetries?: number;
}

export interface PaymentRequest {
  amount: number;
  currency: 'USDC' | 'SOL';
  recipient: string;
  reference: string;
  expiresAt: number;
}

export interface PaymentReceipt {
  signature: string;
  slot: number;
  blockTime: number | null;
  amount: number;
}

export class SolanaX402 {
  private connection: Connection;
  private config: Required<X402Config>;

  constructor(config: X402Config = {}) {
    this.config = {
      endpoint: config.endpoint ?? 'https://api.mainnet-beta.solana.com',
      merchantWallet: config.merchantWallet ?? '',
      usdcMint: config.usdcMint ?? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      maxRetries: config.maxRetries ?? 3,
    };
    this.connection = new Connection(this.config.endpoint);
  }

  async createPaymentRequest(amountUsd: number): Promise<PaymentRequest> {
    return {
      amount: amountUsd,
      currency: 'USDC',
      recipient: this.config.merchantWallet,
      reference: crypto.randomUUID(),
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
  }

  async verifyPayment(signature: string): Promise<PaymentReceipt | null> {
    const tx = await this.connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) return null;

    return {
      signature,
      slot: tx.slot,
      blockTime: tx.blockTime ?? null,
      amount: 0,
    };
  }

  async getBalance(address: string): Promise<number> {
    const pubkey = new PublicKey(address);
    const balance = await this.connection.getBalance(pubkey);
    return balance / LAMPORTS_PER_SOL;
  }
}

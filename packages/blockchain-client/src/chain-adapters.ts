import type { PaymentQuote, PaymentReceipt, PaymentStatus } from './solana-x402.js';

export interface ChainConfig {
  chainId: number;
  rpcUrl: string;
  bridgeContract?: string;
  usdcAddress?: string;
  simulate: boolean;
}

export interface ChainQuote {
  chainId: number;
  chainName: string;
  amountUsd: number;
  amountWei: string;
  gasEstimate: number;
  gasPriceGwei: number;
  totalFeeUsd: number;
  recipient: string;
  reference: string;
  expiresAt: number;
}

export interface ChainReceipt {
  chainId: number;
  txHash: string;
  blockNumber: number;
  amount: number;
  feePaid: number;
  confirmed: boolean;
}

export function generateReference(): string {
  return `skynet_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function getGasPrice(rpcUrl: string, simulate: boolean): Promise<number> {
  if (simulate) return 50;
  try {
    const resp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_gasPrice' }),
    });
    const data = await resp.json() as any;
    return parseInt(data.result, 16) / 1e9;
  } catch {
    return 50;
  }
}

export class PolygonAdapter {
  private config: Required<ChainConfig>;
  private nonce = 0;

  constructor(config: Partial<ChainConfig> = {}) {
    this.config = {
      chainId: config.chainId ?? 137,
      rpcUrl: config.rpcUrl ?? 'https://polygon-rpc.com',
      bridgeContract: config.bridgeContract ?? '0x0000000000000000000000000000000000000000',
      usdcAddress: config.usdcAddress ?? '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      simulate: config.simulate ?? true,
    };
  }

  getChainId(): number { return this.config.chainId; }
  getChainName(): string { return 'polygon'; }

  async requestQuote(amountUsd: number): Promise<ChainQuote> {
    const gasPriceGwei = await getGasPrice(this.config.rpcUrl, this.config.simulate);
    const gasEstimate = 65000;
    const totalFeeUsd = this.config.simulate ? amountUsd * 0.002 : (gasEstimate * gasPriceGwei * 1e-9) * 1800;
    return {
      chainId: this.config.chainId,
      chainName: 'polygon',
      amountUsd,
      amountWei: Math.floor(amountUsd * 1e6).toString(),
      gasEstimate,
      gasPriceGwei,
      totalFeeUsd,
      recipient: this.config.bridgeContract!,
      reference: generateReference(),
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
  }

  async bridgeToSolana(quote: ChainQuote, fromAddress?: string): Promise<ChainReceipt> {
    if (this.config.simulate) {
      this.nonce++;
      return {
        chainId: this.config.chainId,
        txHash: `poly_tx_${this.nonce}_${Date.now().toString(36)}`,
        blockNumber: this.nonce,
        amount: quote.amountUsd,
        feePaid: quote.totalFeeUsd,
        confirmed: true,
      };
    }
    throw new Error('Real Polygon bridge not implemented');
  }

  async verifyTransaction(txHash: string): Promise<PaymentStatus> {
    return 'confirmed';
  }
}

export class ArbitrumAdapter {
  private config: Required<ChainConfig>;
  private nonce = 0;

  constructor(config: Partial<ChainConfig> = {}) {
    this.config = {
      chainId: config.chainId ?? 42161,
      rpcUrl: config.rpcUrl ?? 'https://arb1.arbitrum.io/rpc',
      bridgeContract: config.bridgeContract ?? '0x0000000000000000000000000000000000000000',
      usdcAddress: config.usdcAddress ?? '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      simulate: config.simulate ?? true,
    };
  }

  getChainId(): number { return this.config.chainId; }
  getChainName(): string { return 'arbitrum'; }

  async requestQuote(amountUsd: number): Promise<ChainQuote> {
    const gasPriceGwei = await getGasPrice(this.config.rpcUrl, this.config.simulate);
    const gasEstimate = 90000;
    const totalFeeUsd = this.config.simulate ? amountUsd * 0.003 : (gasEstimate * gasPriceGwei * 1e-9) * 1800;
    return {
      chainId: this.config.chainId,
      chainName: 'arbitrum',
      amountUsd,
      amountWei: Math.floor(amountUsd * 1e6).toString(),
      gasEstimate,
      gasPriceGwei,
      totalFeeUsd,
      recipient: this.config.bridgeContract!,
      reference: generateReference(),
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
  }

  async bridgeToSolana(quote: ChainQuote, fromAddress?: string): Promise<ChainReceipt> {
    if (this.config.simulate) {
      this.nonce++;
      return {
        chainId: this.config.chainId,
        txHash: `arb_tx_${this.nonce}_${Date.now().toString(36)}`,
        blockNumber: this.nonce,
        amount: quote.amountUsd,
        feePaid: quote.totalFeeUsd,
        confirmed: true,
      };
    }
    throw new Error('Real Arbitrum bridge not implemented');
  }

  async verifyTransaction(txHash: string): Promise<PaymentStatus> {
    return 'confirmed';
  }
}

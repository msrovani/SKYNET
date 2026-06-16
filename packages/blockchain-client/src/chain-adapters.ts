import type { PaymentStatus } from './solana-x402.js';

const MATIC_USD_PRICE = 0.60;

export type TransactionSigner = (tx: {
  to: string;
  value: string;
  data: string;
  gas: string;
  gasPrice: string;
  nonce: string;
  chainId: string;
}) => Promise<string>;

export interface ChainConfig {
  chainId: number;
  rpcUrl: string;
  bridgeContract?: string;
  usdcAddress?: string;
  simulate: boolean;
  signTransaction?: TransactionSigner;
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
    if (!data?.result) return 50;
    return parseInt(data.result, 16) / 1e9;
  } catch {
    return 50;
  }
}

export class PolygonAdapter {
  private config: Required<Omit<ChainConfig, 'signTransaction'>> & { signTransaction?: TransactionSigner };
  private nonce = 0;

  constructor(config: Partial<ChainConfig> = {}) {
    this.config = {
      chainId: config.chainId ?? 137,
      rpcUrl: config.rpcUrl ?? 'https://polygon-rpc.com',
      bridgeContract: config.bridgeContract ?? '0x0000000000000000000000000000000000000000',
      usdcAddress: config.usdcAddress ?? '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      simulate: config.simulate ?? true,
      signTransaction: config.signTransaction,
    };
  }

  getChainId(): number { return this.config.chainId; }
  getChainName(): string { return 'polygon'; }

  async requestQuote(amountUsd: number): Promise<ChainQuote> {
    const gasPriceGwei = await getGasPrice(this.config.rpcUrl, this.config.simulate);
    const gasEstimate = 65000;
    const totalFeeUsd = this.config.simulate ? amountUsd * 0.002 : (gasEstimate * gasPriceGwei * 1e-9) * MATIC_USD_PRICE;
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
    return executeBridgeTx(this.config, quote, fromAddress, this.nonce++);
  }

  async verifyTransaction(txHash: string): Promise<PaymentStatus> {
    try {
      const resp = await fetch(this.config.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] }),
      });
      const data = await resp.json() as any;
      if (data.result && data.result.blockNumber) return 'confirmed';
      return data.result ? 'pending' : 'failed';
    } catch {
      return 'failed';
    }
  }
}

export class ArbitrumAdapter {
  private config: Required<Omit<ChainConfig, 'signTransaction'>> & { signTransaction?: TransactionSigner };
  private nonce = 0;

  constructor(config: Partial<ChainConfig> = {}) {
    this.config = {
      chainId: config.chainId ?? 42161,
      rpcUrl: config.rpcUrl ?? 'https://arb1.arbitrum.io/rpc',
      bridgeContract: config.bridgeContract ?? '0x0000000000000000000000000000000000000000',
      usdcAddress: config.usdcAddress ?? '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      simulate: config.simulate ?? true,
      signTransaction: config.signTransaction,
    };
  }

  getChainId(): number { return this.config.chainId; }
  getChainName(): string { return 'arbitrum'; }

  async requestQuote(amountUsd: number): Promise<ChainQuote> {
    const gasPriceGwei = await getGasPrice(this.config.rpcUrl, this.config.simulate);
    const gasEstimate = 90000;
    const totalFeeUsd = this.config.simulate ? amountUsd * 0.003 : (gasEstimate * gasPriceGwei * 1e-9) * 0.60;
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
    return executeBridgeTx(this.config, quote, fromAddress, this.nonce++);
  }

  async verifyTransaction(txHash: string): Promise<PaymentStatus> {
    try {
      const resp = await fetch(this.config.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] }),
      });
      const data = await resp.json() as any;
      if (data.result && data.result.blockNumber) return 'confirmed';
      return data.result ? 'pending' : 'failed';
    } catch {
      return 'failed';
    }
  }
}

async function executeBridgeTx(
  config: (Required<Omit<ChainConfig, 'signTransaction'>> & { signTransaction?: TransactionSigner }),
  quote: ChainQuote,
  fromAddress: string | undefined,
  nonceVal: number,
): Promise<ChainReceipt> {
  if (!fromAddress) throw new Error('fromAddress required for real bridge');
  if (!config.signTransaction) {
    throw new Error('signTransaction required for real bridge. Pass a TransactionSigner in config or use simulate:true for development.');
  }

  const nonce = await getNonce(config.rpcUrl, fromAddress);
  const gasPriceHex = '0x' + BigInt(Math.round(quote.gasPriceGwei * 1e9)).toString(16);
  const gasHex = '0x' + quote.gasEstimate.toString(16);

  const tx = {
    to: quote.recipient,
    value: '0x0',
    data: encodeBridgeData(quote.recipient, quote.amountWei),
    gas: gasHex,
    gasPrice: gasPriceHex,
    nonce: '0x' + nonce.toString(16),
    chainId: '0x' + config.chainId.toString(16),
  };

  const signedTx = await config.signTransaction(tx);
  const resp = await fetch(config.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: [signedTx] }),
  });
  const data = await resp.json() as any;
  if (data.error) throw new Error(`Bridge tx failed: ${data.error.message}`);

  return {
    chainId: config.chainId,
    txHash: data.result,
    blockNumber: nonceVal,
    amount: quote.amountUsd,
    feePaid: quote.totalFeeUsd,
    confirmed: false,
  };
}

function encodeBridgeData(recipient: string, amountWei: string): string {
  const methodSig = '0xac5f9c6f';
  const clean = recipient.replace(/^0x/, '');
  const recipientPad = clean.padStart(64, '0');
  const amountPad = BigInt(amountWei).toString(16).padStart(64, '0');
  return methodSig + recipientPad + amountPad;
}

async function getNonce(rpcUrl: string, address: string): Promise<number> {
  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionCount', params: [address, 'pending'] }),
  });
  const data = await resp.json() as any;
  return parseInt(data.result, 16);
}

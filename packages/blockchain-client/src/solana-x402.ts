import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Keypair } from '@solana/web3.js';

export interface X402Config {
  endpoint?: string;
  merchantWallet?: string;
  usdcMint?: string;
  maxRetries?: number;
  simulate?: boolean;
}

export interface PaymentQuote {
  amountUsd: number;
  amountLamports: number;
  currency: 'USDC' | 'SOL';
  recipient: string;
  reference: string;
  expiresAt: number;
  feeEstimate: number;
  exchangeRateUsdPerSol: number;
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
  currency: 'USDC' | 'SOL';
  feePaid: number;
  confirmed: boolean;
}

export type PaymentStatus = 'pending' | 'confirmed' | 'failed';

export interface ChannelState {
  channelId: string;
  peer: string;
  capacity: number;
  balanceLocal: number;
  balanceRemote: number;
  nonce: number;
  expiresAt: number;
  finalized: boolean;
}

export interface X402V2Config {
  endpoint?: string;
  merchantWallet?: string;
  usdcMint?: string;
  useSimulate?: boolean;
  useZKCompression?: boolean;
  caipChainId?: string;
}

export interface ZKCompressedChannel {
  channelId: string;
  compressedPda: string;
  merkleRoot: string;
  proof: string;
  capacity: number;
  expiresAt: number;
}

export class SolanaX402 {
  private connection: Connection;
  private config: Required<X402Config>;
  private signerSecretKey?: Uint8Array;
  private channels: Map<string, ChannelState> = new Map();
  private paymentNonce = 0;
  private x402V2Config: X402V2Config;

  constructor(config: X402Config & { signerSecretKey?: Uint8Array } = {}) {
    this.config = {
      endpoint: config.endpoint ?? 'https://api.mainnet-beta.solana.com',
      merchantWallet: config.merchantWallet ?? '',
      usdcMint: config.usdcMint ?? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      maxRetries: config.maxRetries ?? 3,
      simulate: config.simulate ?? true,
    };
    this.signerSecretKey = (config as any).signerSecretKey;
    this.connection = new Connection(this.config.endpoint);
    this.x402V2Config = {
      endpoint: this.config.endpoint,
      merchantWallet: this.config.merchantWallet,
      usdcMint: this.config.usdcMint,
      useSimulate: this.config.simulate,
      useZKCompression: false,
      caipChainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    };
  }

  setX402V2Config(cfg: Partial<X402V2Config>): void {
    this.x402V2Config = { ...this.x402V2Config, ...cfg };
  }

  async x402V2Fetch(url: string, payload: any, priceUsd: number): Promise<Response> {
    const quote = await this.requestQuote(priceUsd);
    const receipt = await this.createPayment(quote);
    const headers = new Headers({
      'Content-Type': 'application/json',
      'X-x402-Signature': receipt.signature,
      'X-x402-Amount': String(quote.amountLamports),
      'X-x402-Currency': quote.currency,
      'X-x402-CAIP': this.x402V2Config.caipChainId!,
    });
    return fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  }

  async requestQuote(amountUsd: number): Promise<PaymentQuote> {
    const solPrice = await this.getSolPrice();
    const amountLamports = Math.floor((amountUsd / solPrice) * LAMPORTS_PER_SOL);
    const feeEstimate = this.config.simulate ? 5000 : await this.estimateFee();
    return {
      amountUsd,
      amountLamports,
      currency: 'USDC',
      recipient: this.config.merchantWallet,
      reference: this.generateReference(),
      expiresAt: Date.now() + 5 * 60 * 1000,
      feeEstimate,
      exchangeRateUsdPerSol: solPrice,
    };
  }

  async createPayment(quote: PaymentQuote, fromWallet?: string): Promise<PaymentReceipt> {
    if (this.config.simulate) {
      return this.simulatePayment(quote);
    }
    if (!fromWallet) throw new Error('fromWallet required for real payments');
    if (!this.signerSecretKey) throw new Error('signerSecretKey required in config for real payments');
    const signer = Keypair.fromSecretKey(this.signerSecretKey);
    const fromPubkey = signer.publicKey;
    const toPubkey = new PublicKey(quote.recipient);
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports: quote.amountLamports,
      }),
    );
    const sig = await this.connection.sendTransaction(tx, [signer]);
    const result = await this.confirmTransaction(sig);
    return {
      signature: sig,
      slot: result?.slot ?? 0,
      blockTime: result?.blockTime ?? null,
      amount: quote.amountUsd,
      currency: quote.currency,
      feePaid: (quote.feeEstimate / LAMPORTS_PER_SOL) * quote.exchangeRateUsdPerSol,
      confirmed: !!result,
    };
  }

  async verifyPayment(signature: string): Promise<PaymentStatus> {
    if (this.config.simulate) return 'confirmed';
    try {
      const tx = await this.connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });
      if (!tx) return 'pending';
      return 'confirmed';
    } catch {
      return 'failed';
    }
  }

  async openZKCompressedChannel(peer: string, capacitySol: number, durationMin: number): Promise<ZKCompressedChannel> {
    const channelId = this.generateReference();
    const capacityLamports = Math.floor(capacitySol * LAMPORTS_PER_SOL);
    const compressedPda = `zk_compressed_${channelId}`;
    const merkleRoot = this.simpleHash(`${channelId}:${peer}:${capacityLamports}:${durationMin}`);
    const proof = `zk_proof_${merkleRoot}`;
    return {
      channelId,
      compressedPda,
      merkleRoot,
      proof,
      capacity: capacityLamports,
      expiresAt: Date.now() + durationMin * 60 * 1000,
    };
  }

  private simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  async getBalance(address: string): Promise<number> {
    if (this.config.simulate) return 10.0;

    const pubkey = new PublicKey(address);
    const balance = await this.connection.getBalance(pubkey);
    return balance / LAMPORTS_PER_SOL;
  }

  async openChannel(peer: string, capacitySol: number, durationMin: number): Promise<ChannelState> {
    const channelId = this.generateReference();
    const state: ChannelState = {
      channelId,
      peer,
      capacity: capacitySol * LAMPORTS_PER_SOL,
      balanceLocal: capacitySol * LAMPORTS_PER_SOL,
      balanceRemote: 0,
      nonce: 0,
      expiresAt: Date.now() + durationMin * 60 * 1000,
      finalized: false,
    };
    this.channels.set(channelId, state);
    return state;
  }

  async channelPayment(channelId: string, amountLamports: number): Promise<boolean> {
    const channel = this.channels.get(channelId);
    if (!channel) throw new Error(`Channel ${channelId} not found`);
    if (channel.finalized) throw new Error('Channel already finalized');
    if (Date.now() > channel.expiresAt) throw new Error('Channel expired');
    if (amountLamports < 0) {
      if (channel.balanceRemote < -amountLamports) throw new Error('Insufficient remote balance for refund');
    } else {
      if (channel.balanceLocal < amountLamports) throw new Error('Insufficient channel balance');
    }

    channel.balanceLocal -= amountLamports;
    channel.balanceRemote += amountLamports;
    channel.nonce++;
    return true;
  }

  async closeChannel(channelId: string): Promise<ChannelState> {
    const channel = this.channels.get(channelId);
    if (!channel) throw new Error(`Channel ${channelId} not found`);
    channel.finalized = true;
    return channel;
  }

  private async simulatePayment(quote: PaymentQuote): Promise<PaymentReceipt> {
    this.paymentNonce++;
    return {
      signature: `sim_sig_${this.paymentNonce}_${Date.now().toString(36)}`,
      slot: 0,
      blockTime: Math.floor(Date.now() / 1000),
      amount: quote.amountUsd,
      currency: quote.currency,
      feePaid: (quote.feeEstimate / LAMPORTS_PER_SOL) * quote.exchangeRateUsdPerSol,
      confirmed: true,
    };
  }

  private async confirmTransaction(sig: string): Promise<{ slot: number; blockTime: number | null } | null> {
    for (let i = 0; i < this.config.maxRetries; i++) {
      const result = await this.connection.getTransaction(sig, {
        maxSupportedTransactionVersion: 0,
      });
      if (result) return { slot: result.slot, blockTime: result.blockTime ?? null };
      await sleep(1000 * (i + 1));
    }
    return null;
  }

  private async getSolPrice(): Promise<number> {
    if (this.config.simulate) return 150;
    try {
      const resp = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const data = await resp.json() as any;
      return data.solana?.usd ?? 150;
    } catch {
      return 150;
    }
  }

  private async estimateFee(): Promise<number> {
    try {
      const hash = await this.connection.getLatestBlockhash();
      return 5000 * this.config.maxRetries;
    } catch {
      return 5000;
    }
  }

  private generateReference(): string {
    return `skynet_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

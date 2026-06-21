import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { SettlementCache, UptoAuthorizer } from './x402-settlement-cache.js';

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

export interface BatchSettlementEntry {
  nonce: number;
  amount: number;
  signature: string;
  timestamp: number;
}

export interface BatchSettlement {
  channelId: string;
  entries: BatchSettlementEntry[];
  totalAmount: number;
  fromNonce: number;
  toNonce: number;
}

export interface ChannelPaymentClaim {
  channelId: string;
  amount: string;
  nonce: string;
  channelSignature: string;
  expiry?: string;
}

const X402_CONSTRUCTED_MESSAGE_DOMAIN = 'x402-channel-claim-v1';

export class SolanaX402 {
  private connection: Connection;
  private config: Required<X402Config>;
  private signerSecretKey?: Uint8Array;
  private channels: Map<string, ChannelState> = new Map();
  private paymentNonce = 0;
  private x402V2Config: X402V2Config;
  private settlementCache: SettlementCache;
  private uptoAuthorizer: UptoAuthorizer;

  constructor(config: X402Config & { signerSecretKey?: Uint8Array } = {}) {
    this.config = {
      endpoint: config.endpoint ?? 'https://api.mainnet-beta.solana.com',
      merchantWallet: config.merchantWallet ?? '',
      usdcMint: config.usdcMint ?? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      maxRetries: config.maxRetries ?? 3,
      simulate: config.simulate ?? true,
    };
    this.signerSecretKey = config.signerSecretKey;
    this.connection = new Connection(this.config.endpoint);
    this.x402V2Config = {
      endpoint: this.config.endpoint,
      merchantWallet: this.config.merchantWallet,
      usdcMint: this.config.usdcMint,
      useSimulate: this.config.simulate,
      useZKCompression: false,
      caipChainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    };
    this.settlementCache = new SettlementCache(120);
    this.uptoAuthorizer = new UptoAuthorizer();
  }

  setX402V2Config(cfg: Partial<X402V2Config>): void {
    this.x402V2Config = { ...this.x402V2Config, ...cfg };
  }

  getSettlementCache(): SettlementCache {
    return this.settlementCache;
  }

  getUptoAuthorizer(): UptoAuthorizer {
    return this.uptoAuthorizer;
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
      capacity: Math.round(capacitySol * LAMPORTS_PER_SOL),
      balanceLocal: Math.round(capacitySol * LAMPORTS_PER_SOL),
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

  async verifyChannelClaim(claim: ChannelPaymentClaim, serverPubkey: string, publicKey: Uint8Array): Promise<boolean> {
    if (this.settlementCache.isDuplicate(claim.channelId, Number(claim.nonce))) {
      return false;
    }
    const claimAmount = BigInt(claim.amount);
    const claimNonce = BigInt(claim.nonce);
    const claimExpiry = claim.expiry ? BigInt(claim.expiry) : 0n;
    if (claimExpiry > 0n) {
      const now = BigInt(Math.floor(Date.now() / 1000));
      if (now > claimExpiry) return false;
    }
    const sigBytes = Buffer.from(claim.channelSignature, 'base64');
    if (sigBytes.length !== 64) return false;
    const message = this.constructSignedMessageBuffer(claim.channelId, serverPubkey, claimAmount, claimNonce, claimExpiry);
    try {
      const valid = nacl.sign.detached.verify(message, sigBytes, publicKey);
      if (valid) {
        this.settlementCache.markSettled(claim.channelId, Number(claim.nonce), Number(claim.amount));
      }
      return valid;
    } catch {
      return false;
    }
  }

  async submitBatchSettlement(channelId: string, entries: BatchSettlementEntry[]): Promise<BatchSettlement> {
    const channel = this.channels.get(channelId);
    if (!channel) throw new Error(`Channel ${channelId} not found`);
    let totalAmount = 0;
    let minNonce = Infinity;
    let maxNonce = -Infinity;
    for (const entry of entries) {
      if (this.settlementCache.isDuplicate(channelId, entry.nonce)) {
        throw new Error(`Duplicate settlement nonce ${entry.nonce} for channel ${channelId}`);
      }
      totalAmount += entry.amount;
      if (entry.nonce < minNonce) minNonce = entry.nonce;
      if (entry.nonce > maxNonce) maxNonce = entry.nonce;
    }
    if (channel.balanceLocal < totalAmount) throw new Error('Insufficient channel balance for batch settlement');
    channel.balanceLocal -= totalAmount;
    channel.balanceRemote += totalAmount;
    channel.nonce = Math.max(channel.nonce, maxNonce);
    for (const entry of entries) {
      this.settlementCache.markSettled(channelId, entry.nonce, entry.amount);
    }
    return {
      channelId,
      entries: [...entries],
      totalAmount,
      fromNonce: minNonce,
      toNonce: maxNonce,
    };
  }

  private constructSignedMessageBuffer(
    channelId: string,
    server: string,
    amount: bigint,
    nonce: bigint,
    expiry: bigint,
  ): Uint8Array {
    const message = Buffer.alloc(109);
    let offset = 0;
    const channelPadded = channelId.padEnd(32, '\0').slice(0, 32);
    const serverPadded = server.padEnd(32, '\0').slice(0, 32);
    Buffer.from(X402_CONSTRUCTED_MESSAGE_DOMAIN, 'utf-8').copy(message, offset);
    offset += 21;
    Buffer.from(channelPadded, 'utf-8').copy(message, offset);
    offset += 32;
    Buffer.from(serverPadded, 'utf-8').copy(message, offset);
    offset += 32;
    message.writeBigUInt64LE(amount, offset);
    offset += 8;
    message.writeBigUInt64LE(nonce, offset);
    offset += 8;
    message.writeBigUInt64LE(expiry, offset);
    return message;
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
      await this.sleep(1000 * (i + 1));
    }
    return null;
  }

  async getSolPrice(): Promise<number> {
    if (this.config.simulate) return 150;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await resp.json() as any;
      const price = data.solana?.usd;
      return (price != null && price > 0) ? price : 150;
    } catch {
      return 150;
    }
  }

  private async estimateFee(): Promise<number> {
    try {
      await this.connection.getLatestBlockhash();
      return 5000 * this.config.maxRetries;
    } catch {
      return 5000;
    }
  }

  private generateReference(): string {
    return `skynet_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}

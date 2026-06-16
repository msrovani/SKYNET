import nacl from 'tweetnacl';

export interface SettlementMetadata {
  channelId: string;
  amount: number;
  nonce: number;
  timestamp: number;
}

export interface SettlementEntry {
  metadata: SettlementMetadata;
  expiresAt: number;
}

export class SettlementCache {
  private cache: Map<string, SettlementEntry> = new Map();
  private ttlMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(ttlSeconds: number = 120, cleanupIntervalMs: number = 30_000) {
    this.ttlMs = ttlSeconds * 1000;
    if (cleanupIntervalMs > 0) {
      this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
      if (this.cleanupInterval?.unref) {
        this.cleanupInterval.unref();
      }
    }
  }

  has(key: string): boolean {
    this.cleanup();
    return this.cache.has(key);
  }

  set(key: string, metadata: SettlementMetadata): void {
    this.cache.set(key, {
      metadata,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  get(key: string): SettlementMetadata | undefined {
    this.cleanup();
    return this.cache.get(key)?.metadata;
  }

  isDuplicate(channelId: string, nonce: number): boolean {
    const key = `${channelId}:${nonce}`;
    return this.has(key);
  }

  markSettled(channelId: string, nonce: number, amount: number): void {
    const key = `${channelId}:${nonce}`;
    this.set(key, { channelId, amount, nonce, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    this.cleanup();
    return this.cache.size;
  }

  close(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
      }
    }
  }
}

export interface UptoAuthorization {
  channelId: string;
  maxAmount: number;
  currentAmount: number;
  nonce: number;
  timeout: number;
  expiresAt: number;
  signature?: string;
}

export class UptoAuthorizer {
  private authorizations: Map<string, UptoAuthorization> = new Map();

  create(channelId: string, maxAmount: number, timeoutMs: number = 300_000, signature?: string): UptoAuthorization {
    const auth: UptoAuthorization = {
      channelId,
      maxAmount,
      currentAmount: 0,
      nonce: 0,
      timeout: timeoutMs,
      expiresAt: Date.now() + timeoutMs,
      signature,
    };
    this.authorizations.set(channelId, auth);
    return auth;
  }

  authorize(channelId: string, amount: number): boolean {
    const auth = this.authorizations.get(channelId);
    if (!auth) return false;
    if (Date.now() > auth.expiresAt) return false;
    if (auth.currentAmount + amount > auth.maxAmount) return false;
    auth.currentAmount += amount;
    auth.nonce++;
    return true;
  }

  increaseMax(channelId: string, additionalAmount: number): boolean {
    const auth = this.authorizations.get(channelId);
    if (!auth) return false;
    auth.maxAmount += additionalAmount;
    auth.expiresAt = Date.now() + auth.timeout;
    return true;
  }

  get(channelId: string): UptoAuthorization | undefined {
    const auth = this.authorizations.get(channelId);
    if (auth && Date.now() > auth.expiresAt) {
      this.authorizations.delete(channelId);
      return undefined;
    }
    return auth;
  }

  revoke(channelId: string): void {
    this.authorizations.delete(channelId);
  }

  clear(): void {
    this.authorizations.clear();
  }
}

export function constructSettlementMessage(
  channelId: string,
  serverPubkey: string,
  amount: number,
  nonce: number,
  expiry: number,
): Uint8Array {
  const domain = new TextEncoder().encode('x402-settlement-v1');
  const channelIdBytes = new TextEncoder().encode(channelId.padEnd(32, '\0').slice(0, 32));
  const serverBytes = new TextEncoder().encode(serverPubkey.padEnd(32, '\0').slice(0, 32));
  const amountBuf = new Uint8Array(8);
  const nonceBuf = new Uint8Array(8);
  const expiryBuf = new Uint8Array(8);
  new DataView(amountBuf.buffer).setBigUint64(0, BigInt(amount), true);
  new DataView(nonceBuf.buffer).setBigUint64(0, BigInt(nonce), true);
  new DataView(expiryBuf.buffer).setBigUint64(0, BigInt(expiry), true);
  return new Uint8Array([
    ...domain,
    ...channelIdBytes,
    ...serverBytes,
    ...amountBuf,
    ...nonceBuf,
    ...expiryBuf,
  ]);
}

export function signSettlementMessage(
  channelId: string,
  serverPubkey: string,
  amount: number,
  nonce: number,
  expiry: number,
  secretKey: Uint8Array,
): Uint8Array {
  const message = constructSettlementMessage(channelId, serverPubkey, amount, nonce, expiry);
  return nacl.sign.detached(message, secretKey);
}

export function verifySettlementMessage(
  channelId: string,
  serverPubkey: string,
  amount: number,
  nonce: number,
  expiry: number,
  signature: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  try {
    const message = constructSettlementMessage(channelId, serverPubkey, amount, nonce, expiry);
    return nacl.sign.detached.verify(message, signature, publicKey);
  } catch {
    return false;
  }
}

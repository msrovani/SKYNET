import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('@solana/web3.js', () => ({
  Connection: vi.fn(() => ({
    getBalance: vi.fn().mockResolvedValue(10_000_000_000),
    getTransaction: vi.fn().mockResolvedValue(null),
    sendTransaction: vi.fn().mockResolvedValue('mock-sig'),
    getFeeForMessage: vi.fn().mockResolvedValue({ value: 5000 }),
  })),
  PublicKey: vi.fn(() => ({ toBuffer: () => Buffer.alloc(32), toBytes: () => new Uint8Array(32), toBase58: () => 'mock-pubkey', equals: vi.fn() })),
  Transaction: vi.fn(() => ({ add: vi.fn() })),
  SystemProgram: { transfer: vi.fn() },
  LAMPORTS_PER_SOL: 1_000_000_000,
}));

vi.mock('tweetnacl', () => ({
  default: {
    sign: {
      detached: {
        verify: vi.fn((_msg: Uint8Array, _sig: Uint8Array, _key: Uint8Array) => true),
        sign: vi.fn((_msg: Uint8Array, _key: Uint8Array) => new Uint8Array(64)),
      },
    },
  },
  sign: {
    detached: {
      verify: vi.fn((_msg: Uint8Array, _sig: Uint8Array, _key: Uint8Array) => true),
      sign: vi.fn((_msg: Uint8Array, _key: Uint8Array) => new Uint8Array(64)),
    },
  },
}));

import { SettlementCache, UptoAuthorizer } from '../x402-settlement-cache.js';
import { SolanaX402, type ChannelPaymentClaim } from '../solana-x402.js';
import { MicroTxManager } from '../microtx.js';

describe('SettlementCache', () => {
  let cache: SettlementCache;

  beforeEach(() => {
    cache = new SettlementCache(120, 0);
  });

  afterEach(() => {
    cache.close();
  });

  it('stores and retrieves by key', () => {
    cache.markSettled('ch1', 1, 1000);
    expect(cache.has('ch1:1')).toBe(true);
    expect(cache.isDuplicate('ch1', 1)).toBe(true);
  });

  it('rejects duplicate within TTL', () => {
    cache.markSettled('ch1', 1, 1000);
    expect(cache.isDuplicate('ch1', 1)).toBe(true);
    cache.markSettled('ch1', 2, 2000);
    expect(cache.isDuplicate('ch1', 2)).toBe(true);
    expect(cache.size()).toBe(2);
  });

  it('allows after TTL expiry (mock Date)', () => {
    const orig = Date.now;
    const now = 1000000;
    try {
      Date.now = vi.fn(() => now);
      cache.markSettled('ch1', 1, 1000);
      Date.now = vi.fn(() => now + 121_000);
      expect(cache.isDuplicate('ch1', 1)).toBe(false);
    } finally {
      Date.now = orig;
    }
  });

  it('clear removes all entries', () => {
    cache.markSettled('ch1', 1, 100);
    cache.markSettled('ch2', 2, 200);
    expect(cache.size()).toBe(2);
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it('has returns correct boolean', () => {
    expect(cache.has('nonexistent')).toBe(false);
    cache.markSettled('ch1', 1, 100);
    expect(cache.has('ch1:1')).toBe(true);
  });

  it('size returns correct count', () => {
    expect(cache.size()).toBe(0);
    cache.markSettled('ch1', 1, 100);
    expect(cache.size()).toBe(1);
    cache.markSettled('ch1', 2, 200);
    expect(cache.size()).toBe(2);
  });
});

describe('UptoAuthorizer', () => {
  let authorizer: UptoAuthorizer;

  beforeEach(() => {
    authorizer = new UptoAuthorizer();
  });

  it('creates valid authorization', () => {
    const auth = authorizer.create('ch1', 10000, 300_000);
    expect(auth.channelId).toBe('ch1');
    expect(auth.maxAmount).toBe(10000);
    expect(auth.currentAmount).toBe(0);
    expect(auth.nonce).toBe(0);
    expect(auth.expiresAt).toBeGreaterThan(Date.now());
  });

  it('respects maxAmount', () => {
    authorizer.create('ch1', 1000, 300_000);
    expect(authorizer.authorize('ch1', 600)).toBe(true);
    expect(authorizer.authorize('ch1', 500)).toBe(false);
    expect(authorizer.authorize('ch1', 400)).toBe(true);
  });

  it('can be increased', () => {
    authorizer.create('ch1', 1000, 300_000);
    expect(authorizer.authorize('ch1', 1000)).toBe(true);
    expect(authorizer.authorize('ch1', 1)).toBe(false);
    const increased = authorizer.increaseMax('ch1', 500);
    expect(increased).toBe(true);
    expect(authorizer.authorize('ch1', 500)).toBe(true);
  });

  it('expires after timeout', () => {
    const orig = Date.now;
    Date.now = vi.fn(() => 1000000);
    authorizer.create('ch1', 10000, 10);
    Date.now = vi.fn(() => 1000011);
    expect(authorizer.authorize('ch1', 100)).toBe(false);
    Date.now = orig;
  });

  it('get returns undefined for expired auths', () => {
    const orig = Date.now;
    Date.now = vi.fn(() => 1000000);
    authorizer.create('ch1', 10000, 10);
    Date.now = vi.fn(() => 1000011);
    expect(authorizer.get('ch1')).toBeUndefined();
    Date.now = orig;
  });

  it('revoke removes authorization', () => {
    authorizer.create('ch1', 10000, 300_000);
    expect(authorizer.get('ch1')).toBeDefined();
    authorizer.revoke('ch1');
    expect(authorizer.get('ch1')).toBeUndefined();
  });

  it('clear removes all authorizations', () => {
    authorizer.create('ch1', 1000, 300_000);
    authorizer.create('ch2', 2000, 300_000);
    authorizer.clear();
    expect(authorizer.get('ch1')).toBeUndefined();
    expect(authorizer.get('ch2')).toBeUndefined();
  });
});

describe('ChannelPaymentClaim verification', () => {
  let x402: SolanaX402;

  beforeEach(() => {
    x402 = new SolanaX402({ simulate: true, merchantWallet: 'merchant' });
  });

  it('validates channel claim signatures', async () => {
    const claim: ChannelPaymentClaim = {
      channelId: 'ch_test_123',
      amount: '1000',
      nonce: '1',
      channelSignature: Buffer.from(new Uint8Array(64)).toString('base64'),
    };
    const serverPubkey = 'server-pubkey-123';
    const publicKey = new Uint8Array(32);
    const valid = await x402.verifyChannelClaim(claim, serverPubkey, publicKey);
    expect(valid).toBe(true);
  });

  it('rejects duplicate channel claims', async () => {
    const claim: ChannelPaymentClaim = {
      channelId: 'ch_dup',
      amount: '500',
      nonce: '1',
      channelSignature: Buffer.from(new Uint8Array(64)).toString('base64'),
    };
    const serverPubkey = 'server-pubkey-123';
    const publicKey = new Uint8Array(32);
    const first = await x402.verifyChannelClaim(claim, serverPubkey, publicKey);
    expect(first).toBe(true);
    const second = await x402.verifyChannelClaim(claim, serverPubkey, publicKey);
    expect(second).toBe(false);
  });

  it('rejects expired channel claims', async () => {
    const orig = Date.now;
    Date.now = vi.fn(() => 1000000);
    const claim: ChannelPaymentClaim = {
      channelId: 'ch_exp',
      amount: '500',
      nonce: '2',
      channelSignature: Buffer.from(new Uint8Array(64)).toString('base64'),
      expiry: '999',
    };
    const serverPubkey = 'server-pubkey-123';
    const publicKey = new Uint8Array(32);
    const valid = await x402.verifyChannelClaim(claim, serverPubkey, publicKey);
    expect(valid).toBe(false);
    Date.now = orig;
  });

  it('rejects claims with wrong signature length', async () => {
    const claim: ChannelPaymentClaim = {
      channelId: 'ch_bad_sig',
      amount: '500',
      nonce: '3',
      channelSignature: Buffer.from(new Uint8Array(32)).toString('base64'),
    };
    const serverPubkey = 'server-pubkey-123';
    const publicKey = new Uint8Array(32);
    const valid = await x402.verifyChannelClaim(claim, serverPubkey, publicKey);
    expect(valid).toBe(false);
  });
});

describe('BatchSettlement', () => {
  let x402: SolanaX402;

  beforeEach(() => {
    x402 = new SolanaX402({ simulate: true, merchantWallet: 'merchant' });
  });

  it('accumulates multiple payments', async () => {
    const channel = await x402.openChannel('peer', 10.0, 60);
    const entries = [
      { nonce: 1, amount: 100_000, signature: 'sig1', timestamp: Date.now() },
      { nonce: 2, amount: 200_000, signature: 'sig2', timestamp: Date.now() },
    ];
    const settlement = await x402.submitBatchSettlement(channel.channelId, entries);
    expect(settlement.totalAmount).toBe(300_000);
    expect(settlement.fromNonce).toBe(1);
    expect(settlement.toNonce).toBe(2);
    expect(settlement.entries.length).toBe(2);
  });

  it('rejects duplicate nonces in batch', async () => {
    const channel = await x402.openChannel('peer_batch', 1.0, 60);
    const entries = [
      { nonce: 1, amount: 100_000, signature: 'sig1', timestamp: Date.now() },
    ];
    await x402.submitBatchSettlement(channel.channelId, entries);
    await expect(
      x402.submitBatchSettlement(channel.channelId, [
        { nonce: 1, amount: 50_000, signature: 'sig2', timestamp: Date.now() },
      ]),
    ).rejects.toThrow('Duplicate settlement nonce');
  });
});

describe('MicroTxManager with SettlementCache', () => {
  let x402: SolanaX402;
  let mgr: MicroTxManager;

  beforeEach(() => {
    x402 = new SolanaX402({ simulate: true, merchantWallet: 'merchant' });
    mgr = new MicroTxManager(x402);
  });

  it('settles via settlement cache', async () => {
    const first = await mgr.settleSettlementCache('ch1', 1, 1000);
    expect(first).toBe(true);
    const second = await mgr.settleSettlementCache('ch1', 1, 1000);
    expect(second).toBe(false);
  });

  it('pays via upto authorization', async () => {
    const channel = await mgr.openInferenceChannel('peer', 1.0, 60);
    mgr.getUptoAuthorizer().create(channel.channelId, 500_000_000, 300_000);
    const result = await mgr.payViaUptoAuthorization(channel.channelId, 100_000_000);
    expect(result.success).toBe(true);
    expect(result.channelId).toBe(channel.channelId);
  });

  it('rejects upto payment beyond authorization', async () => {
    const channel = await mgr.openInferenceChannel('peer', 0.1, 10);
    mgr.getUptoAuthorizer().create(channel.channelId, 10_000, 300_000);
    const result = await mgr.payViaUptoAuthorization(channel.channelId, 100_000_000);
    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
  });
});

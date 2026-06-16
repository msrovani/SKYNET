import { describe, it, expect } from 'vitest';

describe('PolygonAdapter', () => {
  it('quotes with simulated gas', async () => {
    const { PolygonAdapter } = await import('../chain-adapters.js');
    const adapter = new PolygonAdapter({ simulate: true });
    const quote = await adapter.requestQuote(10);
    expect(quote.chainName).toBe('polygon');
    expect(quote.amountUsd).toBe(10);
    expect(quote.gasPriceGwei).toBe(50);
    expect(quote.expiresAt).toBeGreaterThan(Date.now());
  });

  it('bridges to Solana in simulation mode', async () => {
    const { PolygonAdapter } = await import('../chain-adapters.js');
    const adapter = new PolygonAdapter({ simulate: true });
    const quote = await adapter.requestQuote(5);
    const receipt = await adapter.bridgeToSolana(quote);
    expect(receipt.chainId).toBe(137);
    expect(receipt.confirmed).toBe(true);
    expect(receipt.txHash).toContain('poly_tx');
  });
});

describe('ArbitrumAdapter', () => {
  it('quotes with simulated gas', async () => {
    const { ArbitrumAdapter } = await import('../chain-adapters.js');
    const adapter = new ArbitrumAdapter({ simulate: true });
    const quote = await adapter.requestQuote(25);
    expect(quote.chainName).toBe('arbitrum');
    expect(quote.amountUsd).toBe(25);
    expect(quote.reference).toContain('skynet');
  });

  it('produces bridge receipt', async () => {
    const { ArbitrumAdapter } = await import('../chain-adapters.js');
    const adapter = new ArbitrumAdapter({ simulate: true });
    const quote = await adapter.requestQuote(100);
    const receipt = await adapter.bridgeToSolana(quote);
    expect(receipt.txHash).toContain('arb_tx');
    expect(receipt.feePaid).toBeGreaterThan(0);
  });
});

describe('MultiChainRouter', () => {
  it('registers adapters and lists chains', async () => {
    const { MultiChainRouter } = await import('../multi-chain-router.js');
    const { PolygonAdapter, ArbitrumAdapter } = await import('../chain-adapters.js');
    const router = new MultiChainRouter();
    router.registerAdapter('polygon', new PolygonAdapter({ simulate: true }));
    router.registerAdapter('arbitrum', new ArbitrumAdapter({ simulate: true }));
    const chains = router.getRegisteredChains();
    expect(chains).toContain('polygon');
    expect(chains).toContain('arbitrum');
    expect(chains).toHaveLength(2);
  });

  it('returns routes with fee estimates', async () => {
    const { MultiChainRouter } = await import('../multi-chain-router.js');
    const { PolygonAdapter, ArbitrumAdapter } = await import('../chain-adapters.js');
    const router = new MultiChainRouter();
    router.registerAdapter('polygon', new PolygonAdapter({ simulate: true }));
    router.registerAdapter('arbitrum', new ArbitrumAdapter({ simulate: true }));
    const routes = await router.getRoutes(50);
    expect(routes.length).toBeGreaterThanOrEqual(2);
    for (const r of routes) {
      expect(r.feeUsd).toBeGreaterThan(0);
      expect(r.estimatedConfirmMs).toBeGreaterThan(0);
    }
  });

  it('selects best route by fee and speed', async () => {
    const { MultiChainRouter } = await import('../multi-chain-router.js');
    const { PolygonAdapter, ArbitrumAdapter } = await import('../chain-adapters.js');
    const router = new MultiChainRouter({ maxFeeUsd: 1.0 });
    router.registerAdapter('polygon', new PolygonAdapter({ simulate: true }));
    router.registerAdapter('arbitrum', new ArbitrumAdapter({ simulate: true }));
    const route = await router.selectBestRoute(10);
    expect(route).not.toBeNull();
    expect(['polygon', 'arbitrum']).toContain(route!.chainName);
  });

  it('prefers configured chain if under max fee', async () => {
    const { MultiChainRouter } = await import('../multi-chain-router.js');
    const { PolygonAdapter, ArbitrumAdapter } = await import('../chain-adapters.js');
    const router = new MultiChainRouter({ preferredChain: 'polygon', maxFeeUsd: 1.0 });
    router.registerAdapter('polygon', new PolygonAdapter({ simulate: true }));
    router.registerAdapter('arbitrum', new ArbitrumAdapter({ simulate: true }));
    const route = await router.selectBestRoute(10);
    expect(route?.chainName).toBe('polygon');
  });

  it('returns null when all routes exceed maxFee', async () => {
    const { MultiChainRouter } = await import('../multi-chain-router.js');
    const { PolygonAdapter, ArbitrumAdapter } = await import('../chain-adapters.js');
    const router = new MultiChainRouter({ maxFeeUsd: 0.0001, feeWeight: 1.0 });
    router.registerAdapter('polygon', new PolygonAdapter({ simulate: true }));
    router.registerAdapter('arbitrum', new ArbitrumAdapter({ simulate: true }));
    const route = await router.selectBestRoute(100);
    expect(route).toBeNull();
  });

  it('bridges via best route and emits events', async () => {
    const { MultiChainRouter } = await import('../multi-chain-router.js');
    const { PolygonAdapter, ArbitrumAdapter } = await import('../chain-adapters.js');
    const router = new MultiChainRouter({ maxFeeUsd: 1.0 });
    router.registerAdapter('polygon', new PolygonAdapter({ simulate: true }));
    router.registerAdapter('arbitrum', new ArbitrumAdapter({ simulate: true }));
    const events: string[] = [];
    router.onEvent(e => events.push(e.type));
    const result = await router.bridgeViaBestRoute(20);
    expect(result).not.toBeNull();
    expect(events).toContain('route-selected');
    expect(events).toContain('bridge-started');
    expect(events).toContain('bridge-completed');
  });

  it('falls back when no route available', async () => {
    const { MultiChainRouter } = await import('../multi-chain-router.js');
    const router = new MultiChainRouter();
    const result = await router.bridgeViaBestRoute(10);
    expect(result).toBeNull();
  });

  it('updates config dynamically', async () => {
    const { MultiChainRouter } = await import('../multi-chain-router.js');
    const router = new MultiChainRouter({ maxFeeUsd: 0.5 });
    expect(router.getConfig().maxFeeUsd).toBe(0.5);
    router.updateConfig({ maxFeeUsd: 0.1 });
    expect(router.getConfig().maxFeeUsd).toBe(0.1);
  });
});

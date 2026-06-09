import { PolygonAdapter, ArbitrumAdapter } from './chain-adapters.js';
import type { ChainQuote, ChainReceipt } from './chain-adapters.js';
import { generateReference } from './chain-adapters.js';

export interface ChainRoute {
  chainId: number;
  chainName: string;
  quote: ChainQuote;
  feeUsd: number;
  estimatedConfirmMs: number;
}

export interface RoutingConfig {
  preferredChain?: string;
  maxFeeUsd: number;
  requireBridge: boolean;
  feeWeight: number;
  speedWeight: number;
}

export type RouterEventType = 'route-selected' | 'bridge-started' | 'bridge-completed' | 'bridge-failed' | 'fallback-solana';
export interface RouterEvent {
  type: RouterEventType;
  chainName?: string;
  amountUsd?: number;
  feeUsd?: number;
  txHash?: string;
  error?: string;
}
export type RouterCallback = (event: RouterEvent) => void;

const ESTIMATED_CONFIRM_MS: Record<string, number> = {
  solana: 5000,
  polygon: 30000,
  arbitrum: 15000,
};

export class MultiChainRouter {
  private adapters: Map<string, PolygonAdapter | ArbitrumAdapter> = new Map();
  private config: RoutingConfig;
  private callbacks: Set<RouterCallback> = new Set();

  constructor(config: Partial<RoutingConfig> = {}) {
    this.config = {
      preferredChain: config.preferredChain ?? '',
      maxFeeUsd: config.maxFeeUsd ?? 0.50,
      requireBridge: config.requireBridge ?? true,
      feeWeight: config.feeWeight ?? 0.7,
      speedWeight: config.speedWeight ?? 0.3,
    };
  }

  onEvent(cb: RouterCallback): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  private emit(event: RouterEvent): void {
    for (const cb of this.callbacks) cb(event);
  }

  registerAdapter(name: string, adapter: PolygonAdapter | ArbitrumAdapter): void {
    this.adapters.set(name, adapter);
  }

  async getRoutes(amountUsd: number): Promise<ChainRoute[]> {
    const routes: ChainRoute[] = [];

    for (const [name, adapter] of this.adapters) {
      const quote = await adapter.requestQuote(amountUsd);
      routes.push({
        chainId: quote.chainId,
        chainName: quote.chainName,
        quote,
        feeUsd: quote.totalFeeUsd,
        estimatedConfirmMs: ESTIMATED_CONFIRM_MS[name] ?? 30000,
      });
    }

    return routes;
  }

  async selectBestRoute(amountUsd: number): Promise<ChainRoute | null> {
    const routes = await this.getRoutes(amountUsd);
    if (routes.length === 0) return null;

    if (this.config.preferredChain) {
      const preferred = routes.find(r => r.chainName === this.config.preferredChain);
      if (preferred && preferred.feeUsd <= this.config.maxFeeUsd) return preferred;
    }

    const maxFee = Math.max(...routes.map(r => r.feeUsd), 0.01);
    const maxSpeed = Math.max(...routes.map(r => r.estimatedConfirmMs), 1);

    routes.sort((a, b) => {
      const aFeeScore = 1 - a.feeUsd / maxFee;
      const bFeeScore = 1 - b.feeUsd / maxFee;
      const aSpeedScore = 1 - a.estimatedConfirmMs / maxSpeed;
      const bSpeedScore = 1 - b.estimatedConfirmMs / maxSpeed;
      const aTotal = this.config.feeWeight * aFeeScore + this.config.speedWeight * aSpeedScore;
      const bTotal = this.config.feeWeight * bFeeScore + this.config.speedWeight * bSpeedScore;
      return bTotal - aTotal;
    });

    const best = routes[0];
    if (best.feeUsd > this.config.maxFeeUsd) return null;

    return best;
  }

  async bridgeViaBestRoute(amountUsd: number): Promise<{ route: ChainRoute; receipt: ChainReceipt } | null> {
    const route = await this.selectBestRoute(amountUsd);
    if (!route) {
      this.emit({ type: 'fallback-solana', amountUsd, error: 'no L2 route under max fee' });
      return null;
    }

    const adapter = this.adapters.get(route.chainName);
    if (!adapter) return null;

    this.emit({ type: 'route-selected', chainName: route.chainName, amountUsd, feeUsd: route.feeUsd });
    this.emit({ type: 'bridge-started', chainName: route.chainName, amountUsd });

    try {
      const receipt = await adapter.bridgeToSolana(route.quote);
      this.emit({ type: 'bridge-completed', chainName: route.chainName, txHash: receipt.txHash });
      return { route, receipt };
    } catch (err) {
      this.emit({ type: 'bridge-failed', chainName: route.chainName, error: (err as Error).message });
      return null;
    }
  }

  getAdapter(name: string): PolygonAdapter | ArbitrumAdapter | undefined {
    return this.adapters.get(name);
  }

  getRegisteredChains(): string[] {
    return Array.from(this.adapters.keys());
  }

  updateConfig(cfg: Partial<RoutingConfig>): void {
    this.config = { ...this.config, ...cfg };
  }

  getConfig(): RoutingConfig {
    return { ...this.config };
  }
}

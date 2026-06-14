import { FedYogi } from './fed-yogi.js';

export class FEDADAVR extends FedYogi {
  private clientUpdates: Map<string, number[]> = new Map();

  constructor() {
    super({ beta1: 0.9, beta2: 0.99, tau: 0.001 });
  }

  storeClientUpdate(clientId: string, update: number[]): void {
    this.clientUpdates.set(clientId, update);
    if (this.clientUpdates.size > 1000) {
      const firstKey = this.clientUpdates.keys().next().value;
      if (firstKey) this.clientUpdates.delete(firstKey);
    }
  }

  aggregateWithVarianceReduction(activeClients: string[]): number[] {
    const updates = activeClients
      .map(id => this.clientUpdates.get(id))
      .filter((u): u is number[] => u !== undefined);

    if (updates.length === 0) return [];

    // TODO: variance reduction via historical control variates is pending implementation
    return this.aggregateClientUpdates(updates);
  }

  getClientCount(): number {
    return this.clientUpdates.size;
  }

  reset(): void {
    super.reset();
    this.clientUpdates.clear();
  }
}

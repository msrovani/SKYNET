import { describe, it, expect } from 'vitest';
import { ClientSelection } from '../src/client-selection.js';
import type { ClientInfo } from '../src/client-selection.js';

function makeClient(overrides: Partial<ClientInfo> & { id: string }): ClientInfo {
  return {
    batteryLevel: 0.8,
    isCharging: false,
    onWifi: true,
    thermalHeadroom: 10,
    availableMemoryMb: 2048,
    lastActive: Date.now(),
    reliabilityScore: 0.9,
    ...overrides,
  };
}

describe('ClientSelection', () => {
  it('selects clients meeting requirements', () => {
    const selector = new ClientSelection({ requireWifi: true });
    const clients: ClientInfo[] = [
      makeClient({ id: 'a', batteryLevel: 0.5, onWifi: true }),
      makeClient({ id: 'b', batteryLevel: 0.1, onWifi: true }),
      makeClient({ id: 'c', batteryLevel: 0.9, onWifi: false }),
    ];
    const selected = selector.select(clients);
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe('a');
  });

  it('returns empty when no clients meet requirements', () => {
    const selector = new ClientSelection({ minBatteryLevel: 0.9 });
    const clients: ClientInfo[] = [
      makeClient({ id: 'a', batteryLevel: 0.5 }),
    ];
    expect(selector.select(clients)).toHaveLength(0);
  });

  it('respects maxClients limit', () => {
    const selector = new ClientSelection({ maxClients: 2 });
    const clients: ClientInfo[] = [
      makeClient({ id: 'a', reliabilityScore: 0.9 }),
      makeClient({ id: 'b', reliabilityScore: 0.8 }),
      makeClient({ id: 'c', reliabilityScore: 0.7 }),
    ];
    expect(selector.select(clients)).toHaveLength(2);
  });

  it('sorts by score descending', () => {
    const selector = new ClientSelection({ maxClients: 10 });
    const clients: ClientInfo[] = [
      makeClient({ id: 'low', reliabilityScore: 0.3 }),
      makeClient({ id: 'high', reliabilityScore: 0.99 }),
      makeClient({ id: 'mid', reliabilityScore: 0.6 }),
    ];
    const selected = selector.select(clients);
    expect(selected[0].id).toBe('high');
    expect(selected[1].id).toBe('mid');
    expect(selected[2].id).toBe('low');
  });

  it('requires charging when configured', () => {
    const selector = new ClientSelection({ requireCharging: true });
    const clients: ClientInfo[] = [
      makeClient({ id: 'a', isCharging: true }),
      makeClient({ id: 'b', isCharging: false }),
    ];
    expect(selector.select(clients)).toHaveLength(1);
    expect(selector.select(clients)[0].id).toBe('a');
  });

  it('filters by thermal headroom', () => {
    const selector = new ClientSelection({ minThermalHeadroom: 5 });
    const clients: ClientInfo[] = [
      makeClient({ id: 'cool', thermalHeadroom: 8 }),
      makeClient({ id: 'hot', thermalHeadroom: 3 }),
    ];
    expect(selector.select(clients)).toHaveLength(1);
    expect(selector.select(clients)[0].id).toBe('cool');
  });
});

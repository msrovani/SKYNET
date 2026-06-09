import { describe, it, expect } from 'vitest';
import { OpportunisticRouter } from '../opportunistic-router.js';
import { CrdtSync } from '../crdt-sync.js';
import { FailoverManager } from '../failover.js';
import { TransportManager } from '../transport.js';
import { WebRTCFallback } from '../webrtc-fallback.js';

function createRouter(): OpportunisticRouter {
  const transport = new TransportManager();
  const fallback = new WebRTCFallback();
  const crdt = new CrdtSync();
  const failover = new FailoverManager(crdt, transport);
  return new OpportunisticRouter(crdt, failover);
}

describe('OpportunisticRouter', () => {
  it('sorts transports by priority', () => {
    const router = createRouter();
    const available = router.getAvailableTransports();
    expect(available).toContain('ip');
    expect(available).toContain('lora');
    expect(available).toContain('acoustic');
  });

  it('estimates IP route as fastest and most reliable', () => {
    const router = createRouter();
    const route = router.estimateBestRoute(1000);
    expect(route.transport).toBe('ip');
    expect(route.reliability).toBeGreaterThan(0.9);
    expect(route.estimatedTimeMs).toBeLessThan(1000);
  });

  it('falls through to LoRa when IP fails', () => {
    const router = createRouter();
    router.markTransport('ip', false);
    const route = router.estimateBestRoute(100);
    expect(route.transport).toBe('lora');
  });

  it('falls through to acoustic when IP and LoRa fail', () => {
    const router = createRouter();
    router.markTransport('ip', false);
    router.markTransport('lora', false);
    const route = router.estimateBestRoute(100);
    expect(route.transport).toBe('acoustic');
  });

  it('returns none when all transports fail', () => {
    const router = createRouter();
    router.markTransport('ip', false);
    router.markTransport('acoustic', false);
    router.markTransport('lora', false);
    const route = router.estimateBestRoute(100);
    expect(route.transport).toBe('none');
  });

  it('syncs via LoRa fallback when IP unavailable', async () => {
    const router = createRouter();
    router.markTransport('ip', false);
    const data = new TextEncoder().encode('fallback-data');
    const result = await router.syncViaBestTransport(data);
    expect(result.success).toBe(true);
    expect(result.transport).toBe('lora');
  });

  it('syncs via acoustic when IP and LoRa fail', async () => {
    const router = createRouter();
    router.markTransport('ip', false);
    router.markTransport('lora', false);
    const data = new TextEncoder().encode('acoustic-fallback');
    const result = await router.syncViaBestTransport(data);
    expect(result.success).toBe(true);
    expect(result.transport).toBe('acoustic');
  });

  it('emits events during sync', async () => {
    const router = createRouter();
    const events: string[] = [];
    router.onEvent(e => events.push(e.type));
    router.markTransport('ip', false);
    const data = new TextEncoder().encode('event-test');
    await router.syncViaBestTransport(data);
    expect(events).toContain('transport-selected');
  });

  it('returns LoRa and Acoustic instances', () => {
    const router = createRouter();
    expect(router.getLoRa()).toBeTruthy();
    expect(router.getAcoustic()).toBeTruthy();
  });

  it('rejects when no transport available', async () => {
    const router = createRouter();
    router.markTransport('ip', false);
    router.markTransport('acoustic', false);
    router.markTransport('lora', false);
    const data = new TextEncoder().encode('fail-test');
    const result = await router.syncViaBestTransport(data);
    expect(result.success).toBe(false);
    expect(result.transport).toBe('none');
  });
});

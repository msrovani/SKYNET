import { describe, it, expect } from 'vitest';
import { AcousticCrdtSync, estimateAcousticDuration } from '../acoustic-crdt-sync.js';

describe('estimateAcousticDuration', () => {
  it('includes preamble in estimation', () => {
    const dur = estimateAcousticDuration(32, 100, 50);
    expect(dur).toBeGreaterThan(50);
  });

  it('larger data takes more time', () => {
    const small = estimateAcousticDuration(10, 100, 50);
    const large = estimateAcousticDuration(100, 100, 50);
    expect(large).toBeGreaterThan(small);
  });
});

describe('AcousticCrdtSync', () => {
  it('syncs data successfully', async () => {
    const acoustic = new AcousticCrdtSync({ band: 'near_ultrasonic' });
    const data = new TextEncoder().encode('skynet-acoustic-test');
    const result = await acoustic.sync(data);
    expect(result.synced).toBe(true);
    expect(result.packetsSent).toBeGreaterThan(0);
    expect(result.signalQuality).toBeGreaterThan(0);
  });

  it('fragments large payloads', async () => {
    const acoustic = new AcousticCrdtSync({ band: 'ultrasonic', maxPayloadBytes: 16 });
    const data = new TextEncoder().encode('this-is-a-long-message-to-test-fragmentation');
    const result = await acoustic.sync(data);
    expect(result.synced).toBe(true);
    expect(result.packetsSent).toBeGreaterThan(1);
  });

  it('handles packet loss', async () => {
    const acoustic = new AcousticCrdtSync({ band: 'audible' });
    const data = new TextEncoder().encode('loss-test');
    const result = await acoustic.syncWithLoss(data, 0.2);
    expect(result.synced).toBe(true);
  });

  it('calls onPacket callback', async () => {
    const acoustic = new AcousticCrdtSync({ band: 'ultrasonic' });
    const packetIds: string[] = [];
    const data = new TextEncoder().encode('callback-test');
    await acoustic.sync(data, p => packetIds.push(p.id));
    expect(packetIds.length).toBeGreaterThan(0);
  });

  it('getBandRange returns frequencies', () => {
    const a1 = new AcousticCrdtSync({ band: 'audible' });
    const [lo, hi] = a1.getBandRange();
    expect(lo).toBeGreaterThan(0);
    expect(hi).toBeGreaterThan(lo);
  });

  it('getSampleRate returns rate for band', () => {
    const a1 = new AcousticCrdtSync({ band: 'ultrasonic' });
    expect(a1.getSampleRate()).toBe(96000);
    const a2 = new AcousticCrdtSync({ band: 'audible' });
    expect(a2.getSampleRate()).toBe(44100);
  });

  it('estimateDuration returns positive', () => {
    const acoustic = new AcousticCrdtSync();
    expect(acoustic.estimateDuration(64)).toBeGreaterThan(0);
  });

  it('reset clears state', () => {
    const acoustic = new AcousticCrdtSync();
    acoustic.reset();
    expect(acoustic.getConfig()).toBeTruthy();
  });
});

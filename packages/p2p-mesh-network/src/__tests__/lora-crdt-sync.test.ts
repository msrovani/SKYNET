import { describe, it, expect } from 'vitest';
import { LoRaCrdtSync, estimateLoRaDuration } from '../lora-crdt-sync.js';

describe('estimateLoRaDuration', () => {
  it('calculates positive duration', () => {
    const dur = estimateLoRaDuration(51, 12, 125, '4/8');
    expect(dur).toBeGreaterThan(0);
  });

  it('longer payload takes more time', () => {
    const short = estimateLoRaDuration(10, 12, 125, '4/8');
    const long = estimateLoRaDuration(51, 12, 125, '4/8');
    expect(long).toBeGreaterThan(short);
  });
});

describe('LoRaCrdtSync', () => {
  it('syncs data successfully', async () => {
    const lora = new LoRaCrdtSync({ deviceClass: 'c', confirmable: true });
    const data = new TextEncoder().encode('hello-skynet');
    const result = await lora.sync(data);
    expect(result.synced).toBe(true);
    expect(result.packetsSent).toBeGreaterThan(0);
    expect(result.effectiveBps).toBeGreaterThan(0);
  });

  it('fragments large payloads', async () => {
    const lora = new LoRaCrdtSync({ deviceClass: 'c', maxPayloadBytes: 10 });
    const data = new TextEncoder().encode('this-is-a-longer-message-to-test-fragmentation');
    const result = await lora.sync(data);
    expect(result.synced).toBe(true);
    expect(result.packetsSent).toBeGreaterThan(1);
  });

  it('handles packet loss with retries', async () => {
    const lora = new LoRaCrdtSync({ deviceClass: 'c', confirmable: true, retryCount: 3 });
    const data = new TextEncoder().encode('lossy-test');
    const result = await lora.syncWithLossSimulation(data, 0.3);
    expect(result.synced).toBe(true);
  });

  it('calls onPacket callback', async () => {
    const lora = new LoRaCrdtSync({ deviceClass: 'c' });
    const packets: string[] = [];
    const data = new TextEncoder().encode('packet-test');
    await lora.sync(data, p => packets.push(p.id));
    expect(packets.length).toBeGreaterThan(0);
  });

  it('estimateDuration returns positive', () => {
    const lora = new LoRaCrdtSync();
    expect(lora.estimateDuration(100)).toBeGreaterThan(0);
  });

  it('getConfig returns current config', () => {
    const lora = new LoRaCrdtSync({ spreadingFactor: 9, bandwidthKhz: 250 });
    const cfg = lora.getConfig();
    expect(cfg.spreadingFactor).toBe(9);
    expect(cfg.bandwidthKhz).toBe(250);
  });

  it('reset clears state', () => {
    const lora = new LoRaCrdtSync();
    lora.reset();
    expect(lora.getConfig()).toBeTruthy();
  });
});

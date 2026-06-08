import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('ThermalManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('starts in safe zone', async () => {
    const { ThermalManager } = await import('../thermal.js');
    const tm = new ThermalManager('desktop');
    expect(tm.getZone()).toBe('safe');
    expect(tm.getCurrentHeadroom()).toBe(16);
  });

  it('records readings and computes zone', async () => {
    const { ThermalManager } = await import('../thermal.js');
    const tm = new ThermalManager('mobile');
    tm.recordReading({ timestamp: 1, temperature: 35, headroom: 6, cpuLoad: 0.8, gpuLoad: 0.7, batteryLevel: 50, isCharging: false });
    expect(tm.getZone()).toBe('hot');
    tm.recordReading({ timestamp: 1, temperature: 40, headroom: 1, cpuLoad: 0.9, gpuLoad: 0.9, batteryLevel: 30, isCharging: false });
    expect(tm.getZone()).toBe('critical');
  });

  it('emits zone-changed event', async () => {
    const { ThermalManager } = await import('../thermal.js');
    const tm = new ThermalManager('mobile');
    const events: string[] = [];
    tm.onEvent((e) => events.push(e.type));
    tm.recordReading({ timestamp: 1, temperature: 30, headroom: 1, cpuLoad: 0.9, gpuLoad: 0.9, batteryLevel: 30, isCharging: false });
    expect(events).toContain('zone-changed');
  });

  it('detects heating trend', async () => {
    const { ThermalManager } = await import('../thermal.js');
    const tm = new ThermalManager('desktop');
    tm.recordReading({ timestamp: 1, temperature: 40, headroom: 15, cpuLoad: 0.3, gpuLoad: 0.2, batteryLevel: 100, isCharging: true });
    tm.recordReading({ timestamp: 2, temperature: 45, headroom: 12, cpuLoad: 0.5, gpuLoad: 0.4, batteryLevel: 100, isCharging: true });
    tm.recordReading({ timestamp: 3, temperature: 50, headroom: 9, cpuLoad: 0.7, gpuLoad: 0.6, batteryLevel: 100, isCharging: true });
    tm.recordReading({ timestamp: 4, temperature: 55, headroom: 6, cpuLoad: 0.8, gpuLoad: 0.7, batteryLevel: 100, isCharging: true });
    tm.recordReading({ timestamp: 5, temperature: 60, headroom: 3, cpuLoad: 0.9, gpuLoad: 0.9, batteryLevel: 100, isCharging: true });
    expect(tm.getTrend()).toBe('heating');
  });

  it('detects cooling trend', async () => {
    const { ThermalManager } = await import('../thermal.js');
    const tm = new ThermalManager('desktop');
    tm.recordReading({ timestamp: 1, temperature: 60, headroom: 3, cpuLoad: 0.9, gpuLoad: 0.9, batteryLevel: 30, isCharging: false });
    tm.recordReading({ timestamp: 2, temperature: 55, headroom: 6, cpuLoad: 0.7, gpuLoad: 0.6, batteryLevel: 30, isCharging: false });
    tm.recordReading({ timestamp: 3, temperature: 50, headroom: 9, cpuLoad: 0.5, gpuLoad: 0.4, batteryLevel: 30, isCharging: false });
    tm.recordReading({ timestamp: 4, temperature: 45, headroom: 12, cpuLoad: 0.3, gpuLoad: 0.2, batteryLevel: 30, isCharging: false });
    tm.recordReading({ timestamp: 5, temperature: 40, headroom: 15, cpuLoad: 0.1, gpuLoad: 0.1, batteryLevel: 30, isCharging: false });
    expect(tm.getTrend()).toBe('cooling');
  });

  it('returns reduced params when hot', async () => {
    const { ThermalManager } = await import('../thermal.js');
    const tm = new ThermalManager('mobile');
    tm.recordReading({ timestamp: 1, temperature: 45, headroom: 6, cpuLoad: 0.9, gpuLoad: 0.8, batteryLevel: 20, isCharging: false });
    const params = tm.getParams();
    expect(params.modelVariant).toBe('reduced');
    expect(params.threads).toBeLessThan(4);
    expect(params.batchSize).toBeLessThan(128);
  });

  it('activates cooldown on critical zone', async () => {
    const { ThermalManager } = await import('../thermal.js');
    const tm = new ThermalManager('mobile');
    const events: string[] = [];
    tm.onEvent((e) => events.push(e.type));
    tm.recordReading({ timestamp: 1, temperature: 60, headroom: 1, cpuLoad: 0.9, gpuLoad: 0.9, batteryLevel: 10, isCharging: false });
    expect(events).toContain('cooldown-activated');
    expect(tm.isInCooldown()).toBe(true);
    expect(tm.getParams().threads).toBe(1);
  });

  it('ends cooldown when headroom recovers', async () => {
    const { ThermalManager } = await import('../thermal.js');
    const tm = new ThermalManager('mobile');
    tm.recordReading({ timestamp: 1, temperature: 60, headroom: 1, cpuLoad: 0.9, gpuLoad: 0.9, batteryLevel: 10, isCharging: false });
    expect(tm.isInCooldown()).toBe(true);
    tm.recordReading({ timestamp: 2, temperature: 40, headroom: 12, cpuLoad: 0.2, gpuLoad: 0.1, batteryLevel: 10, isCharging: true });
    expect(tm.isInCooldown()).toBe(false);
  });

  it('computes stability score', async () => {
    const { ThermalManager } = await import('../thermal.js');
    const tm = new ThermalManager('desktop');
    for (let i = 0; i < 5; i++) {
      tm.recordReading({ timestamp: i, temperature: 50, headroom: 10, cpuLoad: 0.5, gpuLoad: 0.5, batteryLevel: 80, isCharging: true });
    }
    const score = tm.getStabilityScore();
    expect(score).toBeGreaterThan(0.9);
  });

  it('limits sample window to maxSamples', async () => {
    const { ThermalManager } = await import('../thermal.js');
    const tm = new ThermalManager('mobile', { maxSamples: 3 });
    for (let i = 0; i < 10; i++) {
      tm.recordReading({ timestamp: i, temperature: 40, headroom: 15, cpuLoad: 0.1, gpuLoad: 0.1, batteryLevel: 100, isCharging: true });
    }
    expect(tm.getReadings()).toHaveLength(3);
  });
});

describe('DynamicShifter', () => {
  it('starts with first model in chain', async () => {
    const { DynamicShifter } = await import('../thermal.js');
    const ds = new DynamicShifter(['full', 'reduced', 'minimal']);
    expect(ds.getCurrentModel()).toBe('full');
  });

  it('shifts down on thermal pressure', async () => {
    const { DynamicShifter } = await import('../thermal.js');
    const ds = new DynamicShifter(['full', 'reduced', 'minimal'], 0);
    ds.shiftDown();
    expect(ds.getCurrentModel()).toBe('reduced');
    ds.shiftDown();
    expect(ds.getCurrentModel()).toBe('minimal');
  });

  it('stays at last model when already at bottom', async () => {
    const { DynamicShifter } = await import('../thermal.js');
    const ds = new DynamicShifter(['full', 'minimal']);
    ds.shiftDown();
    ds.shiftDown();
    expect(ds.getCurrentModel()).toBe('minimal');
  });

  it('shifts up when cooling', async () => {
    const { DynamicShifter } = await import('../thermal.js');
    const ds = new DynamicShifter(['full', 'reduced', 'minimal'], 0);
    ds.shiftDown();
    ds.shiftDown();
    expect(ds.getCurrentModel()).toBe('minimal');
    ds.shiftUp();
    expect(ds.getCurrentModel()).toBe('reduced');
  });

  it('shiftTo jumps to correct zone model', async () => {
    const { DynamicShifter } = await import('../thermal.js');
    const ds = new DynamicShifter(['full', 'lite', 'reduced', 'minimal']);
    ds.shiftTo('critical');
    expect(ds.getCurrentModel()).toBe('minimal');
    ds.shiftTo('safe');
    expect(ds.getCurrentModel()).toBe('full');
  });

  it('respects minShiftInterval', async () => {
    const { DynamicShifter } = await import('../thermal.js');
    const ds = new DynamicShifter(['full', 'reduced', 'minimal'], 5000);
    ds.shiftDown();
    expect(ds.getCurrentModel()).toBe('reduced');
    ds.shiftDown();
    expect(ds.getCurrentModel()).toBe('reduced');
  });

  it('tracks shift count', async () => {
    const { DynamicShifter } = await import('../thermal.js');
    const ds = new DynamicShifter(['full', 'reduced', 'minimal'], 0);
    ds.shiftDown();
    ds.shiftDown();
    expect(ds.getShiftCount()).toBe(2);
  });

  it('defaults to single model chain', async () => {
    const { DynamicShifter } = await import('../thermal.js');
    const ds = new DynamicShifter([]);
    expect(ds.getCurrentModel()).toBe('full');
  });

  it('shiftTo warm goes to index 1', async () => {
    const { DynamicShifter } = await import('../thermal.js');
    const ds = new DynamicShifter(['full', 'medium', 'reduced', 'minimal'], 0);
    ds.shiftTo('warm');
    expect(ds.getCurrentModel()).toBe('medium');
  });

  it('shiftTo hot goes to index 2', async () => {
    const { DynamicShifter } = await import('../thermal.js');
    const ds = new DynamicShifter(['full', 'medium', 'reduced', 'minimal'], 0);
    ds.shiftTo('hot');
    expect(ds.getCurrentModel()).toBe('reduced');
  });
});

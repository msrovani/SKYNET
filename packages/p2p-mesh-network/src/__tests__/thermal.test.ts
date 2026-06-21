import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('ThermalManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
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

describe('CarbonMonitor', () => {
  it('returns default intensity for unknown region', async () => {
    const { CarbonMonitor } = await import('../thermal.js');
    const cm = new CarbonMonitor();
    expect(cm.getIntensity('unknown')).toBe(400);
  });

  it('stores and retrieves regional intensity', async () => {
    const { CarbonMonitor } = await import('../thermal.js');
    const cm = new CarbonMonitor();
    cm.updateIntensity('us-east', { region: 'us-east', gCo2PerKwh: 350, timestamp: Date.now(), forecast: [340, 330, 320] });
    expect(cm.getIntensity('us-east')).toBe(350);
  });

  it('returns forecast data', async () => {
    const { CarbonMonitor } = await import('../thermal.js');
    const cm = new CarbonMonitor();
    cm.updateIntensity('eu-west', { region: 'eu-west', gCo2PerKwh: 200, timestamp: Date.now(), forecast: [190, 180] });
    expect(cm.getForecast('eu-west')).toEqual([190, 180]);
  });

  it('returns marginal intensity as min of current and next forecast', async () => {
    const { CarbonMonitor } = await import('../thermal.js');
    const cm = new CarbonMonitor();
    cm.updateIntensity('us-west', { region: 'us-west', gCo2PerKwh: 400, timestamp: Date.now(), forecast: [350, 300] });
    expect(cm.getMarginalIntensity('us-west')).toBe(350);
  });

  it('estimates emissions from power draw and duration', async () => {
    const { CarbonMonitor } = await import('../thermal.js');
    const cm = new CarbonMonitor();
    cm.updateIntensity('dirty-grid', { region: 'dirty-grid', gCo2PerKwh: 800, timestamp: Date.now(), forecast: [] });
    const emissions = cm.estimateEmissions(100, 3600000, 'dirty-grid');
    expect(emissions).toBeGreaterThan(0);
  });
});

describe('CarbonScheduler', () => {
  it('scores nodes by carbon, thermal, and latency', async () => {
    const { CarbonScheduler, CarbonMonitor, ThermalManager } = await import('../thermal.js');
    const cm = new CarbonMonitor();
    cm.updateIntensity('clean', { region: 'clean', gCo2PerKwh: 100, timestamp: Date.now(), forecast: [] });
    cm.updateIntensity('dirty', { region: 'dirty', gCo2PerKwh: 700, timestamp: Date.now(), forecast: [] });
    const tm = new ThermalManager('desktop');
    tm.recordReading({ timestamp: 1, temperature: 40, headroom: 16, cpuLoad: 0.1, gpuLoad: 0.1, batteryLevel: 100, isCharging: true });
    const scheduler = new CarbonScheduler(cm, tm);
    const cleanScore = scheduler.scoreNode('node-clean', 'clean', 100);
    const dirtyScore = scheduler.scoreNode('node-dirty', 'dirty', 100);
    expect(cleanScore.combined).toBeGreaterThan(dirtyScore.combined);
    expect(cleanScore.carbonScore).toBeGreaterThan(dirtyScore.carbonScore);
  });

  it('ranks nodes in descending combined score', async () => {
    const { CarbonScheduler, CarbonMonitor, ThermalManager } = await import('../thermal.js');
    const cm = new CarbonMonitor();
    cm.updateIntensity('a', { region: 'a', gCo2PerKwh: 100, timestamp: Date.now(), forecast: [] });
    cm.updateIntensity('b', { region: 'b', gCo2PerKwh: 800, timestamp: Date.now(), forecast: [] });
    const tm = new ThermalManager('desktop');
    tm.recordReading({ timestamp: 1, temperature: 40, headroom: 16, cpuLoad: 0.1, gpuLoad: 0.1, batteryLevel: 100, isCharging: true });
    const scheduler = new CarbonScheduler(cm, tm);
    const ranked = scheduler.rankNodes([
      { nodeId: 'clean', region: 'a', powerDrawW: 100 },
      { nodeId: 'dirty', region: 'b', powerDrawW: 100 },
    ]);
    expect(ranked.length).toBe(2);
    expect(ranked[0].nodeId).toBe('clean');
    expect(ranked[1].nodeId).toBe('dirty');
  });

  it('recommends offload when remote score exceeds local by threshold', async () => {
    const { CarbonScheduler, CarbonMonitor } = await import('../thermal.js');
    const cm = new CarbonMonitor();
    cm.updateIntensity('local', { region: 'local', gCo2PerKwh: 700, timestamp: Date.now(), forecast: [] });
    cm.updateIntensity('remote', { region: 'remote', gCo2PerKwh: 50, timestamp: Date.now(), forecast: [] });
    const scheduler = new CarbonScheduler(cm, null);
    const local = scheduler.scoreNode('local', 'local', 100);
    const remote = scheduler.scoreNode('remote', 'remote', 100);
    expect(scheduler.shouldOffload(local, remote, 0.05)).toBe(true);
  });

  it('keeps local if remote score is not better', async () => {
    const { CarbonScheduler, CarbonMonitor } = await import('../thermal.js');
    const cm = new CarbonMonitor();
    cm.updateIntensity('a', { region: 'a', gCo2PerKwh: 400, timestamp: Date.now(), forecast: [] });
    cm.updateIntensity('b', { region: 'b', gCo2PerKwh: 400, timestamp: Date.now(), forecast: [] });
    const scheduler = new CarbonScheduler(cm, null);
    const a = scheduler.scoreNode('a', 'a', 100);
    const b = scheduler.scoreNode('b', 'b', 100);
    expect(scheduler.shouldOffload(a, b, 0.2)).toBe(false);
  });

  it('estimates savings between current and proposed emissions', async () => {
    const { CarbonScheduler } = await import('../thermal.js');
    const scheduler = new CarbonScheduler();
    const savings = scheduler.estimateSavings(100, 60);
    expect(savings.reduction).toBe(40);
    expect(savings.percentReduction).toBe(40);
  });

  it('returns zero savings when proposed exceeds current', async () => {
    const { CarbonScheduler } = await import('../thermal.js');
    const scheduler = new CarbonScheduler();
    const savings = scheduler.estimateSavings(50, 80);
    expect(savings.reduction).toBe(0);
    expect(savings.percentReduction).toBe(0);
  });

  it('updateLatency affects scoring', async () => {
    const { CarbonScheduler, CarbonMonitor } = await import('../thermal.js');
    const cm = new CarbonMonitor();
    cm.updateIntensity('r1', { region: 'r1', gCo2PerKwh: 400, timestamp: Date.now(), forecast: [] });
    const scheduler = new CarbonScheduler(cm, null, { carbon: 0.2, thermal: 0.2, latency: 0.6 });
    scheduler.updateLatency('slow', 500);
    scheduler.updateLatency('fast', 20);
    const slow = scheduler.scoreNode('slow', 'r1', 100);
    const fast = scheduler.scoreNode('fast', 'r1', 100);
    expect(fast.combined).toBeGreaterThan(slow.combined);
  });
});

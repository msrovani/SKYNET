import { describe, it, expect } from 'vitest';
import { FedLAGC, type DeviceCapability, type SubmodelConfig } from '../src/fed-lagc.js';

describe('FedLAGC', () => {
  it('constructor initializes with totalLayers', () => {
    const lagc = new FedLAGC(32);
    expect(lagc.deviceCount()).toBe(0);
  });

  it('assignSubmodel gives full model to strong device (computeScore=0.8)', () => {
    const lagc = new FedLAGC(32);
    const cap: DeviceCapability = { computeScore: 0.8, memoryMb: 8192, bandwidthMbps: 1000 };
    const config = lagc.assignSubmodel('strong-device', cap);
    expect(config.startLayer).toBe(0);
    expect(config.endLayer).toBe(32);
    expect(config.totalLayers).toBe(32);
    expect(config.deviceId).toBe('strong-device');
  });

  it('assignSubmodel gives 60% to medium device (0.5)', () => {
    const lagc = new FedLAGC(32);
    const cap: DeviceCapability = { computeScore: 0.5, memoryMb: 4096, bandwidthMbps: 100 };
    const config = lagc.assignSubmodel('medium-device', cap);
    expect(config.startLayer).toBe(13);
    expect(config.endLayer).toBe(32);
    expect(config.endLayer - config.startLayer).toBe(19);
  });

  it('assignSubmodel gives 30% to weak device (0.3)', () => {
    const lagc = new FedLAGC(32);
    const cap: DeviceCapability = { computeScore: 0.3, memoryMb: 2048, bandwidthMbps: 50 };
    const config = lagc.assignSubmodel('weak-device', cap);
    expect(config.endLayer - config.startLayer).toBe(10);
    expect(config.totalLayers).toBe(32);
  });

  it('assignSubmodel gives 15% to very weak device (0.1)', () => {
    const lagc = new FedLAGC(32);
    const cap: DeviceCapability = { computeScore: 0.1, memoryMb: 512, bandwidthMbps: 10 };
    const config = lagc.assignSubmodel('very-weak', cap);
    expect(config.startLayer).toBe(0);
    expect(config.endLayer).toBe(5);
    expect(config.totalLayers).toBe(32);
  });

  it('extractSubmodel returns correct number of layers for full model', () => {
    const lagc = new FedLAGC(4);
    for (let i = 0; i < 4; i++) {
      lagc.setGlobalLayer(`dense_l${i}`, new Float32Array([0.1 * (i + 1), 0.2 * (i + 1)]));
    }
    const config: SubmodelConfig = { deviceId: 'full', startLayer: 0, endLayer: 4, totalLayers: 4 };
    const submodel = lagc.extractSubmodel(config);
    expect(submodel.size).toBe(4);
  });

  it('extractSubmodel returns correct layers for partial model', () => {
    const lagc = new FedLAGC(4);
    for (let i = 0; i < 4; i++) {
      lagc.setGlobalLayer(`dense_l${i}`, new Float32Array([0.1 * (i + 1), 0.2 * (i + 1)]));
    }
    const config: SubmodelConfig = { deviceId: 'partial', startLayer: 0, endLayer: 2, totalLayers: 4 };
    const submodel = lagc.extractSubmodel(config);
    expect(submodel.size).toBe(2);
  });

  it('correctGradients returns same length for full model', () => {
    const lagc = new FedLAGC(4);
    for (let i = 0; i < 4; i++) {
      lagc.setGlobalLayer(`dense_l${i}`, new Float32Array(4));
    }
    const localUpdate = new Map<string, Float32Array>();
    localUpdate.set('dense_l0', new Float32Array([0.1, 0.2, 0.3, 0.4]));
    localUpdate.set('dense_l1', new Float32Array([0.5, 0.6, 0.7, 0.8]));
    localUpdate.set('dense_l2', new Float32Array([0.9, 1.0, 1.1, 1.2]));
    localUpdate.set('dense_l3', new Float32Array([1.3, 1.4, 1.5, 1.6]));
    const config: SubmodelConfig = { deviceId: 'full', startLayer: 0, endLayer: 4, totalLayers: 4 };
    const corrected = lagc.correctGradients(localUpdate, config);
    expect(corrected.size).toBe(4);
    for (const [name, arr] of corrected) {
      expect(arr.length).toBe(4);
      const local = localUpdate.get(name)!;
      expect(arr[0]).toBeCloseTo(local[0] * 1);
    }
  });

  it('correctGradients returns padded for partial model', () => {
    const lagc = new FedLAGC(4);
    for (let i = 0; i < 4; i++) {
      lagc.setGlobalLayer(`dense_l${i}`, new Float32Array([0, 0]));
    }
    const localUpdate = new Map<string, Float32Array>();
    localUpdate.set('dense_l1', new Float32Array([0.5, 0.6]));
    const config: SubmodelConfig = { deviceId: 'partial', startLayer: 1, endLayer: 3, totalLayers: 4 };
    const corrected = lagc.correctGradients(localUpdate, config);
    expect(corrected.size).toBe(4);
    const zeroLayer = corrected.get('dense_l0')!;
    expect(zeroLayer[0]).toBe(0);
    expect(zeroLayer[1]).toBe(0);
    const scaledLayer = corrected.get('dense_l1')!;
    expect(scaledLayer[0]).toBeCloseTo(0.5 * 2, 5);
    expect(scaledLayer[1]).toBeCloseTo(0.6 * 2, 5);
  });

  it('aggregateUpdates merges multiple devices correctly', () => {
    const lagc = new FedLAGC(4);
    for (let i = 0; i < 4; i++) {
      lagc.setGlobalLayer(`dense_l${i}`, new Float32Array([1, 1]));
    }
    const update1 = new Map<string, Float32Array>();
    update1.set('dense_l0', new Float32Array([0.1, 0.1]));
    update1.set('dense_l1', new Float32Array([0.2, 0.2]));
    const config1: SubmodelConfig = { deviceId: 'a', startLayer: 0, endLayer: 2, totalLayers: 4 };
    const corrected1 = lagc.correctGradients(update1, config1);
    const update2 = new Map<string, Float32Array>();
    update2.set('dense_l2', new Float32Array([0.3, 0.3]));
    update2.set('dense_l3', new Float32Array([0.4, 0.4]));
    const config2: SubmodelConfig = { deviceId: 'b', startLayer: 2, endLayer: 4, totalLayers: 4 };
    const corrected2 = lagc.correctGradients(update2, config2);
    lagc.aggregateUpdates([
      { config: config1, corrected: corrected1 },
      { config: config2, corrected: corrected2 },
    ]);
    for (const [, weights] of lagc['globalModel']) {
      for (const w of weights) {
        expect(w).not.toBe(1);
      }
    }
  });

  it('removeDevice reduces count', () => {
    const lagc = new FedLAGC(32);
    const cap: DeviceCapability = { computeScore: 0.8, memoryMb: 8192, bandwidthMbps: 1000 };
    lagc.assignSubmodel('dev1', cap);
    lagc.assignSubmodel('dev2', cap);
    expect(lagc.deviceCount()).toBe(2);
    lagc.removeDevice('dev1');
    expect(lagc.deviceCount()).toBe(1);
  });

  it('deviceCount returns correct count', () => {
    const lagc = new FedLAGC(32);
    expect(lagc.deviceCount()).toBe(0);
    const cap: DeviceCapability = { computeScore: 0.5, memoryMb: 4096, bandwidthMbps: 100 };
    lagc.assignSubmodel('a', cap);
    lagc.assignSubmodel('b', cap);
    lagc.assignSubmodel('c', cap);
    expect(lagc.deviceCount()).toBe(3);
  });

  it('getSubmodel returns undefined for unknown device', () => {
    const lagc = new FedLAGC(32);
    expect(lagc.getSubmodel('unknown')).toBeUndefined();
  });

  it('getSubmodel returns assigned submodel', () => {
    const lagc = new FedLAGC(32);
    const cap: DeviceCapability = { computeScore: 0.5, memoryMb: 4096, bandwidthMbps: 100 };
    const config = lagc.assignSubmodel('dev', cap);
    const retrieved = lagc.getSubmodel('dev');
    expect(retrieved).toBeDefined();
    expect(retrieved!.startLayer).toBe(config.startLayer);
    expect(retrieved!.endLayer).toBe(config.endLayer);
  });
});

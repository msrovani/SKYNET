import { describe, it, expect } from 'vitest';
import { QLocalAdam } from '../src/q-local-adam.js';

describe('QLocalAdam', () => {
  it('applies step with gradients', () => {
    const adam = new QLocalAdam({ learningRate: 0.001 });
    const grads = new Float32Array([0.5, -0.3, 0.1, -0.7]);
    const result = adam.step('layer1', grads);
    expect(result).toBeInstanceOf(Float32Array);
    expect(result).toHaveLength(4);
  });

  it('maintains state across steps for same param', () => {
    const adam = new QLocalAdam();
    const grads = new Float32Array([0.5, -0.3]);
    const r1 = adam.step('layer1', grads);
    const r2 = adam.step('layer1', grads);
    expect(r1).toHaveLength(2);
    expect(r2).toHaveLength(2);
    expect(r1[0]).not.toBe(r2[0]);
  });

  it('handles multiple parameter groups', () => {
    const adam = new QLocalAdam();
    const r1 = adam.step('layer1', new Float32Array([0.1, 0.2]));
    const r2 = adam.step('layer2', new Float32Array([0.3, 0.4]));
    expect(r1).toHaveLength(2);
    expect(r2).toHaveLength(2);
  });

  it('handles empty gradients', () => {
    const adam = new QLocalAdam();
    const result = adam.step('empty', new Float32Array(0));
    expect(result).toBeInstanceOf(Float32Array);
    expect(result).toHaveLength(0);
  });
});

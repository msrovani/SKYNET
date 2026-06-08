import { describe, it, expect } from 'vitest';
import { FedYogi } from '../src/fed-yogi.js';

describe('FedYogi', () => {
  it('aggregates client updates', () => {
    const yogi = new FedYogi({ learningRate: 0.01, serverLearningRate: 0.1 });
    const updates = [
      [0.1, -0.2, 0.3],
      [-0.1, 0.2, -0.3],
    ];
    const result = yogi.aggregateClientUpdates(updates);
    expect(result).toHaveLength(3);
    result.forEach(v => expect(typeof v).toBe('number'));
  });

  it('returns empty for no updates', () => {
    const yogi = new FedYogi();
    expect(yogi.aggregateClientUpdates([])).toEqual([]);
  });

  it('tracks global step', () => {
    const yogi = new FedYogi();
    expect(yogi.getState().globalStep).toBe(0);
    yogi.aggregateClientUpdates([[0.1, 0.2], [-0.1, -0.2]]);
    expect(yogi.getState().globalStep).toBe(1);
    yogi.aggregateClientUpdates([[0.3, 0.4], [-0.3, -0.4]]);
    expect(yogi.getState().globalStep).toBe(2);
  });

  it('resets state', () => {
    const yogi = new FedYogi();
    yogi.aggregateClientUpdates([[0.1, 0.2], [-0.1, -0.2]]);
    expect(yogi.getState().globalStep).toBe(1);
    yogi.reset();
    expect(yogi.getState().globalStep).toBe(0);
  });
});

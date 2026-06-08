import { describe, it, expect } from 'vitest';
import { FEDADAVR } from '../src/fedadavr.js';

describe('FEDADAVR', () => {
  it('stores and aggregates client updates with variance reduction', () => {
    const optimizer = new FEDADAVR();
    optimizer.storeClientUpdate('client-1', [0.2, -0.1, 0.3]);
    optimizer.storeClientUpdate('client-2', [-0.1, 0.2, -0.3]);
    const result = optimizer.aggregateWithVarianceReduction(['client-1', 'client-2']);
    expect(result).toHaveLength(3);
    result.forEach(v => expect(typeof v).toBe('number'));
  });

  it('returns empty for unknown clients', () => {
    const optimizer = new FEDADAVR();
    const result = optimizer.aggregateWithVarianceReduction(['unknown']);
    expect(result).toEqual([]);
  });

  it('tracks client count', () => {
    const optimizer = new FEDADAVR();
    expect(optimizer.getClientCount()).toBe(0);
    optimizer.storeClientUpdate('c1', [0.1, 0.2]);
    expect(optimizer.getClientCount()).toBe(1);
    optimizer.storeClientUpdate('c2', [0.3, 0.4]);
    expect(optimizer.getClientCount()).toBe(2);
  });

  it('resets clears all stored updates', () => {
    const optimizer = new FEDADAVR();
    optimizer.storeClientUpdate('c1', [0.1, 0.2]);
    optimizer.reset();
    expect(optimizer.getClientCount()).toBe(0);
    expect(optimizer.aggregateWithVarianceReduction(['c1'])).toEqual([]);
  });

  it('limits stored updates to 1000 clients', () => {
    const optimizer = new FEDADAVR();
    for (let i = 0; i < 1010; i++) {
      optimizer.storeClientUpdate(`c${i}`, [1.0]);
    }
    expect(optimizer.getClientCount()).toBe(1000);
  });
});

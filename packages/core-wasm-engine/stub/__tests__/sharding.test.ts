import { describe, it, expect } from 'vitest';
import {
  shardTensorRowwise,
  shardTensorColwise,
  reconstructTensor,
  verifyTensorShard,
  type TensorShard,
} from '../index.js';

function makeMatrix(rows: number, cols: number): Float32Array {
  const data = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      data[r * cols + c] = r * cols + c;
    }
  }
  return data;
}

describe('shard_rowwise', () => {
  it('creates correct number of shards with proper dimensions', () => {
    const data = makeMatrix(4, 4);
    const shards = shardTensorRowwise('t1', data, 4, 4, 2);

    expect(shards).toHaveLength(2);

    expect(shards[0].metadata.rowStart).toBe(0);
    expect(shards[0].metadata.rowEnd).toBe(2);
    expect(shards[0].metadata.rows).toBe(2);
    expect(shards[0].metadata.cols).toBe(4);

    expect(shards[1].metadata.rowStart).toBe(2);
    expect(shards[1].metadata.rowEnd).toBe(4);
    expect(shards[1].metadata.rows).toBe(2);
    expect(shards[1].metadata.cols).toBe(4);
  });

  it('preserves data in each shard', () => {
    const data = makeMatrix(4, 4);
    const shards = shardTensorRowwise('t1', data, 4, 4, 2);

    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 4; c++) {
        expect(shards[0].data[r * 4 + c]).toBe(r * 4 + c);
      }
    }
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 4; c++) {
        expect(shards[1].data[r * 4 + c]).toBe((r + 2) * 4 + c);
      }
    }
  });

  it('sets metadata fields correctly', () => {
    const data = makeMatrix(4, 4);
    const shards = shardTensorRowwise('t1', data, 4, 4, 2);

    for (let i = 0; i < 2; i++) {
      expect(shards[i].metadata.shardId).toBe(`t1/shard/${i}`);
      expect(shards[i].metadata.tensorId).toBe('t1');
      expect(shards[i].metadata.shardIndex).toBe(i);
      expect(shards[i].metadata.totalShards).toBe(2);
      expect(shards[i].metadata.colStart).toBe(0);
      expect(shards[i].metadata.colEnd).toBe(4);
      expect(shards[i].metadata.dataLen).toBe(shards[i].data.length);
    }
  });
});

describe('shard_colwise', () => {
  it('creates correct number of shards with proper dimensions', () => {
    const data = makeMatrix(4, 4);
    const shards = shardTensorColwise('t2', data, 4, 4, 2);

    expect(shards).toHaveLength(2);

    expect(shards[0].metadata.colStart).toBe(0);
    expect(shards[0].metadata.colEnd).toBe(2);
    expect(shards[0].metadata.cols).toBe(2);
    expect(shards[0].metadata.rows).toBe(4);

    expect(shards[1].metadata.colStart).toBe(2);
    expect(shards[1].metadata.colEnd).toBe(4);
    expect(shards[1].metadata.cols).toBe(2);
    expect(shards[1].metadata.rows).toBe(4);
  });

  it('preserves data in each shard', () => {
    const data = makeMatrix(4, 4);
    const shards = shardTensorColwise('t2', data, 4, 4, 2);

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 2; c++) {
        expect(shards[0].data[r * 2 + c]).toBe(r * 4 + c);
      }
    }
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 2; c++) {
        expect(shards[1].data[r * 2 + c]).toBe(r * 4 + (c + 2));
      }
    }
  });
});

describe('reconstruct from row shards', () => {
  it('matches original tensor', () => {
    const data = makeMatrix(4, 4);
    const shards = shardTensorRowwise('t1', data, 4, 4, 2);
    const reconstructed = reconstructTensor(shards, 4, 4);

    expect(reconstructed.rows).toBe(4);
    expect(reconstructed.cols).toBe(4);
    for (let i = 0; i < data.length; i++) {
      expect(reconstructed.data[i]).toBe(data[i]);
    }
  });
});

describe('reconstruct from col shards', () => {
  it('matches original tensor', () => {
    const data = makeMatrix(4, 4);
    const shards = shardTensorColwise('t2', data, 4, 4, 2);
    const reconstructed = reconstructTensor(shards, 4, 4);

    expect(reconstructed.rows).toBe(4);
    expect(reconstructed.cols).toBe(4);
    for (let i = 0; i < data.length; i++) {
      expect(reconstructed.data[i]).toBe(data[i]);
    }
  });
});

describe('verify_shard', () => {
  it('passes for a valid shard', () => {
    const data = makeMatrix(4, 4);
    const shards = shardTensorRowwise('t1', data, 4, 4, 2);

    for (const shard of shards) {
      expect(verifyTensorShard(shard)).toBe(true);
    }
  });

  it('fails when data is corrupted', () => {
    const data = makeMatrix(4, 4);
    const shards = shardTensorRowwise('t1', data, 4, 4, 2);

    for (const shard of shards) {
      shard.data[0] = shard.data[0] + 999;
      expect(verifyTensorShard(shard)).toBe(false);
    }
  });
});

describe('single shard', () => {
  it('returns whole tensor as one shard when num_shards=1', () => {
    const data = makeMatrix(4, 4);
    const shards = shardTensorRowwise('t1', data, 4, 4, 1);

    expect(shards).toHaveLength(1);
    expect(shards[0].metadata.rows).toBe(4);
    expect(shards[0].metadata.cols).toBe(4);
    for (let i = 0; i < data.length; i++) {
      expect(shards[0].data[i]).toBe(data[i]);
    }

    const reconstructed = reconstructTensor(shards, 4, 4);
    for (let i = 0; i < data.length; i++) {
      expect(reconstructed.data[i]).toBe(data[i]);
    }
  });

  it('single colwise shard works correctly', () => {
    const data = makeMatrix(4, 4);
    const shards = shardTensorColwise('t2', data, 4, 4, 1);

    expect(shards).toHaveLength(1);
    expect(shards[0].metadata.cols).toBe(4);
    expect(shards[0].metadata.rows).toBe(4);
    for (let i = 0; i < data.length; i++) {
      expect(shards[0].data[i]).toBe(data[i]);
    }

    const reconstructed = reconstructTensor(shards, 4, 4);
    for (let i = 0; i < data.length; i++) {
      expect(reconstructed.data[i]).toBe(data[i]);
    }
  });
});

describe('uneven split', () => {
  it('handles row-wise uneven division', () => {
    const data = makeMatrix(5, 4);
    const shards = shardTensorRowwise('t1', data, 5, 4, 3);

    expect(shards).toHaveLength(3);
    expect(shards[0].metadata.rows).toBe(2);
    expect(shards[1].metadata.rows).toBe(2);
    expect(shards[2].metadata.rows).toBe(1);

    const reconstructed = reconstructTensor(shards, 5, 4);
    for (let i = 0; i < data.length; i++) {
      expect(reconstructed.data[i]).toBe(data[i]);
    }
  });

  it('handles col-wise uneven division', () => {
    const data = makeMatrix(4, 5);
    const shards = shardTensorColwise('t2', data, 4, 5, 3);

    expect(shards).toHaveLength(3);
    expect(shards[0].metadata.cols).toBe(2);
    expect(shards[1].metadata.cols).toBe(2);
    expect(shards[2].metadata.cols).toBe(1);

    const reconstructed = reconstructTensor(shards, 4, 5);
    for (let i = 0; i < data.length; i++) {
      expect(reconstructed.data[i]).toBe(data[i]);
    }
  });
});

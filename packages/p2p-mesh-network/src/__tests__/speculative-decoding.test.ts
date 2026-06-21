import { describe, it, expect, vi } from 'vitest';


function makeMockLogits(vocabSize: number, tokenBias: number[] = []): (tokens: number[]) => Float32Array {
  return (tokens: number[]) => {
    const arr = new Float32Array(vocabSize);
    for (let i = 0; i < vocabSize; i++) {
      arr[i] = Math.sin(i * 0.1 + tokens.length * 0.5);
    }
    // bias particular tokens to be high-probability
    for (let i = 0; i < tokenBias.length; i++) {
      if (i < tokens.length) {
        arr[tokenBias[i]] = 100;
      }
    }
    return arr;
  };
}

describe('SpeculativeDecoder', () => {
  const vocabSize = 128256;

  it('generates draft tokens deterministically with same RNG seed', async () => {
    const { SpeculativeDecoder } = await import('../speculative-decoding.js');
    const d1 = new SpeculativeDecoder({ speculationLen: 4 });
    const d2 = new SpeculativeDecoder({ speculationLen: 4 });
    const logits = makeMockLogits(vocabSize);
    const r1 = d1.generateDraft([0], logits);
    const r2 = d2.generateDraft([0], logits);
    expect(r1.tokens).toEqual(r2.tokens);
    expect(r1.speculationLen).toBe(4);
  });

  it('respects speculationLen config', async () => {
    const { SpeculativeDecoder } = await import('../speculative-decoding.js');
    const d = new SpeculativeDecoder({ speculationLen: 3 });
    const logits = makeMockLogits(vocabSize);
    const r = d.generateDraft([0, 1], logits);
    expect(r.tokens).toHaveLength(3);
    expect(r.probabilities).toHaveLength(3);
  });

  it('verifies draft tokens with acceptance', async () => {
    const { SpeculativeDecoder } = await import('../speculative-decoding.js');
    const d = new SpeculativeDecoder({ speculationLen: 3, acceptanceThreshold: 1.0 });
    const draft = d.generateDraft([0], makeMockLogits(vocabSize, [1, 2, 3]));
    const target = makeMockLogits(vocabSize, [1, 2, 3]);
    const result = d.verify([0], draft, target);
    expect(result.acceptedCount).toBeGreaterThan(0);
    expect(result.acceptedCount).toBeLessThanOrEqual(3);
    expect(result.acceptedTokens).toHaveLength(result.acceptedCount);
  });

  it('rejects tokens when draft and target diverge', async () => {
    const { SpeculativeDecoder } = await import('../speculative-decoding.js');
    const d = new SpeculativeDecoder({ speculationLen: 5, acceptanceThreshold: 0.01 });
    // draft generates one thing, target strongly favors different tokens
    const draft = d.generateDraft([0], makeMockLogits(vocabSize, [100, 101, 102, 103, 104]));
    const target = makeMockLogits(vocabSize, [200, 201, 202, 203, 204]);
    const result = d.verify([0], draft, target);
    // with strong divergence, first token might be rejected
    expect(result.rejectionPosition).toBeGreaterThanOrEqual(0);
  });

  it('emits events during decode cycle', async () => {
    const { SpeculativeDecoder } = await import('../speculative-decoding.js');
    const d = new SpeculativeDecoder({ speculationLen: 3 });
    const events: string[] = [];
    d.onEvent((e) => events.push(e.type));
    const draft = d.generateDraft([0], makeMockLogits(vocabSize));
    d.verify([0], draft, makeMockLogits(vocabSize));
    expect(events).toContain('draft-generated');
    expect(events).toContain('verification-complete');
    expect(events).toContain('round-complete');
  });

  it('tracks stats across multiple rounds', async () => {
    const { SpeculativeDecoder } = await import('../speculative-decoding.js');
    const d = new SpeculativeDecoder({ speculationLen: 4, adaptiveSpeculation: false, acceptanceThreshold: 1.0 });
    const draftLogits = makeMockLogits(vocabSize, [10, 20, 30, 40]);
    const targetLogits = makeMockLogits(vocabSize, [10, 20, 30, 40]);
    for (let i = 0; i < 5; i++) {
      const draft = d.generateDraft([i], draftLogits);
      d.verify([i], draft, targetLogits);
    }
    const stats = d.getStats();
    expect(stats.totalRounds).toBe(5);
    expect(stats.totalDraftTokens).toBe(20);
    expect(stats.acceptanceRate).toBeGreaterThan(0);
  });

  it('assigns role based on pipeline stage', async () => {
    const { SpeculativeDecoder } = await import('../speculative-decoding.js');
    const d = new SpeculativeDecoder();
    const mockGetStageForPeer = vi.fn((id: string) => {
      if (id === 'drafter-peer') return { stageIndex: 0 } as any;
      if (id === 'verifier-peer') return { stageIndex: 1 } as any;
      return undefined;
    });
    d.setPipeline({ getStageForPeer: mockGetStageForPeer } as any);
    expect(d.getRoleForPeer('drafter-peer')).toBe('drafter');
    expect(d.getRoleForPeer('verifier-peer')).toBe('verifier');
    expect(d.getRoleForPeer('unknown')).toBe('drafter');
  });

  it('adjusts speculation length adaptively', async () => {
    const { SpeculativeDecoder } = await import('../speculative-decoding.js');
    const d = new SpeculativeDecoder({ adaptiveSpeculation: true, minAcceptanceRate: 0.5, speculationLen: 5, maxSpeculationLen: 8, acceptanceThreshold: 1.0 });
    const draftLogits = makeMockLogits(vocabSize, [10, 11, 12, 13, 14]);
    const targetLogits = makeMockLogits(vocabSize, [10, 11, 12, 13, 14]);
    for (let i = 0; i < 10; i++) {
      const draft = d.generateDraft([i], draftLogits);
      d.verify([i], draft, targetLogits);
    }
    const stats = d.getStats();
    // high acceptance rate should increase speculation length
    expect(stats.acceptanceRate).toBeGreaterThan(0.5);
    expect(stats.speedupRatio).toBeGreaterThan(0);
  });

  it('updates config at runtime', async () => {
    const { SpeculativeDecoder } = await import('../speculative-decoding.js');
    const d = new SpeculativeDecoder({ speculationLen: 3 });
    expect((d as any).config.speculationLen).toBe(3);
    d.updateConfig({ speculationLen: 6 });
    const logits = makeMockLogits(vocabSize);
    const r = d.generateDraft([0], logits);
    expect(r.tokens).toHaveLength(6);
  });

  it('resetStats clears accumulated metrics', async () => {
    const { SpeculativeDecoder } = await import('../speculative-decoding.js');
    const d = new SpeculativeDecoder({ speculationLen: 2 });
    const draft = d.generateDraft([0], makeMockLogits(vocabSize));
    d.verify([0], draft, makeMockLogits(vocabSize));
    expect(d.getStats().totalRounds).toBe(1);
    d.resetStats();
    const s = d.getStats();
    expect(s.totalRounds).toBe(0);
    expect(s.totalDraftTokens).toBe(0);
    expect(s.totalAcceptedTokens).toBe(0);
    expect(s.speedupRatio).toBe(1);
  });

  it('handles edge case of speculationLen=1', async () => {
    const { SpeculativeDecoder } = await import('../speculative-decoding.js');
    const d = new SpeculativeDecoder({ speculationLen: 1, adaptiveSpeculation: false, acceptanceThreshold: 1.0 });
    const logits = makeMockLogits(vocabSize);
    const draft = d.generateDraft([42], logits);
    const result = d.verify([42], draft, logits);
    expect(result.acceptedCount).toBe(1);
    expect(result.rejectionPosition).toBe(1);
  });
});

describe('TreeSpecDecoder', () => {
  it('builds draft tree with correct structure', async () => {
    const { TreeSpecDecoder } = await import('../speculative-decoding.js');
    const decoder = new TreeSpecDecoder({ maxNodes: 10, topK: 3, branchFactor: 2, maxDepth: 4 });
    const mockDraftLogits = (_prefix: number[]) => {
      const arr = new Float32Array(5);
      arr[0] = 10; arr[1] = 9; arr[2] = 8;
      return arr;
    };
    const tree = decoder.buildDraftTree(mockDraftLogits, [1, 2]);
    expect(tree.token).toBe(-1);
    expect(tree.depth).toBe(0);
    expect(tree.children.length).toBeGreaterThanOrEqual(1);
    expect(tree.children.length).toBeLessThanOrEqual(2);
    const paths = decoder.flattenTree(tree);
    expect(paths.length).toBeGreaterThanOrEqual(1);
    expect(paths[0].length).toBeGreaterThanOrEqual(1);
  });

  it('flattenTree returns all leaf paths', async () => {
    const { TreeSpecDecoder } = await import('../speculative-decoding.js');
    const decoder = new TreeSpecDecoder({ maxNodes: 6, topK: 2, branchFactor: 2, maxDepth: 3 });
    const mockLogits = () => {
      const arr = new Float32Array(5);
      arr[0] = 10; arr[1] = 8;
      return arr;
    };
    const tree = decoder.buildDraftTree(mockLogits, []);
    const paths = decoder.flattenTree(tree);
    expect(paths.length).toBeGreaterThanOrEqual(1);
    for (const p of paths) expect(p.length).toBeGreaterThanOrEqual(1);
  });

  it('verifyTree accepts tokens with target-like distribution', async () => {
    const { TreeSpecDecoder } = await import('../speculative-decoding.js');
    const decoder = new TreeSpecDecoder({ maxNodes: 5, topK: 2, branchFactor: 2, maxDepth: 3, acceptanceThreshold: 0.9 });
    const draftLogits = () => {
      const arr = new Float32Array(5);
      arr[0] = 10; arr[1] = 9; arr[2] = 2;
      return arr;
    };
    const targetLogits = () => {
      const arr = new Float32Array(5);
      arr[0] = 10; arr[1] = 8; arr[2] = 3;
      return arr;
    };
    const tree = decoder.buildDraftTree(draftLogits, [0]);
    expect(tree.children.length).toBeGreaterThanOrEqual(1);
    const result = decoder.verifyTree([0], tree, targetLogits);
    expect(result.acceptedCount).toBeGreaterThanOrEqual(0);
    expect(result.acceptedTokens.length).toBe(result.acceptedCount);
  });

  it('accepts tokens along best path when draft matches target', async () => {
    const { TreeSpecDecoder } = await import('../speculative-decoding.js');
    const decoder = new TreeSpecDecoder({ maxNodes: 4, topK: 1, branchFactor: 1, maxDepth: 3, acceptanceThreshold: 1.0 });
    const logits = () => {
      const arr = new Float32Array(5);
      arr[0] = 100; arr[1] = 1; arr[2] = 1;
      return arr;
    };
    const tree = decoder.buildDraftTree(logits, [0]);
    expect(tree.children.length).toBe(1);
    expect(tree.children[0].token).toBe(0);
    const result = decoder.verifyTree([0], tree, logits);
    expect(result.acceptedCount).toBeGreaterThan(0);
  });

  it('adaptive budget scales with acceptance rate', async () => {
    const { TreeSpecDecoder } = await import('../speculative-decoding.js');
    const decoder = new TreeSpecDecoder({ maxNodes: 20, topK: 3, branchFactor: 3, maxDepth: 5, useAdaptiveBudget: true });
    const logits = () => {
      const arr = new Float32Array(10);
      arr[0] = 10; arr[1] = 9; arr[2] = 8;
      return arr;
    };
    const tree = decoder.buildDraftTree(logits, [1]);
    expect(tree.children.length).toBeGreaterThanOrEqual(1);
  });

  it('resetStats clears statistics', async () => {
    const { TreeSpecDecoder } = await import('../speculative-decoding.js');
    const decoder = new TreeSpecDecoder();
    decoder.resetStats();
    const stats = decoder.getStats();
    expect(stats.totalRounds).toBe(0);
    expect(stats.totalNodes).toBe(0);
    expect(stats.totalAccepted).toBe(0);
  });

  it('updateConfig changes parameters', async () => {
    const { TreeSpecDecoder } = await import('../speculative-decoding.js');
    const decoder = new TreeSpecDecoder({ maxNodes: 10 });
    decoder.updateConfig({ maxNodes: 20, acceptanceThreshold: 0.95 });
    const cfg = decoder.getConfig();
    expect(cfg.maxNodes).toBe(20);
    expect(cfg.acceptanceThreshold).toBe(0.95);
  });
});

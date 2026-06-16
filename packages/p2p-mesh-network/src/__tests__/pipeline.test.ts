import { describe, it, expect } from 'vitest';
import type { PipelineConfig, PeerCapability } from '../pipeline.js';

describe('PipelineManager', () => {
  const modelConfig: PipelineConfig = {
    modelName: 'llama-3.2-1b',
    numLayers: 16,
    hiddenDim: 2048,
    ffnDim: 8192,
    vocabSize: 128256,
    numHeads: 32,
    activationBytes: 16384,
  };

  const mockPeers: PeerCapability[] = [
    { peerId: 'pc-1', gpuTflops: 60, vramGb: 24, bandwidthGbps: 10, latencyMs: 2 },
    { peerId: 'phone-1', gpuTflops: 5, vramGb: 6, bandwidthGbps: 1, latencyMs: 10 },
    { peerId: 'pc-2', gpuTflops: 40, vramGb: 16, bandwidthGbps: 5, latencyMs: 3 },
    { peerId: 'phone-2', gpuTflops: 3, vramGb: 4, bandwidthGbps: 0.5, latencyMs: 15 },
  ];

  it('creates a pipeline assignment partitioning layers proportionally', async () => {
    const { PipelineManager } = await import('../pipeline.js');
    const pm = new PipelineManager();
    pm.configure(modelConfig);
    const assignment = pm.createPartition(mockPeers);
    expect(assignment.stages).toHaveLength(4);
    const totalLayers = assignment.stages.reduce((s, st) => s + (st.endLayer - st.startLayer + 1), 0);
    expect(totalLayers).toBe(16);
  });

  it('assigns more layers to higher-capability peers', async () => {
    const { PipelineManager } = await import('../pipeline.js');
    const pm = new PipelineManager();
    pm.configure(modelConfig);
    const assignment = pm.createPartition(mockPeers);
    const pc1 = assignment.stages.find((s) => s.peerId === 'pc-1')!;
    const phone1 = assignment.stages.find((s) => s.peerId === 'phone-1')!;
    const pc1Layers = pc1.endLayer - pc1.startLayer + 1;
    const phone1Layers = phone1.endLayer - phone1.startLayer + 1;
    expect(pc1Layers).toBeGreaterThan(phone1Layers);
  });

  it('finds next and previous stages', async () => {
    const { PipelineManager } = await import('../pipeline.js');
    const pm = new PipelineManager();
    pm.configure(modelConfig);
    pm.createPartition(mockPeers);
    const next = pm.getNextStage(0);
    expect(next).toBeDefined();
    expect(next!.stageIndex).toBe(1);
    const prev = pm.getPrevStage(1);
    expect(prev).toBeDefined();
    expect(prev!.stageIndex).toBe(0);
    expect(pm.getPrevStage(0)).toBeUndefined();
    expect(pm.getNextStage(3)).toBeUndefined();
  });

  it('reconfigures pipeline on peer failure', async () => {
    const { PipelineManager } = await import('../pipeline.js');
    const pm = new PipelineManager();
    pm.configure(modelConfig);
    pm.createPartition(mockPeers);
    const events: any[] = [];
    pm.onEvent((e) => events.push(e));
    pm.handlePeerFailure('phone-1');
    const reconf = events.find((e) => e.type === 'pipeline-reconfigured');
    expect(reconf).toBeDefined();
    const assignment = pm.getAssignment()!;
    expect(assignment.stages).toHaveLength(3);
    const totalLayers = assignment.stages.reduce((s, st) => s + (st.endLayer - st.startLayer + 1), 0);
    expect(totalLayers).toBe(16);
  });

  it('emits stage-complete event', async () => {
    const { PipelineManager } = await import('../pipeline.js');
    const pm = new PipelineManager();
    pm.configure(modelConfig);
    pm.createPartition(mockPeers);
    const events: any[] = [];
    pm.onEvent((e) => events.push(e));
    pm.markStageComplete(0);
    expect(events.some((e) => e.type === 'stage-complete')).toBe(true);
  });

  it('detects pipeline completion', async () => {
    const { PipelineManager } = await import('../pipeline.js');
    const pm = new PipelineManager();
    pm.configure(modelConfig);
    pm.createPartition(mockPeers);
    expect(pm.isPipelineComplete()).toBe(false);
    for (let i = 0; i < 4; i++) pm.markStageComplete(i);
    expect(pm.isPipelineComplete()).toBe(true);
  });

  it('throws when not configured', async () => {
    const { PipelineManager } = await import('../pipeline.js');
    const pm = new PipelineManager();
    expect(() => pm.createPartition(mockPeers)).toThrow('Pipeline not configured');
  });

  it('finds stage for a peer', async () => {
    const { PipelineManager } = await import('../pipeline.js');
    const pm = new PipelineManager();
    pm.configure(modelConfig);
    pm.createPartition(mockPeers);
    const stage = pm.getStageForPeer('pc-1');
    expect(stage).toBeDefined();
    expect(stage!.peerId).toBe('pc-1');
    expect(pm.getStageForPeer('nonexistent')).toBeUndefined();
  });
});

describe('computePeerWeight', () => {
  it('computes weight from capability', async () => {
    const { computePeerWeight } = await import('../pipeline.js');
    const weight = computePeerWeight({
      peerId: 'test',
      gpuTflops: 60,
      vramGb: 24,
      bandwidthGbps: 10,
      latencyMs: 2,
    });
    expect(weight).toBeGreaterThan(0);
    const weakWeight = computePeerWeight({
      peerId: 'weak',
      gpuTflops: 1,
      vramGb: 1,
      bandwidthGbps: 0.1,
      latencyMs: 100,
    });
    expect(weight).toBeGreaterThan(weakWeight);
  });
});

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import type { NodeCapability } from '../capability.js';
import type { Observation } from '../instinct.js';

describe('TransportManager', () => {
  beforeEach(() => {
    vi.stubGlobal('WebTransport', vi.fn().mockImplementation(() => ({
      ready: Promise.resolve(),
      closed: Promise.resolve(),
      close: vi.fn(),
      datagrams: { readable: { getReader: vi.fn() }, writable: { getWriter: vi.fn() } },
    })));
    vi.stubGlobal('RTCPeerConnection', vi.fn().mockImplementation(() => {
      const dc: any = { send: vi.fn(), close: vi.fn(), readyState: 'connecting', onopen: null, onerror: null, onmessage: null };
      setTimeout(() => { dc.readyState = 'open'; if (dc.onopen) dc.onopen(); }, 0);
      return { createDataChannel: vi.fn().mockReturnValue(dc), close: vi.fn() };
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts in disconnected state', async () => {
    const { TransportManager } = await import('../transport.js');
    const tm = new TransportManager({ relayUrl: 'https://relay.example.com' });
    expect(tm.getState()).toBe('disconnected');
  });

  it('connects via WebTransport successfully', async () => {
    const { TransportManager } = await import('../transport.js');
    const tm = new TransportManager({ relayUrl: 'https://relay.example.com' });
    await tm.connect();
    expect(tm.getState()).toBe('connected');
  });

  it('falls back to WebRTC when WebTransport fails', async () => {
    vi.stubGlobal('WebTransport', undefined);
    const { TransportManager } = await import('../transport.js');
    const tm = new TransportManager({ relayUrl: 'https://relay.example.com' });
    await tm.connect();
    expect(tm.getState()).toBe('degraded');
  });

  it('throws on send when disconnected', async () => {
    const { TransportManager } = await import('../transport.js');
    const tm = new TransportManager();
    await expect(tm.send(new Uint8Array([1, 2, 3]), 'peer-1')).rejects.toThrow('not connected');
  });

  it('manages peer list', async () => {
    const { TransportManager } = await import('../transport.js');
    const tm = new TransportManager();
    await tm.connect();
    expect(tm.getPeers().size).toBe(0);
  });
});

describe('WebRTCFallback', () => {
  beforeEach(() => {
    vi.stubGlobal('RTCPeerConnection', vi.fn().mockImplementation(() => {
      const dc: any = { send: vi.fn(), close: vi.fn(), readyState: 'connecting', onopen: null, onerror: null, onmessage: null };
      setTimeout(() => { dc.readyState = 'open'; if (dc.onopen) dc.onopen(); }, 0);
      return { createDataChannel: vi.fn().mockReturnValue(dc), close: vi.fn() };
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a DataChannel on connect', async () => {
    const { WebRTCFallback } = await import('../webrtc-fallback.js');
    const rtc = new WebRTCFallback();
    await rtc.connect();
    expect(rtc).toBeDefined();
  });
});

describe('CrdtSync', () => {
  it('initializes Automerge CRDT document', async () => {
    const { CrdtSync } = await import('../crdt-sync.js');
    const sync = new CrdtSync();
    const state = sync.getState();
    expect(state).toBeDefined();
  });

  it('updates L3 leader', async () => {
    const { CrdtSync } = await import('../crdt-sync.js');
    const sync = new CrdtSync();
    sync.setL3Leader('peer-1');
    expect(sync.getState().l3Leader).toBe('peer-1');
  });

  it('adds and removes peers', async () => {
    const { CrdtSync } = await import('../crdt-sync.js');
    const sync = new CrdtSync();
    sync.updatePeer('peer-a', { load: 50, availableMemory: 4096 });
    let state = sync.getState();
    expect(state.peers['peer-a']).toBeDefined();
    expect(state.peers['peer-a'].load).toBe(50);
    sync.removePeer('peer-a');
    state = sync.getState();
    expect(state.peers['peer-a']).toBeUndefined();
  });

  it('generates and loads snapshots', async () => {
    const { CrdtSync } = await import('../crdt-sync.js');
    const sync = new CrdtSync();
    sync.updatePeer('peer-a', { load: 75, availableMemory: 2048 });
    const snapshot = sync.getSnapshot();
    expect(snapshot.length).toBeGreaterThan(0);

    const sync2 = new CrdtSync();
    sync2.loadSnapshot(snapshot);
    expect(sync2.getState().peers['peer-a']).toBeDefined();
    expect(sync2.getState().peers['peer-a'].load).toBe(75);
  });

  it('compresses and decompresses snapshots symbolically', async () => {
    const { CrdtSync } = await import('../crdt-sync.js');
    const sync = new CrdtSync();
    sync.updatePeer('peer-a', { role: 'L2', score: 100, thermalHeadroom: 80, load: 50 });
    sync.setL3Leader('peer-a');
    const compressed = sync.getCompressedSnapshot();
    expect(compressed.length).toBeGreaterThan(0);
    const decoded = JSON.parse(new TextDecoder().decode(compressed));
    expect(decoded.l).toBe('peer-a');
    expect(decoded.p.length).toBe(1);

    const sync2 = new CrdtSync();
    sync2.decompressSnapshot(compressed);
    const state2 = sync2.getState();
    expect(state2.l3Leader).toBe('peer-a');
  });
});

describe('FailoverManager', () => {
  it('starts and stops heartbeat', async () => {
    const { CrdtSync } = await import('../crdt-sync.js');
    const { TransportManager } = await import('../transport.js');
    const { FailoverManager } = await import('../failover.js');
    const crdt = new CrdtSync();
    const transport = new TransportManager();
    const failover = new FailoverManager(crdt, transport);
    expect(() => { failover.start(); failover.recordHeartbeat('peer-1'); failover.stop(); }).not.toThrow();
  });
});

describe('RoleElection', () => {
  let dcCap: NodeCapability;

  beforeAll(() => {
    dcCap = { gpuTflops: 150, vramGb: 80, bandwidthGbps: 10, uptimePct: 99, latencyMs: 5, gpuCount: 4, isDatacenter: true };
  });

  beforeEach(() => {
    vi.stubGlobal('WebTransport', vi.fn().mockImplementation(() => ({
      ready: Promise.resolve(),
      closed: Promise.resolve(),
      close: vi.fn(),
      datagrams: { readable: { getReader: vi.fn() }, writable: { getWriter: vi.fn() } },
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('derives L3 role for datacenter capability', async () => {
    const { CrdtSync } = await import('../crdt-sync.js');
    const { TransportManager } = await import('../transport.js');
    const { RoleElection } = await import('../election.js');
    const election = new RoleElection(new CrdtSync(), new TransportManager(), dcCap);
    expect(election.getRole()).toBe('L3');
  });

  it('fires onElection callback on start', async () => {
    const { CrdtSync } = await import('../crdt-sync.js');
    const { TransportManager } = await import('../transport.js');
    const { RoleElection } = await import('../election.js');
    const election = new RoleElection(new CrdtSync(), new TransportManager(), dcCap);
    const handler = vi.fn();
    election.onElection(handler);
    election.start();
    expect(handler).toHaveBeenCalledWith('promoted', { role: 'L3' });
    election.stop();
  });
});

describe('Node capabilities', () => {
  const highCap: NodeCapability = { gpuTflops: 150, vramGb: 80, bandwidthGbps: 10, uptimePct: 99, latencyMs: 5, gpuCount: 4, isDatacenter: true };
  const lowCap: NodeCapability = { gpuTflops: 0.5, vramGb: 2, bandwidthGbps: 1, uptimePct: 50, latencyMs: 100, gpuCount: 1, isDatacenter: false };

  it('scores higher for more powerful hardware', async () => {
    const { computeScore } = await import('../capability.js');
    expect(computeScore(highCap)).toBeGreaterThan(computeScore(lowCap));
  });

  it('identifies L3 candidates', async () => {
    const { isL3Candidate, computeScore } = await import('../capability.js');
    expect(isL3Candidate(highCap, computeScore(lowCap))).toBe(true);
    expect(isL3Candidate(lowCap, computeScore(highCap))).toBe(false);
  });

  it('derives role from capability', async () => {
    const { deriveRole } = await import('../capability.js');
    const midCap: NodeCapability = { gpuTflops: 60, vramGb: 24, bandwidthGbps: 5, uptimePct: 95, latencyMs: 10, gpuCount: 2, isDatacenter: false };
    const lowEnd: NodeCapability = { gpuTflops: 5, vramGb: 8, bandwidthGbps: 1, uptimePct: 50, latencyMs: 50, gpuCount: 1, isDatacenter: false };
    expect(deriveRole(highCap)).toBe('L3');
    expect(deriveRole(midCap)).toBe('L2');
    expect(deriveRole(lowEnd)).toBe('L0');
  });
});

describe('InstinctEngine', () => {
  it('records observations and returns null when not promoted', async () => {
    const { InstinctEngine } = await import('../instinct.js');
    const engine = new InstinctEngine();
    const obs: Observation = { nodeId: 'node-a', metric: 'latency', value: 100, context: 'inference', success: true, timestamp: Date.now() };
    expect(engine.recordObservation(obs)).toBeNull();
  });

  it('promotes instincts after sufficient observations from multiple nodes', async () => {
    const { InstinctEngine } = await import('../instinct.js');
    const engine = new InstinctEngine();
    const makeObs = (nodeId: string): Observation => ({ nodeId, metric: 'latency', value: 100, context: 'inference', success: true, timestamp: Date.now() });
    for (let i = 0; i < 12; i++) engine.recordObservation(makeObs('node-a'));
    engine.recordObservation(makeObs('node-b'));
    expect(engine.getPromotedInstincts().length).toBeGreaterThan(0);
  });

  it('returns statistics', async () => {
    const { InstinctEngine } = await import('../instinct.js');
    const engine = new InstinctEngine();
    engine.recordObservation({ nodeId: 'node-a', metric: 'latency', value: 100, context: 'inference', success: true, timestamp: Date.now() });
    const stats = engine.getStatistics();
    expect(stats.totalObs).toBe(1);
    expect(stats.totalInstincts).toBe(1);
  });
});

describe('ExperimentTracker', () => {
  it('starts with default params', async () => {
    const { ExperimentTracker } = await import('../autonomous.js');
    const tracker = new ExperimentTracker();
    expect(tracker.getCurrentParams().batchSize).toBe(256);
    expect(tracker.getCurrentParams().threadCount).toBe(2);
  });

  it('records metrics without throwing', async () => {
    const { ExperimentTracker, defaultParams } = await import('../autonomous.js');
    const tracker = new ExperimentTracker();
    const params = defaultParams();
    expect(() => tracker.recordMetric(params, 0.85)).not.toThrow();
  });

  it('proposes experiments', async () => {
    const { ExperimentTracker } = await import('../autonomous.js');
    const tracker = new ExperimentTracker();
    const exp = tracker.proposeExperiment();
    if (exp) expect(tracker.getExperimentCount()).toBe(1);
  });
});

describe('PeerDiscovery', () => {
  it('initializes with no peers', async () => {
    const { PeerDiscovery } = await import('../discovery.js');
    const discovery = new PeerDiscovery();
    expect(discovery.getPeers()).toHaveLength(0);
  });
});

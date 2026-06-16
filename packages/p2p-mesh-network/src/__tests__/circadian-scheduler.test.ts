import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CircadianPeer } from '../circadian-scheduler.js';

function makePeer(overrides: Partial<CircadianPeer> & { id: string }): CircadianPeer {
  return {
    timezoneOffset: 0,
    deviceClass: 'desktop',
    thermalHeadroom: 10,
    isCharging: false,
    reliabilityScore: 0.9,
    ...overrides,
  };
}

describe('CircadianScheduler', () => {
  let Scheduler: typeof import('../circadian-scheduler.js').CircadianScheduler;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-08T12:00:00Z'));
    const mod = await import('../circadian-scheduler.js');
    Scheduler = mod.CircadianScheduler;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('computes local hour from timezone offset', () => {
    const s = new Scheduler();
    expect(s.getLocalHour(0)).toBe(12);
    expect(s.getLocalHour(120)).toBe(14);
    expect(s.getLocalHour(-300)).toBe(7);
  });

  it('detects night based on local hour', () => {
    const s = new Scheduler();
    vi.setSystemTime(new Date('2026-07-08T03:00:00Z'));
    expect(s.isNight(0)).toBe(true);
    expect(s.isNight(180)).toBe(false);
  });

  it('computes terminator longitude', () => {
    const s = new Scheduler();
    vi.setSystemTime(new Date('2026-07-08T12:00:00Z'));
    const term = s.getTerminatorLongitude();
    expect(term).toBeGreaterThanOrEqual(0);
    expect(term).toBeLessThan(360);
  });

  it('gives night peers higher scores', () => {
    const s = new Scheduler();
    vi.setSystemTime(new Date('2026-07-08T03:00:00Z'));
    const nightPeer = makePeer({ id: 'night', timezoneOffset: 0 });
    const dayPeer = makePeer({ id: 'day', timezoneOffset: 300 });
    const nightScore = s.computeScore(nightPeer);
    const dayScore = s.computeScore(dayPeer);
    expect(nightScore.score).toBeGreaterThan(dayScore.score);
  });

  it('returns preferred recommendation for high scores', () => {
    const s = new Scheduler();
    vi.setSystemTime(new Date('2026-07-08T03:00:00Z'));
    const peer = makePeer({ id: 'p1', timezoneOffset: 0, thermalHeadroom: 15, isCharging: true, reliabilityScore: 1 });
    const score = s.computeScore(peer);
    expect(score.recommendation).toBe('preferred');
  });

  it('penalizes midday mobile with low headroom', () => {
    const s = new Scheduler();
    vi.setSystemTime(new Date('2026-07-08T06:00:00Z'));
    const peer = makePeer({ id: 'p1', timezoneOffset: 0, deviceClass: 'mobile', thermalHeadroom: 1, reliabilityScore: 0.1 });
    const score = s.computeScore(peer);
    expect(score.score).toBeLessThan(0.5);
    expect(score.recommendation).toBe('available');
  });

  it('sorts peers by score descending', () => {
    const s = new Scheduler();
    vi.setSystemTime(new Date('2026-07-08T03:00:00Z'));
    const peers: CircadianPeer[] = [
      makePeer({ id: 'a', timezoneOffset: 0, reliabilityScore: 1 }),
      makePeer({ id: 'b', timezoneOffset: 300, reliabilityScore: 0.1 }),
      makePeer({ id: 'c', timezoneOffset: 600, reliabilityScore: 0.5 }),
    ];
    const scores = s.computeScores(peers);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1].score).toBeGreaterThanOrEqual(scores[i].score);
    }
  });

  it('selects top N peers excluding avoid', () => {
    const s = new Scheduler();
    vi.setSystemTime(new Date('2026-07-08T03:00:00Z'));
    const peers: CircadianPeer[] = [
      makePeer({ id: 'a', timezoneOffset: 0, reliabilityScore: 1 }),
      makePeer({ id: 'b', timezoneOffset: 0, reliabilityScore: 0.9 }),
      makePeer({ id: 'c', timezoneOffset: 0, reliabilityScore: 0.8 }),
    ];
    const selected = s.selectPeers(peers, 2);
    expect(selected).toHaveLength(2);
    expect(selected[0].id).toBe('a');
  });

  it('returns night duration', () => {
    const s = new Scheduler({ nightStartHour: 22, nightEndHour: 6 });
    expect(s.getNightDuration(0)).toBe(8);
  });

  it('estimates time to night', () => {
    const s = new Scheduler({ nightStartHour: 22, nightEndHour: 6 });
    vi.setSystemTime(new Date('2026-07-08T20:00:00Z'));
    expect(s.estimateTimeToNight(0)).toBe(2);
    vi.setSystemTime(new Date('2026-07-08T03:00:00Z'));
    expect(s.estimateTimeToNight(0)).toBe(0);
  });

  it('handles config updates', () => {
    const s = new Scheduler({ nightStartHour: 23, nightEndHour: 5 });
    expect(s.getConfig().nightStartHour).toBe(23);
    s.updateConfig({ nightStartHour: 22 });
    expect(s.getConfig().nightStartHour).toBe(22);
  });

  it('gives desktop higher base score than mobile at same time', () => {
    const s = new Scheduler();
    vi.setSystemTime(new Date('2026-07-08T14:00:00Z'));
    const desktop = makePeer({ id: 'desktop', deviceClass: 'desktop' });
    const mobile = makePeer({ id: 'mobile', deviceClass: 'mobile' });
    expect(s.computeScore(desktop).score).toBeGreaterThan(s.computeScore(mobile).score);
  });
});

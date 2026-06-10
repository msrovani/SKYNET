export type ThermalTrend = 'heating' | 'cooling' | 'stable';
export type ThermalZone = 'safe' | 'warm' | 'hot' | 'critical';
export type DeviceClass = 'mobile' | 'laptop' | 'desktop' | 'tv';

export interface ThermalReading {
  timestamp: number;
  temperature: number;
  headroom: number;
  cpuLoad: number;
  gpuLoad: number;
  batteryLevel: number;
  isCharging: boolean;
}

export interface ThermalConfig {
  deviceClass: DeviceClass;
  sampleWindowMs: number;
  maxSamples: number;
  safeHeadroom: number;
  warmHeadroom: number;
  hotHeadroom: number;
  criticalHeadroom: number;
  cooldownTarget: number;
  cooldownIntervalMs: number;
}

export interface SchedulerParams {
  threads: number;
  batchSize: number;
  maxTokens: number;
  modelVariant: string;
}

export type ThermalEventType = 'zone-changed' | 'params-adjusted' | 'model-shifted' | 'cooldown-activated' | 'cooldown-ended';
export interface ThermalEvent {
  type: ThermalEventType;
  zone: ThermalZone;
  previousZone?: ThermalZone;
  params?: SchedulerParams;
  modelVariant?: string;
  cooldownMs?: number;
}

export type ThermalCallback = (event: ThermalEvent) => void;

const DEFAULT_CONFIG: Record<DeviceClass, ThermalConfig> = {
  mobile: {
    deviceClass: 'mobile',
    sampleWindowMs: 5000,
    maxSamples: 60,
    safeHeadroom: 12,
    warmHeadroom: 8,
    hotHeadroom: 5,
    criticalHeadroom: 2,
    cooldownTarget: 10,
    cooldownIntervalMs: 30000,
  },
  laptop: {
    deviceClass: 'laptop',
    sampleWindowMs: 5000,
    maxSamples: 60,
    safeHeadroom: 14,
    warmHeadroom: 10,
    hotHeadroom: 6,
    criticalHeadroom: 3,
    cooldownTarget: 12,
    cooldownIntervalMs: 20000,
  },
  desktop: {
    deviceClass: 'desktop',
    sampleWindowMs: 10000,
    maxSamples: 30,
    safeHeadroom: 16,
    warmHeadroom: 12,
    hotHeadroom: 8,
    criticalHeadroom: 4,
    cooldownTarget: 14,
    cooldownIntervalMs: 10000,
  },
  tv: {
    deviceClass: 'tv',
    sampleWindowMs: 10000,
    maxSamples: 30,
    safeHeadroom: 14,
    warmHeadroom: 10,
    hotHeadroom: 6,
    criticalHeadroom: 3,
    cooldownTarget: 12,
    cooldownIntervalMs: 15000,
  },
};

export class ThermalManager {
  private config: ThermalConfig;
  private readings: ThermalReading[] = [];
  private callbacks: Set<ThermalCallback> = new Set();
  private zone: ThermalZone = 'safe';
  private cooldownUntil = 0;
  private inCooldown = false;
  private lastHeadroom: number;
  private trendWindow: ThermalReading[] = [];

  constructor(deviceClass: DeviceClass = 'mobile', customConfig?: Partial<ThermalConfig>) {
    this.config = { ...DEFAULT_CONFIG[deviceClass], ...customConfig };
    this.lastHeadroom = this.config.safeHeadroom;
  }

  onEvent(cb: ThermalCallback): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  private emit(event: ThermalEvent): void {
    for (const cb of this.callbacks) cb(event);
  }

  recordReading(reading: ThermalReading): void {
    this.readings.push(reading);
    if (this.readings.length > this.config.maxSamples) {
      this.readings.shift();
    }
    this.lastHeadroom = reading.headroom;
    const previousZone = this.zone;
    this.zone = this.computeZone(reading.headroom);

    this.trendWindow.push(reading);
    if (this.trendWindow.length > 5) this.trendWindow.shift();

    if (this.inCooldown && reading.headroom >= this.config.cooldownTarget) {
      this.inCooldown = false;
      this.emit({ type: 'cooldown-ended', zone: this.zone, previousZone });
    }

    if (this.zone !== previousZone) {
      this.emit({ type: 'zone-changed', zone: this.zone, previousZone });
      if (this.zone === 'critical' && !this.inCooldown) {
        this.activateCooldown();
      }
    }
  }

  private activateCooldown(): void {
    this.inCooldown = true;
    this.cooldownUntil = Date.now() + this.config.cooldownIntervalMs;
    this.emit({ type: 'cooldown-activated', zone: this.zone, cooldownMs: this.config.cooldownIntervalMs });
  }

  getTrend(): ThermalTrend {
    if (this.trendWindow.length < 2) return 'stable';
    const first = this.trendWindow[0].headroom;
    const last = this.trendWindow[this.trendWindow.length - 1].headroom;
    const diff = last - first;
    if (diff > 1) return 'cooling';
    if (diff < -1) return 'heating';
    return 'stable';
  }

  private computeZone(headroom: number): ThermalZone {
    if (headroom >= this.config.safeHeadroom) return 'safe';
    if (headroom >= this.config.warmHeadroom) return 'warm';
    if (headroom >= this.config.hotHeadroom) return 'hot';
    return 'critical';
  }

  private computeParams(headroom: number, trend: ThermalTrend): SchedulerParams {
    const zone = this.computeZone(headroom);
    const isHeating = trend === 'heating';
    const isCritical = zone === 'critical';
    const isHot = zone === 'hot';

    // Progressive reduction: each zone downscales by ~50%
    const batchScale = isCritical ? 0.25 : isHot ? 0.5 : 0.75;
    const threadScale = isCritical ? 0.5 : isHot ? 0.75 : 1;

    // Extra reduction if still heating in warm+ zone
    const heatingPenalty = isHeating && (isHot || zone === 'warm') ? 0.7 : 1;

    const baseThreads = this.config.deviceClass === 'desktop' ? 8 : 4;
    const baseBatch = this.config.deviceClass === 'desktop' ? 512 : 128;

    const threads = Math.max(1, Math.round(baseThreads * threadScale * heatingPenalty));
    const batchSize = Math.max(1, Math.round(baseBatch * batchScale * heatingPenalty));

    const modelVariant = this.selectModelVariant(headroom, zone);

    return { threads, batchSize, maxTokens: batchSize * 4, modelVariant };
  }

  private selectModelVariant(headroom: number, zone: ThermalZone): string {
    if (zone === 'safe' || (zone === 'warm' && headroom > 9)) return 'full';
    if (zone === 'warm' || zone === 'hot') return 'reduced';
    return 'minimal';
  }

  getParams(): SchedulerParams {
    const headroom = this.getEffectiveHeadroom();
    const trend = this.getTrend();
    const params = this.computeParams(headroom, trend);
    if (this.inCooldown) {
      params.threads = 1;
      params.batchSize = 1;
      params.modelVariant = 'minimal';
    }
    return params;
  }

  getEffectiveHeadroom(): number {
    if (this.readings.length === 0) return this.lastHeadroom;
    const recent = this.readings.slice(-5);
    return recent.reduce((s, r) => s + r.headroom, 0) / recent.length;
  }

  getZone(): ThermalZone {
    return this.zone;
  }

  getCurrentHeadroom(): number {
    return this.lastHeadroom;
  }

  getConfig(): ThermalConfig {
    return { ...this.config };
  }

  updateConfig(cfg: Partial<ThermalConfig>): void {
    this.config = { ...this.config, ...cfg };
  }

  isInCooldown(): boolean {
    return this.inCooldown;
  }

  getReadings(): ThermalReading[] {
    return [...this.readings];
  }

  getAverageHeadroom(): number {
    if (this.readings.length === 0) return this.lastHeadroom;
    return this.readings.reduce((s, r) => s + r.headroom, 0) / this.readings.length;
  }

  getStabilityScore(): number {
    if (this.readings.length < 5) return 1;
    const recent = this.readings.slice(-5);
    const values = recent.map(r => r.headroom);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    return Math.max(0, 1 - Math.sqrt(variance) / mean);
  }

  reset(readings?: ThermalReading[]): void {
    this.readings = readings || [];
    this.trendWindow = [];
    this.zone = 'safe';
    this.cooldownUntil = 0;
    this.inCooldown = false;
  }
}

export class DynamicShifter {
  private modelChain: string[];
  private currentIndex: number;
  private shifts: number;
  private lastShiftTime: number;
  private minShiftIntervalMs: number;

  constructor(modelChain: string[], minShiftIntervalMs = 10000) {
    if (modelChain.length < 1) modelChain = ['full'];
    this.modelChain = modelChain;
    this.currentIndex = 0;
    this.shifts = 0;
    this.lastShiftTime = 0;
    this.minShiftIntervalMs = minShiftIntervalMs;
  }

  getCurrentModel(): string {
    return this.modelChain[this.currentIndex];
  }

  shiftDown(): string {
    const now = Date.now();
    if (now - this.lastShiftTime < this.minShiftIntervalMs) return this.getCurrentModel();
    if (this.currentIndex < this.modelChain.length - 1) {
      this.currentIndex++;
      this.shifts++;
      this.lastShiftTime = now;
    }
    return this.getCurrentModel();
  }

  shiftUp(): string {
    const now = Date.now();
    if (now - this.lastShiftTime < this.minShiftIntervalMs) return this.getCurrentModel();
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.shifts++;
      this.lastShiftTime = now;
    }
    return this.getCurrentModel();
  }

  shiftTo(zone: ThermalZone): string {
    switch (zone) {
      case 'safe':
        while (this.currentIndex > 0) this.currentIndex--;
        break;
      case 'warm':
        if (this.currentIndex < 1) this.currentIndex = 1;
        break;
      case 'hot':
        if (this.currentIndex < 2) this.currentIndex = 2;
        break;
      case 'critical':
        this.currentIndex = this.modelChain.length - 1;
        break;
    }
    this.shifts++;
    this.lastShiftTime = Date.now();
    return this.getCurrentModel();
  }

  getShiftCount(): number {
    return this.shifts;
  }

  getModelChain(): string[] {
    return [...this.modelChain];
  }
}

export interface VmPlacement {
  vmId: string;
  nodeId: string;
  thermalScore: number;
  estimatedTempRise: number;
}

export class TAPASScheduler {
  private history: Map<string, ThermalReading[]> = new Map();
  private readonly HISTORY_LIMIT = 100;
  private readonly TEMP_RISE_PER_WATT = 0.042;
  private readonly CRITICAL_TEMP = 85;

  recordNodeReading(nodeId: string, reading: ThermalReading): void {
    if (!this.history.has(nodeId)) this.history.set(nodeId, []);
    const readings = this.history.get(nodeId)!;
    readings.push(reading);
    if (readings.length > this.HISTORY_LIMIT) readings.shift();
  }

  getThermalScore(nodeId: string): number {
    const readings = this.history.get(nodeId);
    if (!readings || readings.length < 3) return 1;

    const recent = readings.slice(-5);
    const avgHeadroom = recent.reduce((s, r) => s + r.headroom, 0) / recent.length;
    const trend = recent.length >= 2
      ? recent[recent.length - 1].headroom - recent[0].headroom
      : 0;

    const headroomScore = Math.min(1, avgHeadroom / 20);
    const trendPenalty = trend < -2 ? 0.3 : trend < 0 ? 0.15 : 0;
    const loadPenalty = (recent.reduce((s, r) => s + r.cpuLoad + r.gpuLoad, 0) / (recent.length * 200)) * 0.2;

    return Math.max(0.05, headroomScore * 0.5 - trendPenalty - loadPenalty);
  }

  recommendPlacement(vmId: string, powerWatt: number, availableNodes: string[]): VmPlacement {
    const scored = availableNodes.map(nodeId => {
      const thermalScore = this.getThermalScore(nodeId);
      const estimatedTempRise = powerWatt * this.TEMP_RISE_PER_WATT;
      return { vmId, nodeId, thermalScore, estimatedTempRise };
    });

    scored.sort((a, b) => b.thermalScore - a.thermalScore);
    return scored[0];
  }

  routeRequest(nodeId: string, currentHeadroom: number): boolean {
    if (currentHeadroom < 3) return false;
    const score = this.getThermalScore(nodeId);
    const recent = this.history.get(nodeId);
    if (recent && recent.length >= 2) {
      const trend = recent[recent.length - 1].headroom - recent[0].headroom;
      if (trend < -3 && currentHeadroom < 8) return false;
    }
    return score > 0.15;
  }

  getNodeHistory(nodeId: string): ThermalReading[] {
    return [...(this.history.get(nodeId) || [])];
  }

  clearHistory(nodeId?: string): void {
    if (nodeId) this.history.delete(nodeId);
    else this.history.clear();
  }
}

export interface FUSEConfig {
  cpuFreq: number;
  gpuFreq: number;
  memFreq: number;
}

const FUSE_PROFILES: Map<string, FUSEConfig> = new Map([
  ['mobile_safe', { cpuFreq: 1800, gpuFreq: 800, memFreq: 3200 }],
  ['mobile_warm', { cpuFreq: 1400, gpuFreq: 600, memFreq: 2400 }],
  ['mobile_hot', { cpuFreq: 1000, gpuFreq: 400, memFreq: 1800 }],
  ['mobile_critical', { cpuFreq: 600, gpuFreq: 200, memFreq: 1200 }],
  ['laptop_safe', { cpuFreq: 2500, gpuFreq: 1200, memFreq: 4800 }],
  ['laptop_warm', { cpuFreq: 2000, gpuFreq: 900, memFreq: 3600 }],
  ['laptop_hot', { cpuFreq: 1500, gpuFreq: 600, memFreq: 2400 }],
  ['laptop_critical', { cpuFreq: 800, gpuFreq: 300, memFreq: 1600 }],
  ['desktop_safe', { cpuFreq: 3500, gpuFreq: 1800, memFreq: 6400 }],
  ['desktop_warm', { cpuFreq: 2800, gpuFreq: 1400, memFreq: 4800 }],
  ['desktop_hot', { cpuFreq: 2000, gpuFreq: 1000, memFreq: 3200 }],
  ['desktop_critical', { cpuFreq: 1200, gpuFreq: 600, memFreq: 2000 }],
]);

export class FUSEGovernor {
  private model: string;
  private deviceClass: DeviceClass;
  private batchSize: number;
  private configCache: Map<string, FUSEConfig> = new Map();

  constructor(model: string = 'default', deviceClass: DeviceClass = 'mobile', batchSize: number = 128) {
    this.model = model;
    this.deviceClass = deviceClass;
    this.batchSize = batchSize;
  }

  lookup(zone: ThermalZone): FUSEConfig {
    const key = `${this.deviceClass}_${zone}_${this.batchSize}`;
    const cached = this.configCache.get(key);
    if (cached) return cached;
    const profile = FUSE_PROFILES.get(key) || FUSE_PROFILES.get('mobile_safe')!;
    const config: FUSEConfig = { ...profile };
    if (this.batchSize > 256) {
      config.gpuFreq = Math.round(config.gpuFreq * 0.85);
      config.cpuFreq = Math.round(config.cpuFreq * 0.9);
    }
    this.configCache.set(key, config);
    return config;
  }

  prefillConfig(deviceClass: DeviceClass, batchSize: number): void {
    const zones: ThermalZone[] = ['safe', 'warm', 'hot', 'critical'];
    for (const z of zones) {
      const key = `${deviceClass}_${z}_${batchSize}`;
      const profile = FUSE_PROFILES.get(`${deviceClass}_${z}`)!;
      const config: FUSEConfig = { ...profile };
      if (batchSize > 256) {
        config.gpuFreq = Math.round(config.gpuFreq * 0.85);
        config.cpuFreq = Math.round(config.cpuFreq * 0.9);
      }
      this.configCache.set(key, config);
    }
  }

  clearCache(): void {
    this.configCache.clear();
  }
}

export interface BanditAction {
  gpuFreq: number;
  batchSize: number;
}

export class AGFTScheduler {
  private actions: BanditAction[];
  private qValues: number[];
  private counts: number[];
  private totalPlays: number;
  private readonly explorationRate: number;

  constructor() {
    this.actions = [
      { gpuFreq: 300, batchSize: 32 },
      { gpuFreq: 600, batchSize: 64 },
      { gpuFreq: 900, batchSize: 128 },
      { gpuFreq: 1200, batchSize: 128 },
      { gpuFreq: 1500, batchSize: 64 },
      { gpuFreq: 1800, batchSize: 32 },
    ];
    this.qValues = new Array(this.actions.length).fill(0);
    this.counts = new Array(this.actions.length).fill(0);
    this.totalPlays = 0;
    this.explorationRate = 0.3;
  }

  selectAction(thermalZone: ThermalZone): BanditAction {
    if (Math.random() < this.explorationRate || this.totalPlays < 10) {
      const safeActions = this.actions.filter((_, i) => {
        const freq = this.actions[i].gpuFreq;
        if (thermalZone === 'critical') return freq <= 600;
        if (thermalZone === 'hot') return freq <= 900;
        if (thermalZone === 'warm') return freq <= 1200;
        return true;
      });
      if (safeActions.length > 0) {
        const idx = Math.floor(Math.random() * safeActions.length);
        return safeActions[idx];
      }
    }
    let bestIdx = 0;
    let bestQ = -Infinity;
    for (let i = 0; i < this.actions.length; i++) {
      const freq = this.actions[i].gpuFreq;
      if (thermalZone === 'critical' && freq > 600) continue;
      if (thermalZone === 'hot' && freq > 900) continue;
      if (thermalZone === 'warm' && freq > 1200) continue;
      if (this.qValues[i] > bestQ) {
        bestQ = this.qValues[i];
        bestIdx = i;
      }
    }
    return this.actions[bestIdx];
  }

  updateReward(actionIndex: number, reward: number): void {
    if (actionIndex < 0 || actionIndex >= this.actions.length) return;
    this.counts[actionIndex]++;
    this.totalPlays++;
    const alpha = 1 / this.counts[actionIndex];
    this.qValues[actionIndex] += alpha * (reward - this.qValues[actionIndex]);
  }

  getActions(): BanditAction[] {
    return [...this.actions];
  }

  getStats(): { qValues: number[]; counts: number[]; totalPlays: number } {
    return { qValues: [...this.qValues], counts: [...this.counts], totalPlays: this.totalPlays };
  }
}

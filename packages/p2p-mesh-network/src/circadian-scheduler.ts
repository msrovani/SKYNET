export type DeviceClass = 'mobile' | 'laptop' | 'desktop' | 'tv';

export interface CircadianPeer {
  id: string;
  timezoneOffset: number;
  latitude?: number;
  deviceClass: DeviceClass;
  thermalHeadroom: number;
  isCharging: boolean;
  reliabilityScore: number;
}

export interface CircadianScore {
  peerId: string;
  score: number;
  isNight: boolean;
  localHour: number;
  recommendation: 'preferred' | 'available' | 'avoid';
}

export interface CircadianConfig {
  nightStartHour: number;
  nightEndHour: number;
  peakSolarHour: number;
  thermalBonusWeight: number;
  chargingBonusWeight: number;
  reliabilityWeight: number;
  deviceBonus: Partial<Record<DeviceClass, number>>;
}

const DEFAULT_CONFIG: CircadianConfig = {
  nightStartHour: 22,
  nightEndHour: 6,
  peakSolarHour: 13,
  thermalBonusWeight: 0.2,
  chargingBonusWeight: 0.1,
  reliabilityWeight: 0.15,
  deviceBonus: {
    mobile: 0.6,
    laptop: 0.8,
    desktop: 1.0,
    tv: 0.5,
  },
};

export class CircadianScheduler {
  private config: CircadianConfig;
  private localTimezoneOffset: number;

  constructor(config: Partial<CircadianConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.localTimezoneOffset = -new Date().getTimezoneOffset();
  }

  getLocalHour(timezoneOffset: number): number {
    const utcHours = Date.now() / 3600000;
    return ((utcHours + timezoneOffset / 60) % 24 + 24) % 24;
  }

  isNight(timezoneOffset: number): boolean {
    const hour = this.getLocalHour(timezoneOffset);
    if (this.config.nightStartHour <= this.config.nightEndHour) {
      return hour >= this.config.nightStartHour && hour < this.config.nightEndHour;
    }
    return hour >= this.config.nightStartHour || hour < this.config.nightEndHour;
  }

  getTerminatorLongitude(): number {
    const utcHours = Date.now() / 3600000;
    const solarNoonLongitude = (180 - utcHours * 15) % 360;
    return ((solarNoonLongitude - 180) % 360 + 360) % 360;
  }

  computeScore(peer: CircadianPeer): CircadianScore {
    const localHour = this.getLocalHour(peer.timezoneOffset);
    const night = this.isNight(peer.timezoneOffset);

    let circadianScore: number;
    if (night) {
      circadianScore = 1.0;
    } else if (localHour >= 6 && localHour < 18) {
      const peakDist = Math.abs(localHour - this.config.peakSolarHour);
      circadianScore = Math.max(0.2, 1.0 - peakDist * 0.06);
    } else {
      const transitionProgress = localHour < this.config.nightStartHour
        ? (localHour - 18) / 4
        : (localHour - this.config.nightEndHour) / 4;
      circadianScore = Math.max(0.3, 1.0 - transitionProgress * 0.4);
    }

    const deviceBase = this.config.deviceBonus[peer.deviceClass] ?? 0.5;
    const thermalBonus = Math.min(peer.thermalHeadroom / 15, 1) * this.config.thermalBonusWeight;
    const chargingBonus = peer.isCharging ? this.config.chargingBonusWeight : 0;
    const reliabilityBonus = peer.reliabilityScore * this.config.reliabilityWeight;

    const score = Math.min(1, circadianScore * 0.5 + deviceBase * 0.25 + thermalBonus + chargingBonus + reliabilityBonus);
    const recommendation: CircadianScore['recommendation'] = score >= 0.7 ? 'preferred' : score >= 0.4 ? 'available' : 'avoid';

    return { peerId: peer.id, score, isNight: night, localHour, recommendation };
  }

  computeScores(peers: CircadianPeer[]): CircadianScore[] {
    return peers.map(p => this.computeScore(p)).sort((a, b) => b.score - a.score);
  }

  selectPeers(peers: CircadianPeer[], count: number): CircadianPeer[] {
    return peers
      .map(p => ({ peer: p, score: this.computeScore(p) }))
      .filter(({ score }) => score.recommendation !== 'avoid')
      .sort((a, b) => b.score.score - a.score.score)
      .slice(0, count)
      .map(({ peer }) => peer);
  }

  getNightDuration(_timezoneOffset: number): number {
    const start = this.config.nightStartHour;
    const end = this.config.nightEndHour;
    if (start <= end) return end - start;
    return 24 - start + end;
  }

  estimateTimeToNight(timezoneOffset: number): number {
    const hour = this.getLocalHour(timezoneOffset);
    if (this.isNight(timezoneOffset)) return 0;
    if (hour < this.config.nightStartHour) {
      return this.config.nightStartHour - hour;
    }
    return 24 - hour + this.config.nightStartHour;
  }

  updateConfig(cfg: Partial<CircadianConfig>): void {
    this.config = { ...this.config, ...cfg };
  }

  getConfig(): CircadianConfig {
    return { ...this.config };
  }
}

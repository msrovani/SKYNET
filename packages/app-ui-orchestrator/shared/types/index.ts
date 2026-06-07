export enum OperationMode {
  TACTICAL = 'tactical',
  FARM = 'farm',
  PASSIVE = 'passive',
}

export interface AppState {
  mode: OperationMode;
  isCharging: boolean;
  batteryLevel: number;
  onWifi: boolean;
  thermalHeadroom: number;
  isComputing: boolean;
  peersConnected: number;
  tasksCompleted: number;
  earningsUsd: number;
}

export interface MeshStatus {
  connected: boolean;
  peerCount: number;
  transportType: 'webtransport' | 'webrtc' | 'disconnected';
  latencyMs: number;
  throughputTokensPerSec: number;
}

export interface FarmConfig {
  enabled: boolean;
  maxCpuUsage: number;
  maxBatteryDrain: number;
  requireCharging: boolean;
  requireWifi: boolean;
  modelSize: 'tiny' | 'small' | 'medium';
  thermalLimit: number;
}

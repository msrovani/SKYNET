export enum AiMode {
  LIGHTNING = 'lightning',
  DEEP = 'deep',
  AGENT = 'agent',
}

export const AI_MODE_LABELS: Record<AiMode, string> = {
  [AiMode.LIGHTNING]: 'Relâmpago',
  [AiMode.DEEP]: 'Profundo',
  [AiMode.AGENT]: 'Agente',
};

export const AI_MODE_ICONS: Record<AiMode, string> = {
  [AiMode.LIGHTNING]: '⚡',
  [AiMode.DEEP]: '🔬',
  [AiMode.AGENT]: '🤖',
};

export const AI_MODE_DESCRIPTIONS: Record<AiMode, string> = {
  [AiMode.LIGHTNING]: 'Respostas instantâneas — <100ms',
  [AiMode.DEEP]: 'Raciocínio extendido — precisão máxima',
  [AiMode.AGENT]: 'Autónomo multi-passo — "faz isto por mim"',
};

export enum AgentAutonomy {
  WATCH = 'watch',
  ASSIST = 'assist',
  AUTO = 'auto',
}

export const AGENT_AUTONOMY_LABELS: Record<AgentAutonomy, string> = {
  [AgentAutonomy.WATCH]: 'Vigiar — aprova cada passo',
  [AgentAutonomy.ASSIST]: 'Assistir — aprova pontos críticos',
  [AgentAutonomy.AUTO]: 'Automático — execução total',
};

export interface AppState {
  mode: AiMode;
  agentAutonomy: AgentAutonomy;
  isCharging: boolean;
  batteryLevel: number;
  onWifi: boolean;
  thermalHeadroom: number;
  thermalZone: string;
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
  activeAgents: number;
}

export interface SilentConfig {
  enabled: boolean;
  requireCharging: boolean;
  requireWifi: boolean;
  maxCpuUsage: number;
  maxBatteryDrain: number;
  contributionHours: number;
  tokensEarned: number;
}

export interface AgentTask {
  id: string;
  description: string;
  status: 'pending' | 'planning' | 'executing' | 'completed' | 'failed';
  agentName?: string;
  progress: number;
  result?: string;
}

export interface InferenceRequest {
  prompt: string;
  mode: AiMode;
  maxTokens: number;
  temperature: number;
  agentAutonomy?: AgentAutonomy;
}

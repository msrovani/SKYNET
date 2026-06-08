import { useState, useEffect, useCallback } from 'react';
import {
  AppState, AiMode, AgentAutonomy, MeshStatus, SilentConfig,
  AgentTask, AI_MODE_LABELS,
} from '../types/index.js';

const DEFAULT_APP: AppState = {
  mode: AiMode.LIGHTNING,
  agentAutonomy: AgentAutonomy.ASSIST,
  isCharging: false,
  batteryLevel: 1.0,
  onWifi: true,
  thermalHeadroom: 15,
  thermalZone: 'safe',
  isComputing: false,
  peersConnected: 0,
  tasksCompleted: 0,
  earningsUsd: 0,
};

export function useSkynet() {
  const [appState, setAppState] = useState<AppState>(DEFAULT_APP);
  const [meshStatus, setMeshStatus] = useState<MeshStatus>({
    connected: false,
    peerCount: 0,
    transportType: 'disconnected',
    latencyMs: 0,
    throughputTokensPerSec: 0,
    activeAgents: 0,
  });
  const [silentConfig, setSilentConfig] = useState<SilentConfig>({
    enabled: false,
    requireCharging: true,
    requireWifi: true,
    maxCpuUsage: 0.5,
    maxBatteryDrain: 0.2,
    contributionHours: 0,
    tokensEarned: 0,
  });
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([]);
  const [response, setResponse] = useState<string>('');

  const setMode = useCallback((mode: AiMode) => {
    setAppState(prev => ({ ...prev, mode, isComputing: false }));
    setResponse('');
    setAgentTasks([]);
  }, []);

  const setAutonomy = useCallback((agentAutonomy: AgentAutonomy) => {
    setAppState(prev => ({ ...prev, agentAutonomy }));
  }, []);

  const submitInference = useCallback(async (prompt: string) => {
    if (!prompt.trim()) return;
    setAppState(prev => ({ ...prev, isComputing: true }));
    setResponse('');
    setAgentTasks([]);

    switch (appState.mode) {
      case AiMode.LIGHTNING:
        setResponse('⚡ ' + prompt.split(' ').reverse().join(' '));
        break;
      case AiMode.DEEP:
        for (let i = 0; i < 5; i++) {
          await new Promise(r => setTimeout(r, 200));
          setResponse(prev => prev + `token_${i} `);
        }
        break;
      case AiMode.AGENT: {
        const tasks: AgentTask[] = [
          { id: '1', description: 'Planear tarefa', status: 'pending', progress: 0 },
          { id: '2', description: 'Agente webdesign: gerar layout', status: 'pending', progress: 0 },
          { id: '3', description: 'Agente content: escrever texto', status: 'pending', progress: 0 },
          { id: '4', description: 'Agregar resultados', status: 'pending', progress: 0 },
        ];
        setAgentTasks(tasks);
        for (const t of tasks) {
          await new Promise(r => setTimeout(r, 400));
          setAgentTasks(prev => prev.map(task =>
            task.id === t.id ? { ...task, status: 'executing' as const, progress: 0.5 } : task
          ));
          await new Promise(r => setTimeout(r, 600));
          setAgentTasks(prev => prev.map(task =>
            task.id === t.id ? { ...task, status: 'completed' as const, progress: 1, result: `✓ ${t.description} concluído` } : task
          ));
        }
        setResponse('✅ Solução completa! (simulado)');
        break;
      }
    }

    setAppState(prev => ({
      ...prev,
      isComputing: false,
      tasksCompleted: prev.tasksCompleted + 1,
    }));
  }, [appState.mode]);

  const toggleSilent = useCallback(() => {
    setSilentConfig(prev => ({ ...prev, enabled: !prev.enabled }));
  }, []);

  // Simulated telemetry
  useEffect(() => {
    const interval = setInterval(() => {
      setAppState(prev => ({
        ...prev,
        batteryLevel: Math.max(0.1, prev.batteryLevel - 0.005),
        thermalHeadroom: Math.max(1, prev.thermalHeadroom - 0.1 + Math.random() * 0.2),
        peersConnected: Math.min(8, Math.floor(Math.random() * 5) + 1),
      }));
      setMeshStatus(prev => ({
        ...prev,
        latencyMs: 10 + Math.random() * 40,
        throughputTokensPerSec: 10 + Math.random() * 30,
      }));
      if (silentConfig.enabled) {
        setSilentConfig(prev => ({
          ...prev,
          contributionHours: prev.contributionHours + 0.001,
          tokensEarned: prev.tokensEarned + 0.0001,
        }));
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [silentConfig.enabled]);

  return {
    appState,
    meshStatus,
    silentConfig,
    agentTasks,
    response,
    setMode,
    setAutonomy,
    submitInference,
    toggleSilent,
    setSilentConfig,
  };
}

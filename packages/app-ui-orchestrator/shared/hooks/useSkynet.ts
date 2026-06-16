import { useState, useEffect, useCallback, useRef } from 'react';
import { createAgentFromTemplate } from '@skynet/core-wasm-engine';
import { SolanaX402, MicroTxManager } from '@skynet/blockchain-client';
import {
  AppState, AiMode, AgentAutonomy, MeshStatus, SilentConfig,
  AgentTask,
} from '../types/index';

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

interface SkynetEngine {
  x402: SolanaX402;
  microtx: MicroTxManager;
}

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

  const engineRef = useRef<SkynetEngine | null>(null);

  useEffect(() => {
    const x402 = new SolanaX402({ simulate: true });
    const microtx = new MicroTxManager(x402);
    engineRef.current = { x402, microtx };
    return () => { engineRef.current = null; };
  }, []);

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

    const engine = engineRef.current;

    switch (appState.mode) {
      case AiMode.LIGHTNING:
      case AiMode.DEEP: {
        try {
          const res = await fetch('/api/inference', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, mode: appState.mode }),
          });
          const data = await res.json();
          const icon = appState.mode === AiMode.LIGHTNING ? '⚡' : '🔬';
          if (res.ok) {
            setResponse(`${icon} ${data.content}`);
          } else {
            setResponse(`❌ ${data.content}`);
          }
        } catch (err) {
          setResponse(`❌ Erro de rede: ${err instanceof Error ? err.message : 'Falha na ligação'}`);
        }
        break;
      }

      case AiMode.AGENT: {
        const autonomy = appState.agentAutonomy;
        const taskIds = [
          `Planear: ${prompt.slice(0, 40)}...`,
          'Agente webdesign: gerar layout',
          'Agente content: produzir conteúdo',
          'Fraction Aggregator: sintetizar',
        ];
        const tasks: AgentTask[] = taskIds.map((d, i) => ({
          id: String(i), description: d, status: 'pending' as const, progress: 0,
        }));
        setAgentTasks(tasks);

        const updateTask = (id: string, updates: Partial<AgentTask>) => {
          setAgentTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } as AgentTask : t));
        };

        updateTask('0', { status: 'executing', progress: 0.3 });
        if (autonomy === AgentAutonomy.WATCH || autonomy === AgentAutonomy.ASSIST) {
          await new Promise(r => setTimeout(r, 300));
        }
        updateTask('0', { status: 'completed', progress: 1 });

        updateTask('1', { status: 'executing', progress: 0.3 });
        const webAgent = createAgentFromTemplate('webdesign', 'web-agent');
        await webAgent.load();
        const webOut = await webAgent.execute({ prompt, context: [] });
        updateTask('1', { status: 'completed', progress: 1 });
        webAgent.reset();

        updateTask('2', { status: 'executing', progress: 0.3 });
        const contentAgent = createAgentFromTemplate('content-writer', 'content-agent');
        await contentAgent.load();
        const contentOut = await contentAgent.execute({ prompt, context: [] });
        updateTask('2', { status: 'completed', progress: 1 });
        contentAgent.reset();

        updateTask('3', { status: 'executing', progress: 0.5 });
        await new Promise(r => setTimeout(r, 200));
        updateTask('3', { status: 'completed', progress: 1 });

        if (engine) {
          try {
            const payment = await engine.microtx.payForInference('agent-task', 0.001);
            if (payment.success) {
              setAppState(prev => ({
                ...prev,
                earningsUsd: prev.earningsUsd - 0.001,
              }));
            }
          } catch (err) {
            console.warn('[SKYNET] Payment failed:', err);
            setAppState(prev => ({ ...prev, error: 'Payment failed' }));
          }
        }

        setResponse(`🤖 ${webOut.content}\n---\n${contentOut.content}`);
        break;
      }
    }

    setAppState(prev => ({
      ...prev,
      isComputing: false,
      tasksCompleted: prev.tasksCompleted + 1,
    }));
  }, [appState.mode, appState.agentAutonomy]);

  const toggleSilent = useCallback(() => {
    setSilentConfig(prev => ({ ...prev, enabled: !prev.enabled }));
  }, []);

  // Telemetry
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

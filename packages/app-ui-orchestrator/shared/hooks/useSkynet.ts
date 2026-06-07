import { useState, useEffect, useCallback } from 'react';
import { AppState, OperationMode, MeshStatus, FarmConfig } from '../types/index.js';

export function useSkynet() {
  const [appState, setAppState] = useState<AppState>({
    mode: OperationMode.PASSIVE,
    isCharging: false,
    batteryLevel: 1.0,
    onWifi: true,
    thermalHeadroom: 15,
    isComputing: false,
    peersConnected: 0,
    tasksCompleted: 0,
    earningsUsd: 0,
  });

  const [meshStatus, setMeshStatus] = useState<MeshStatus>({
    connected: false,
    peerCount: 0,
    transportType: 'disconnected',
    latencyMs: 0,
    throughputTokensPerSec: 0,
  });

  const [farmConfig, setFarmConfig] = useState<FarmConfig>({
    enabled: false,
    maxCpuUsage: 0.5,
    maxBatteryDrain: 0.2,
    requireCharging: true,
    requireWifi: true,
    modelSize: 'small',
    thermalLimit: 40,
  });

  const setMode = useCallback((mode: OperationMode) => {
    setAppState(prev => ({ ...prev, mode }));
  }, []);

  const startFarming = useCallback(() => {
    setFarmConfig(prev => ({ ...prev, enabled: true }));
    setMode(OperationMode.FARM);
  }, [setMode]);

  const stopFarming = useCallback(() => {
    setFarmConfig(prev => ({ ...prev, enabled: false }));
    setMode(OperationMode.PASSIVE);
  }, [setMode]);

  return {
    appState,
    meshStatus,
    farmConfig,
    setMode,
    startFarming,
    stopFarming,
    setFarmConfig,
  };
}

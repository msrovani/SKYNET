export interface DeviceCapability {
  computeScore: number;
  memoryMb: number;
  bandwidthMbps: number;
}

export interface SubmodelConfig {
  deviceId: string;
  startLayer: number;
  endLayer: number;
  totalLayers: number;
}

export class FedLAGC {
  private totalLayers: number;
  private submodels: Map<string, SubmodelConfig> = new Map();
  private globalModel: Map<string, Float32Array> = new Map();
  private correctionTerms: Map<string, Float32Array> = new Map();

  constructor(totalLayers: number = 32) {
    this.totalLayers = totalLayers;
  }

  assignSubmodel(deviceId: string, capability: DeviceCapability): SubmodelConfig {
    let startLayer: number;
    let endLayer: number;
    if (capability.computeScore >= 0.7) {
      startLayer = 0;
      endLayer = this.totalLayers;
    } else if (capability.computeScore >= 0.4) {
      const count = Math.max(1, Math.round(this.totalLayers * 0.6));
      startLayer = Math.round(this.totalLayers * 0.4);
      endLayer = Math.min(this.totalLayers, startLayer + count);
    } else if (capability.computeScore >= 0.2) {
      const count = Math.max(1, Math.round(this.totalLayers * 0.3));
      startLayer = Math.round((this.totalLayers - count) / 2);
      endLayer = startLayer + count;
    } else {
      const count = Math.max(1, Math.round(this.totalLayers * 0.15));
      startLayer = 0;
      endLayer = count;
    }
    const config: SubmodelConfig = { deviceId, startLayer, endLayer, totalLayers: this.totalLayers };
    this.submodels.set(deviceId, config);
    return config;
  }

  extractSubmodel(config: SubmodelConfig): Map<string, Float32Array> {
    const result: Map<string, Float32Array> = new Map();
    const numSubmodelLayers = config.endLayer - config.startLayer;
    if (numSubmodelLayers === 0) return result;
    for (const [name, weights] of this.globalModel) {
      const layerIndex = this.parseLayerIndex(name);
      if (layerIndex >= config.startLayer && layerIndex < config.endLayer) {
        const localIdx = layerIndex - config.startLayer;
        const start = localIdx * (weights.length / numSubmodelLayers);
        const end = (localIdx + 1) * (weights.length / numSubmodelLayers);
        result.set(name, weights.slice(start, end));
      }
    }
    return result;
  }

  correctGradients(
    localUpdate: Map<string, Float32Array>,
    config: SubmodelConfig,
  ): Map<string, Float32Array> {
    const corrected: Map<string, Float32Array> = new Map();
    const numSubmodelLayers = config.endLayer - config.startLayer;
    if (numSubmodelLayers === 0) return corrected;
    const scalingFactor = this.totalLayers / numSubmodelLayers;
    for (const [name, weights] of this.globalModel) {
      const layerIndex = this.parseLayerIndex(name);
      if (layerIndex >= config.startLayer && layerIndex < config.endLayer) {
        const localWeights = localUpdate.get(name);
        if (localWeights) {
          const scaled = new Float32Array(localWeights.length);
          for (let i = 0; i < localWeights.length; i++) {
            scaled[i] = localWeights[i] * scalingFactor;
          }
          corrected.set(name, scaled);
        } else {
          corrected.set(name, new Float32Array(weights.length));
        }
      } else {
        corrected.set(name, new Float32Array(weights.length));
      }
    }
    return corrected;
  }

  aggregateUpdates(
    updates: Array<{ config: SubmodelConfig; corrected: Map<string, Float32Array> }>,
  ): void {
    if (updates.length === 0) return;
    for (const [name, globalWeights] of this.globalModel) {
      const aggregated = new Float32Array(globalWeights.length);
      let totalWeight = 0;
      for (const { config, corrected } of updates) {
        const layerCoverage = this.getLayerCoverage(config, name);
        if (layerCoverage > 0) {
          const layerUpdate = corrected.get(name);
          if (layerUpdate) {
            for (let i = 0; i < layerUpdate.length; i++) {
              aggregated[i] += layerUpdate[i] * layerCoverage;
            }
            totalWeight += layerCoverage;
          }
        }
      }
      if (totalWeight > 0) {
        for (let i = 0; i < aggregated.length; i++) {
          globalWeights[i] = aggregated[i] / totalWeight;
        }
        this.globalModel.set(name, globalWeights);
      }
    }
  }

  setGlobalLayer(name: string, weights: Float32Array): void {
    this.globalModel.set(name, weights);
  }

  private getLayerCoverage(config: SubmodelConfig, layerName: string): number {
    const layerIndex = this.parseLayerIndex(layerName);
    if (layerIndex >= config.startLayer && layerIndex < config.endLayer) {
      return 1;
    }
    return 0;
  }

  private parseLayerIndex(layerName: string): number {
    const match = layerName.match(/_l(\d+)/);
    if (match) return parseInt(match[1], 10);
    return 0;
  }

  getSubmodel(deviceId: string): SubmodelConfig | undefined {
    return this.submodels.get(deviceId);
  }

  removeDevice(deviceId: string): void {
    this.submodels.delete(deviceId);
  }

  deviceCount(): number {
    return this.submodels.size;
  }
}

import { SubTask } from './planner.js';

export type Topology = 'parallel' | 'sequential' | 'hierarchical' | 'hybrid';

export interface TopologyDecision {
  topology: Topology;
  layers: SubTask[][];
  justification: string;
  metrics: {
    parallelismWidth: number;
    criticalPathDepth: number;
    interSubtaskCoupling: number;
  };
}

export class TopologyRouter {
  analyze(subtasks: SubTask[], layers: SubTask[][]): TopologyDecision {
    const parallelismWidth = Math.max(...layers.map(l => l.length), 1);
    const criticalPathDepth = layers.length;
    const interSubtaskCoupling = this.computeCoupling(subtasks, layers);

    let topology: Topology;
    let justification: string;

    if (criticalPathDepth === 1 && parallelismWidth > 1) {
      topology = 'parallel';
      justification = 'Todas as sub-tarefas são independentes — execução paralela máxima';
    } else if (parallelismWidth <= 1 && subtasks.length > 1) {
      topology = 'sequential';
      justification = 'Cadeia linear de dependências — execução sequencial';
    } else if (interSubtaskCoupling > 0.7 && parallelismWidth > 1) {
      topology = 'hierarchical';
      justification = 'Alto acoplamento entre sub-tarefas paralelas — arbitragem necessária';
    } else {
      topology = 'hybrid';
      justification = 'Misto de dependências — paralelo dentro de layers, sequencial entre layers';
    }

    return {
      topology,
      layers: topology === 'sequential' ? layers.flatMap(l => l).map(s => [s]) : layers,
      justification,
      metrics: { parallelismWidth, criticalPathDepth, interSubtaskCoupling },
    };
  }

  private computeCoupling(subtasks: SubTask[], layers: SubTask[][]): number {
    const byId = new Map(subtasks.map(s => [s.id, s]));
    const edgeCount = subtasks.reduce((sum, s) => sum + s.dependsOn.length, 0);
    const maxEdges = Math.max(1, subtasks.length * (subtasks.length - 1) / 2);
    const density = edgeCount / maxEdges;

    const crossLayerDeps = layers.reduce((sum, layer, i) => {
      let deps = 0;
      for (const task of layer) {
        for (const depId of task.dependsOn) {
          const dep = byId.get(depId);
          if (dep) {
            const depLayer = layers.findIndex(l => l.includes(dep));
            if (depLayer >= 0 && depLayer !== i) deps++;
          }
        }
      }
      return sum + deps;
    }, 0);

    const coupling = density * 0.4 + (crossLayerDeps / Math.max(1, edgeCount)) * 0.6;
    return Math.min(1, coupling);
  }
}

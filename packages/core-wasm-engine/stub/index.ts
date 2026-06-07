export interface FitnessReport {
  throughput: number;
  latency: number;
  thermalEfficiency: number;
  earnings: number;
  successRate: number;
}

export interface ContextItem {
  key: string;
  content: string;
  priority: number;
  sizeBytes: number;
}

export interface KnowledgeGraphNode {
  id: string;
  nodeType: string;
  weight: number;
}

export interface KnowledgeGraphEdge {
  from: string;
  to: string;
  edgeType: string;
  weight: number;
}

export interface CascadeEntry {
  node: string;
  impact: number;
}

export interface ShardMetadata {
  shardId: string;
  tensorId: string;
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
  rows: number;
  cols: number;
  dataLen: number;
  checksum: number;
  shardIndex: number;
  totalShards: number;
}

export interface TensorShard {
  metadata: ShardMetadata;
  data: Float32Array;
}

export interface TensorDescriptor {
  rows: number;
  cols: number;
  data: Float32Array;
}

let wasmModule: any = null;

export async function initWasm(): Promise<boolean> {
  try {
    // Dynamic import resolved at runtime from dist/core_wasm_engine.js
    const mod = await Function('return import("./core_wasm_engine.js")')();
    const initFn = mod.default;
    if (typeof initFn === 'function') {
      await initFn();
    }
    wasmModule = mod;
    return true;
  } catch {
    wasmModule = null;
    return false;
  }
}

export function computeThermalScore(headroom: number, load: number, temp: number, threshold: number): number {
  const thermalPressure = temp / Math.max(threshold, 0.1);
  const loadFactor = load / 100;
  return Math.max(0, headroom - thermalPressure * 0.5 - loadFactor * 0.3);
}

export function getThermalHeadroom(): number {
  if (wasmModule) {
    return wasmModule.get_thermal_headroom();
  }
  return 0.5;
}

export function computeOptimalParams(headroom: number): any {
  if (wasmModule) {
    return wasmModule.compute_optimal_params(headroom);
  }
  return { batchSize: 1, maxTokens: 128 };
}

export function webgpuIsSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export async function webgpuBenchmark(): Promise<number> {
  if (!webgpuIsSupported()) return 0;
  try {
    const adapter = await (navigator as any).gpu.requestAdapter();
    if (!adapter) return 0;
    const info = adapter.info;
    const tier: Record<string, number> = { high: 15, medium: 8, low: 3 };
    return tier[info.architecture === 'high' ? 'high' : 'medium'] ?? 5;
  } catch {
    return 0;
  }
}

export function quantizeInt4(data: Float32Array): Uint8Array {
  const out = new Uint8Array(Math.ceil(data.length / 2));
  for (let i = 0; i < data.length; i += 2) {
    const v0 = Math.max(0, Math.min(15, Math.round((data[i] + 8) / 16 * 15)));
    const v1 = i + 1 < data.length
      ? Math.max(0, Math.min(15, Math.round((data[i + 1] + 8) / 16 * 15)))
      : 0;
    out[i >> 1] = (v0 << 4) | v1;
  }
  return out;
}

export function dequantizeInt4(data: Uint8Array): Float32Array {
  const out = new Float32Array(data.length * 2);
  for (let i = 0; i < data.length; i++) {
    const hi = (data[i] >> 4) & 0xf;
    const lo = data[i] & 0xf;
    out[i * 2] = (hi / 15) * 16 - 8;
    out[i * 2 + 1] = (lo / 15) * 16 - 8;
  }
  return out;
}

export function computeScore(gpuTflops: number, vramGb: number, uptimePct: number, latencyMs: number): number {
  return (gpuTflops * vramGb * uptimePct) / Math.max(latencyMs, 1);
}

export function isL3Candidate(gpuTflops: number, vramGb: number, uptimePct: number, latencyMs: number, nextBestScore: number, isDatacenter: boolean): boolean {
  const score = computeScore(gpuTflops, vramGb, uptimePct, latencyMs);
  return score > nextBestScore * 10 && isDatacenter;
}

export function maxModelParamsB(gpuTflops: number, vramGb: number): number {
  const vramLimit = vramGb / 4.8;
  const tflopsLimit = gpuTflops / 60;
  return Math.max(Math.min(vramLimit, tflopsLimit), 0.5);
}

export function computeCapabilityScore(cap: any): number {
  if (wasmModule) {
    return wasmModule.compute_capability_score(cap);
  }
  return computeScore(cap.gpuTflops || 0, cap.vramGb || 0, cap.uptimePct || 0, cap.latencyMs || 0);
}

export function createEvolutionEngine(): any {
  if (wasmModule) {
    return wasmModule.create_evolution_engine();
  }
  return { generation: 0, population: [] };
}

export function evolvePopulation(engine: any): any {
  if (wasmModule) {
    return wasmModule.evolve_population(engine);
  }
  return [];
}

export function reportFitness(engine: any, params: any, report: any): any {
  if (wasmModule) {
    return wasmModule.report_fitness(engine, params, report);
  }
  return engine;
}

export function getBestParams(engine: any): any {
  if (wasmModule) {
    return wasmModule.get_best_params(engine);
  }
  return {};
}

export function createFitnessReport(
  throughput: number, latency: number, thermal: number, earnings: number, success: number
): any {
  if (wasmModule) {
    return wasmModule.create_fitness_report(throughput, latency, thermal, earnings, success);
  }
  return { throughput, latency, thermalEfficiency: thermal, earnings, successRate: success };
}

export function computeFitnessScore(report: FitnessReport): number {
  if (wasmModule) {
    return wasmModule.compute_fitness_score(report);
  }
  const t = Math.min(report.throughput / 100, 1) * 0.3;
  const l = Math.max(0, 1 - report.latency / 1000) * 0.2;
  const te = Math.min(report.thermalEfficiency / 100, 1) * 0.2;
  const e = Math.min(report.earnings / 10, 1) * 0.15;
  const s = report.successRate * 0.15;
  return t + l + te + e + s;
}

export class KnowledgeGraph {
  nodes: Map<string, KnowledgeGraphNode> = new Map();
  edges: KnowledgeGraphEdge[] = [];
  private wasmKg: any = null;

  constructor() {
    if (wasmModule) {
      this.wasmKg = wasmModule.create_knowledge_graph();
    }
  }

  addNode(id: string, nodeType: string, weight: number): void {
    if (wasmModule && this.wasmKg) {
      this.wasmKg = wasmModule.kg_add_node(this.wasmKg, id, nodeType, weight);
      return;
    }
    this.nodes.set(id, { id, nodeType, weight });
  }

  addEdge(from: string, to: string, edgeType: string, weight: number): void {
    if (wasmModule && this.wasmKg) {
      this.wasmKg = wasmModule.kg_add_edge(this.wasmKg, from, to, edgeType, weight);
      return;
    }
    if (this.nodes.has(from) && this.nodes.has(to)) {
      this.edges.push({ from, to, edgeType, weight });
    }
  }

  getThermalCascade(nodeId: string): CascadeEntry[] {
    if (wasmModule && this.wasmKg) {
      return wasmModule.kg_thermal_cascade(this.wasmKg, nodeId);
    }
    const visited = new Set<string>();
    const result: CascadeEntry[] = [];
    const queue = [{ id: nodeId, impact: 1 }];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur.id)) continue;
      visited.add(cur.id);
      for (const edge of this.edges) {
        if (edge.from === cur.id && edge.edgeType === 'depends') {
          const impact = cur.impact * (1 - edge.weight * 0.1);
          result.push({ node: edge.to, impact });
          queue.push({ id: edge.to, impact });
        }
      }
    }
    return result;
  }
}

export function pruneContextWasm(items: ContextItem[], targetRatio: number): ContextItem[] {
  if (wasmModule) {
    return wasmModule.prune_context_wasm(items, targetRatio);
  }
  const totalBytes = items.reduce((s, i) => s + i.sizeBytes, 0);
  const targetBytes = totalBytes * targetRatio;
  const scored = items.map((i) => ({
    item: i,
    score: i.priority / Math.max(i.sizeBytes / Math.max(totalBytes, 1), 0.01),
  })).sort((a, b) => b.score - a.score);
  const kept: ContextItem[] = [];
  let running = 0;
  for (const { item } of scored) {
    if (running + item.sizeBytes <= targetBytes || kept.length === 0) {
      kept.push(item);
      running += item.sizeBytes;
    }
  }
  return kept;
}

export function shardTensorRowwise(
  tensorId: string, data: Float32Array, rows: number, cols: number, numShards: number
): TensorShard[] {
  if (wasmModule) {
    return wasmModule.shard_tensor_rowwise(tensorId, data, rows, cols, numShards);
  }
  const rowsPerShard = Math.ceil(rows / numShards);
  const shards: TensorShard[] = [];
  for (let i = 0; i < numShards; i++) {
    const rStart = i * rowsPerShard;
    const rEnd = Math.min((i + 1) * rowsPerShard, rows);
    const shardRows = rEnd - rStart;
    const shardData = new Float32Array(shardRows * cols);
    for (let r = 0; r < shardRows; r++) {
      shardData.set(data.subarray((rStart + r) * cols, (rStart + r) * cols + cols), r * cols);
    }
    let checksum = 0;
    for (let k = 0; k < shardData.length; k++) {
      const buf = new Uint32Array(new Float32Array([shardData[k]]).buffer);
      checksum = (checksum + buf[0]) | 0;
    }
    shards.push({
      metadata: {
        shardId: `${tensorId}/shard/${i}`, tensorId,
        rowStart: rStart, rowEnd: rEnd, colStart: 0, colEnd: cols,
        rows: shardRows, cols, dataLen: shardData.length,
        checksum, shardIndex: i, totalShards: numShards,
      },
      data: shardData,
    });
  }
  return shards;
}

export function shardTensorColwise(
  tensorId: string, data: Float32Array, rows: number, cols: number, numShards: number
): TensorShard[] {
  if (wasmModule) {
    return wasmModule.shard_tensor_colwise(tensorId, data, rows, cols, numShards);
  }
  const colsPerShard = Math.ceil(cols / numShards);
  const shards: TensorShard[] = [];
  for (let i = 0; i < numShards; i++) {
    const cStart = i * colsPerShard;
    const cEnd = Math.min((i + 1) * colsPerShard, cols);
    const shardCols = cEnd - cStart;
    const shardData = new Float32Array(rows * shardCols);
    for (let r = 0; r < rows; r++) {
      shardData.set(data.subarray(r * cols + cStart, r * cols + cEnd), r * shardCols);
    }
    let checksum = 0;
    for (let k = 0; k < shardData.length; k++) {
      const buf = new Uint32Array(new Float32Array([shardData[k]]).buffer);
      checksum = (checksum + buf[0]) | 0;
    }
    shards.push({
      metadata: {
        shardId: `${tensorId}/shard/${i}`, tensorId,
        rowStart: 0, rowEnd: rows, colStart: cStart, colEnd: cEnd,
        rows, cols: shardCols, dataLen: shardData.length,
        checksum, shardIndex: i, totalShards: numShards,
      },
      data: shardData,
    });
  }
  return shards;
}

export function reconstructTensor(shards: TensorShard[], originalRows: number, originalCols: number): TensorDescriptor {
  if (wasmModule) {
    return wasmModule.reconstruct_tensor(shards, originalRows, originalCols);
  }
  const isRowwise = shards[0].metadata.rowEnd - shards[0].metadata.rowStart > 0
    && shards[0].metadata.colEnd - shards[0].metadata.colStart === originalCols;
  const result = new Float32Array(originalRows * originalCols);
  if (isRowwise) {
    for (const shard of shards) {
      const { rowStart, rowEnd } = shard.metadata;
      const shardRows = rowEnd - rowStart;
      for (let r = 0; r < shardRows; r++) {
        result.set(
          shard.data.subarray(r * originalCols, (r + 1) * originalCols),
          (rowStart + r) * originalCols,
        );
      }
    }
  } else {
    for (const shard of shards) {
      const { colStart, colEnd } = shard.metadata;
      const shardCols = colEnd - colStart;
      for (let r = 0; r < originalRows; r++) {
        result.set(
          shard.data.subarray(r * shardCols, (r + 1) * shardCols),
          r * originalCols + colStart,
        );
      }
    }
  }
  return { rows: originalRows, cols: originalCols, data: result };
}

export function verifyTensorShard(shard: TensorShard): boolean {
  if (wasmModule) {
    return wasmModule.verify_tensor_shard(shard);
  }
  let checksum = 0;
  for (let k = 0; k < shard.data.length; k++) {
    const buf = new Uint32Array(new Float32Array([shard.data[k]]).buffer);
    checksum = (checksum + buf[0]) | 0;
  }
  return checksum === shard.metadata.checksum;
}

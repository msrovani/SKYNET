export interface NodeCapability {
  gpuTflops: number;
  vramGb: number;
  bandwidthGbps: number;
  uptimePct: number;
  latencyMs: number;
  gpuCount: number;
  isDatacenter: boolean;
}

export type NodeRole = 'L0' | 'L1' | 'L2' | 'L3';

export interface VCapabilityVector {
  version: number;
  embedding: Float32Array;
  domain: string;
  tools: string[];
  systemPrompt: string;
  costPerTask: number;
  maxConcurrent: number;
  avgLatencyMs: number;
}

export function computeScore(cap: NodeCapability): number {
  return (cap.gpuTflops * cap.vramGb * cap.uptimePct) / Math.max(cap.latencyMs, 1);
}

export function isL3Candidate(cap: NodeCapability, nextBestScore: number): boolean {
  return computeScore(cap) > nextBestScore * 10 && cap.isDatacenter;
}

export function maxModelParamsB(cap: NodeCapability): number {
  const vramLimit = cap.vramGb / 4.8;
  const tflopsLimit = (cap.gpuTflops * cap.gpuCount) / 60;
  return Math.max(Math.min(vramLimit, tflopsLimit), 0.5);
}

export function deriveRole(cap: NodeCapability): NodeRole {
  if (cap.isDatacenter) return 'L3';
  if (cap.gpuTflops > 50) return 'L2';
  if (cap.gpuTflops > 10) return 'L1';
  return 'L0';
}

export function serializeCapability(cap: NodeCapability): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(cap));
}

export function deserializeCapability(data: Uint8Array): NodeCapability {
  return JSON.parse(new TextDecoder().decode(data));
}

export function embedText(text: string, dimensions: number = 64): Float32Array {
  const vec = new Float32Array(dimensions);
  let seed = 0;
  for (let i = 0; i < text.length; i++) {
    seed = ((seed << 5) - seed + text.charCodeAt(i)) | 0;
  }
  for (let d = 0; d < dimensions; d++) {
    seed = (seed * 1103515245 + 12345) | 0;
    vec[d] = (seed >>> 0) / 0xFFFFFFFF;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  for (let d = 0; d < dimensions; d++) {
    vec[d] /= norm || 1;
  }
  return vec;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

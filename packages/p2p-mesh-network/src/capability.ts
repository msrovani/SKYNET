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

import { existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { cpus, freemem, totalmem } from 'node:os';
import { execSync } from 'node:child_process';

export interface HardwareDevice {
  type: 'cuda' | 'vulkan' | 'metal' | 'coreml' | 'qnn' | 'cpu';
  name: string;
  vramMB?: number;
  backendPriority: number;
}

export interface AutoModelConfig {
  modelId: string;
  modelPath: string | null;
  device: 'cpu' | 'cuda' | 'metal';
  gpuLayers: number;
  threads: number;
  contextSize: number;
  deviceMemoryMB: number;
  backendPriority: HardwareDevice[];
  batchSize: number;
}

interface CatalogEntry {
  minVRAM: number;
  modelId: string;
  hfRepo: string;
  hfFile: string;
  layers: number;
  paramsB: number;
}
const MODEL_CATALOG: CatalogEntry[] = [
  { minVRAM: 0, modelId: 'phi-3-mini',   hfRepo: 'microsoft/Phi-3-mini-4k-instruct-gguf', hfFile: 'Phi-3-mini-4k-instruct-q4.gguf',   layers: 32, paramsB: 3.8 },
  { minVRAM: 6, modelId: 'llama-3.2-3b', hfRepo: 'hugging-quants/Llama-3.2-3B-Instruct-Q4_K_M-GGUF', hfFile: 'llama-3.2-3b-instruct-q4_k_m.gguf', layers: 28, paramsB: 3.2 },
  { minVRAM: 8, modelId: 'mistral-7b',   hfRepo: 'MaziyarPanahi/Mistral-7B-Instruct-v0.3-GGUF', hfFile: 'mistral-7b-instruct-v0.3.Q4_K_M.gguf',  layers: 32, paramsB: 7.0 },
  { minVRAM: 16, modelId: 'llama-3.1-8b', hfRepo: 'hugging-quants/Llama-3.1-8B-Instruct-GGUF', hfFile: 'llama-3.1-8b-instruct-q4_k_m.gguf', layers: 32, paramsB: 8.0 },
];

function detectCUDADevices(): HardwareDevice[] {
  const devices: HardwareDevice[] = [];
  try {
    const cudaPath = process.env.CUDA_PATH || process.env.CUDA_PATH_V13_0 || '';
    const nvccPaths = [
      ...(cudaPath ? [`${cudaPath}\\bin\\nvcc.exe`] : []),
      'C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v13.0\\bin\\nvcc.exe',
      'C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.8\\bin\\nvcc.exe',
      'C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.6\\bin\\nvcc.exe',
    ];
    const hasNVCC = nvccPaths.some(p => existsSync(p));
    if (!hasNVCC) {
      try {
        execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader', { stdio: 'pipe', timeout: 5000 });
      } catch { return devices; }
    }
    try {
      const output = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader', { encoding: 'utf-8', stdio: 'pipe', timeout: 10000 });
      for (const line of output.trim().split('\n')) {
        const parts = line.split(',');
        if (parts.length >= 2) {
          const name = parts[0].trim();
          const vramMatch = parts[1].trim().match(/(\d+)/);
          const vramMB = vramMatch ? parseInt(vramMatch[1]) : 4096;
          devices.push({ type: 'cuda', name, vramMB, backendPriority: 1 });
        }
      }
    } catch { return devices; }
  } catch { }
  return devices;
}

function detectHardware(): { cpuCores: number; freeRamMB: number; totalRamMB: number; freeDiskMB: number; devices: HardwareDevice[] } {
  const cpuCores = cpus().length;
  const totalRamMB = Math.floor(totalmem() / (1024 * 1024));
  const freeRamMB = Math.floor(freemem() / (1024 * 1024));
  const devices: HardwareDevice[] = [];
  let freeDiskMB = 0;
  try {
    const df = execSync('wmic logicaldisk get size,freesize,caption', { encoding: 'utf-8', timeout: 3000 });
    for (const line of df.trim().split('\n').slice(1)) {
      const m = line.match(/(\w):\s+(\d+)\s+(\d+)/);
      if (m) {
        const free = Math.floor(parseInt(m[3]) / (1024 * 1024));
        if (free > freeDiskMB) freeDiskMB = free;
      }
    }
  } catch { freeDiskMB = 50000; }
  const cudaDevices = detectCUDADevices();
  devices.push(...cudaDevices);
  devices.push({ type: 'cpu', name: `${cpuCores}-core CPU`, backendPriority: 99 });
  return { cpuCores, freeRamMB, totalRamMB, freeDiskMB, devices };
}

function isAppleSilicon(): boolean {
  try {
    return process.arch === 'arm64' && process.platform === 'darwin';
  } catch { return false; }
}

function detectAppleDevices(): HardwareDevice[] {
  if (!isAppleSilicon()) return [];
  const devices: HardwareDevice[] = [];
  try {
    const sysctl = execSync('sysctl -n hw.memsize', { encoding: 'utf-8', timeout: 3000 });
    const totalBytes = parseInt(sysctl.trim());
    const totalGB = Math.floor(totalBytes / (1024 * 1024 * 1024));
    devices.push({ type: 'metal', name: `Apple Silicon ${totalGB}GB Unified`, backendPriority: 2 });
    devices.push({ type: 'coreml', name: 'Apple Neural Engine', backendPriority: 3 });
  } catch { devices.push({ type: 'metal', name: 'Apple Silicon', backendPriority: 2 }); }
  return devices;
}

function findModelFile(modelId: string): string | null {
  const modelsDir = resolve(process.cwd(), 'models');
  const entry = MODEL_CATALOG.find(m => m.modelId === modelId);
  if (!entry) return null;
  const modelPath = resolve(modelsDir, entry.hfFile);
  if (existsSync(modelPath)) return modelPath;
  const altPaths = [
    resolve(modelsDir, modelId, entry.hfFile),
    resolve(modelsDir, modelId, `${modelId}.gguf`),
  ];
  for (const p of altPaths) {
    if (existsSync(p)) return p;
  }
  return null;
}

export class AutoConfig {
  static async downloadModel(modelId: string): Promise<string | null> {
    const entry = MODEL_CATALOG.find(m => m.modelId === modelId);
    if (!entry) return null;
    const modelsDir = resolve(process.cwd(), 'models');
    mkdirSync(modelsDir, { recursive: true });
    const modelPath = resolve(modelsDir, entry.hfFile);
    if (existsSync(modelPath)) return modelPath;
    const url = `https://huggingface.co/${entry.hfRepo}/resolve/main/${entry.hfFile}`;
    console.log(`Downloading ${entry.hfFile} (${entry.hfRepo})...`);
    const response = await fetch(url);
    if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    const reader = response.body.getReader();
    const writer = createWriteStream(modelPath);
    const total = parseInt(response.headers.get('content-length') || '0', 10);
    let downloaded = 0;
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      writer.write(Buffer.from(value));
      downloaded += value.length;
      if (total > 0) {
        const pct = ((downloaded / total) * 100).toFixed(1);
        process.stdout.write(`\rDownloading... ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)}MB / ${(total / 1024 / 1024).toFixed(1)}MB)`);
      }
    }
    process.stdout.write('\n');
    await new Promise<void>((res, rej) => writer.end((err: Error | null) => err ? rej(err) : res()));
    return modelPath;
  }

  static async autoDetectAndConfigure(): Promise<AutoModelConfig> {
    const hw = detectHardware();
    const appleDevices = detectAppleDevices();
    const allDevices = [...hw.devices, ...appleDevices].sort((a, b) => a.backendPriority - b.backendPriority);
    const bestDevice = allDevices[0];
    const cudaDevice = allDevices.find(d => d.type === 'cuda');
    const metalDevice = allDevices.find(d => d.type === 'metal');
    const vramMB = cudaDevice?.vramMB ?? (metalDevice ? hw.totalRamMB : 0);
    const deviceType: 'cuda' | 'metal' | 'cpu' = cudaDevice ? 'cuda' : metalDevice ? 'metal' : 'cpu';
    const deviceMemoryMB = vramMB || hw.freeRamMB;
    const catalogEntry = MODEL_CATALOG.slice().reverse().find(m => m.minVRAM <= deviceMemoryMB / 1024) || MODEL_CATALOG[0];
    const modelId = catalogEntry.modelId;
    const modelPath = findModelFile(modelId);
    const modelLayers = catalogEntry.layers;
    let gpuLayers = 0;
    const vramGB = deviceMemoryMB / 1024;
    const contextSize = vramGB < 6 ? 2048 : 4096;
    const batchSize = vramGB < 6 ? 128 : vramGB < 12 ? 256 : 512;
    if (deviceType === 'cuda' && cudaDevice) {
      const ramForGPU = Math.min(cudaDevice.vramMB || 4096, hw.freeRamMB + (cudaDevice.vramMB || 4096) - 512);
      const kvCacheMB = modelLayers * contextSize * 0.012;
      const scratchMB = 256;
      const overheadMB = 256;
      const cudaRuntimeMB = 512;
      const totalReserved = kvCacheMB + scratchMB + overheadMB + cudaRuntimeMB;
      const availableForLayers = Math.max(0, ramForGPU - totalReserved);
      const safetyFactor = 0.75;
      const bytesPerParam = 0.5 * 1.15;
      const modelWeightMB = catalogEntry.paramsB * 1024 * bytesPerParam;
      const perLayerMB = modelWeightMB / modelLayers;
      gpuLayers = Math.min(modelLayers, Math.max(0, Math.floor(availableForLayers * safetyFactor / perLayerMB)));
    } else if (deviceType === 'metal') {
      gpuLayers = Math.max(0, Math.min(modelLayers, Math.floor((hw.freeRamMB - 4096) / ((catalogEntry.paramsB * 1024 * 0.575) / modelLayers))));
    }
    const threads = Math.max(1, hw.cpuCores - 1);
    return {
      modelId,
      modelPath,
      device: deviceType,
      gpuLayers,
      threads,
      contextSize,
      deviceMemoryMB,
      backendPriority: allDevices,
      batchSize,
    };
  }
}

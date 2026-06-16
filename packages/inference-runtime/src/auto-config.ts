import { existsSync, mkdirSync, createWriteStream, createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { cpus, freemem, totalmem } from 'node:os';
import { execSync } from 'node:child_process';
import { createGzip, createGunzip } from 'node:zlib';

export type PlatformType = 'desktop' | 'mobile' | 'tv' | 'unknown';

export interface HardwareDevice {
  type: 'cuda' | 'vulkan' | 'metal' | 'coreml' | 'qnn' | 'webgpu' | 'cpu';
  name: string;
  vramMB?: number;
  backendPriority: number;
}

export interface AutoModelConfig {
  modelId: string;
  modelPath: string | null;
  device: 'cpu' | 'cuda' | 'metal' | 'webgpu';
  gpuLayers: number;
  threads: number;
  contextSize: number;
  deviceMemoryMB: number;
  backendPriority: HardwareDevice[];
  batchSize: number;
  platform: PlatformType;
  isMobile: boolean;
  isTV: boolean;
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
    const output = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader', { encoding: 'utf-8', stdio: 'pipe', timeout: 10000 });
    for (const line of output.trim().split('\n')) {
      try {
        const parts = line.split(',');
        if (parts.length >= 2) {
          const name = parts[0].trim();
          const vramMatch = parts[1].trim().match(/(\d+)/);
          const vramMB = vramMatch ? parseInt(vramMatch[1]) : 4096;
          devices.push({ type: 'cuda', name, vramMB, backendPriority: 1 });
        }
      } catch { /* skip bad line */ }
    }
  } catch { /* nvidia-smi not found */ }
  return devices;
}

function detectWebGPUDevices(): HardwareDevice[] {
  if (typeof navigator !== 'undefined' && 'gpu' in navigator && navigator.gpu) {
    return [{ type: 'webgpu', name: 'WebGPU', backendPriority: 4 }];
  }
  return [];
}

function detectMobileTVHardware(): { platform: PlatformType; cpuCores: number; totalRamMB: number; freeRamMB: number; isMobile: boolean; isTV: boolean } {
  const isNode = typeof process !== 'undefined' && process.versions?.node;
  if (isNode) {
    const cpuCores = cpus().length;
    const totalRamMB = Math.floor(totalmem() / (1024 * 1024));
    const freeRamMB = Math.floor(freemem() / (1024 * 1024));
    return { platform: 'desktop', cpuCores, totalRamMB, freeRamMB, isMobile: false, isTV: false };
  }
  const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
  const isMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isTV = /TV|Web0S|Tizen|SmartTV|AFT/i.test(ua) || typeof (globalThis as any).tizen !== 'undefined';
  const cpuCores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : 4;
  const deviceMemory = (typeof navigator !== 'undefined' && (navigator as any).deviceMemory) ? (navigator as any).deviceMemory * 1024 : 2048;
  if (isTV) return { platform: 'tv', cpuCores, totalRamMB: deviceMemory, freeRamMB: Math.floor(deviceMemory * 0.5), isMobile: false, isTV: true };
  if (isMobile) return { platform: 'mobile', cpuCores, totalRamMB: deviceMemory, freeRamMB: Math.floor(deviceMemory * 0.4), isMobile: true, isTV: false };
  return { platform: 'desktop', cpuCores, totalRamMB: deviceMemory, freeRamMB: Math.floor(deviceMemory * 0.6), isMobile: false, isTV: false };
}

function detectDesktopHW(): { cpuCores: number; freeRamMB: number; totalRamMB: number; freeDiskMB: number; devices: HardwareDevice[] } {
  const cpuCores = cpus().length;
  const totalRamMB = Math.floor(totalmem() / (1024 * 1024));
  const freeRamMB = Math.floor(freemem() / (1024 * 1024));
  const devices: HardwareDevice[] = [];
  let freeDiskMB = 0;
  try {
    if (process.platform === 'win32') {
      const df = execSync('wmic logicaldisk get size,freesize,caption', { encoding: 'utf-8', timeout: 3000 });
      for (const line of df.trim().split('\n').slice(1)) {
        const m = line.match(/(\w):\s+(\d+)\s+(\d+)/);
        if (m) {
          const free = Math.floor(parseInt(m[3]) / (1024 * 1024));
          if (free > freeDiskMB) freeDiskMB = free;
        }
      }
    } else {
      const df = execSync('df -k /', { encoding: 'utf-8', timeout: 3000 });
      const lines = df.trim().split('\n');
      if (lines.length > 1) {
        const parts = lines[1].split(/\s+/);
        freeDiskMB = Math.floor(parseInt(parts[3]) / 1024);
      }
    }
  } catch { freeDiskMB = 50000; }
  const cudaDevices = detectCUDADevices();
  devices.push(...cudaDevices);
  devices.push({ type: 'cpu', name: `${cpuCores}-core CPU`, backendPriority: 99 });
  return { cpuCores, freeRamMB, totalRamMB, freeDiskMB, devices };
}

function isAppleSilicon(): boolean {
  return process.arch === 'arm64' && process.platform === 'darwin';
}

function detectAppleDevices(_totalRamMB?: number): HardwareDevice[] {
  if (!isAppleSilicon()) return [];
  const devices: HardwareDevice[] = [];
  try {
    const sysctl = execSync('sysctl -n hw.memsize', { encoding: 'utf-8', timeout: 3000 });
    const totalBytes = parseInt(sysctl.trim());
    const totalGB = Math.floor(totalBytes / (1024 * 1024 * 1024));
    devices.push({ type: 'metal', name: `Apple Silicon ${totalGB}GB Unified`, backendPriority: 2 });
    devices.push({ type: 'coreml', name: 'Apple Neural Engine', backendPriority: 3 });
  } catch {
    devices.push({ type: 'metal', name: 'Apple Silicon', backendPriority: 2 });
  }
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
  for (const p of altPaths) { if (existsSync(p)) return p; }
  return null;
}

export class AutoConfig {
  static async downloadModel(modelId: string): Promise<string | null> {
    const entry = MODEL_CATALOG.find(m => m.modelId === modelId);
    if (!entry) return null;
    const modelsDir = resolve(process.cwd(), 'models');
    mkdirSync(modelsDir, { recursive: true });
    
    const compressedModelPath = resolve(modelsDir, `${entry.hfFile}.zip`);
    const modelPath = resolve(modelsDir, entry.hfFile);
    
    if (existsSync(compressedModelPath)) {
      console.log(`Found compressed model ${entry.hfFile}.zip, decompressing...`);
      await AutoConfig.decompressModel(compressedModelPath, modelPath);
      return modelPath;
    }
    
    if (existsSync(modelPath)) return modelPath;
    
    const url = `https://huggingface.co/${entry.hfRepo}/resolve/main/${entry.hfFile}`;
    console.log(`Downloading ${entry.hfFile} (${entry.hfRepo})...`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      const total = parseInt(response.headers.get('content-length') || '0', 10);
      let downloaded = 0;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        downloaded += value.length;
        if (total > 0) {
          const pct = ((downloaded / total) * 100).toFixed(1);
          process.stdout.write(`\rDownloading... ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)}MB)`);
        }
      }
      
      process.stdout.write('\n');
      const modelData = this.concatChunks(chunks);
      
      await new Promise<void>((res, rej) => {
        const writer = createWriteStream(modelPath);
        writer.write(Buffer.from(modelData));
        writer.end((err: Error | null) => err ? rej(err) : res());
      });
      
      if (total > 50 * 1024 * 1024) {
        console.log(`Compressing model for storage (${(total / 1024 / 1024).toFixed(1)}MB → ~${(total * 0.33 / 1024 / 1024).toFixed(1)}MB expected)...`);
        await AutoConfig.compressModel(modelPath, compressedModelPath);
      }
      
      return modelPath;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  
  private static concatChunks(chunks: Uint8Array[]): Uint8Array {
    let totalLength = 0;
    for (const chunk of chunks) totalLength += chunk.length;
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
  
  private static async compressModel(inputPath: string, outputPath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const readStream = createReadStream(inputPath);
      const writeStream = createWriteStream(outputPath);
      const gzip = createGzip();

      readStream
        .pipe(gzip)
        .pipe(writeStream)
        .on('finish', resolve)
        .on('error', reject);
    });
  }

  private static async decompressModel(inputPath: string, outputPath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const readStream = createReadStream(inputPath);
      const writeStream = createWriteStream(outputPath);
      const gunzip = createGunzip();

      readStream
        .pipe(gunzip)
        .pipe(writeStream)
        .on('finish', resolve)
        .on('error', reject);
    });
  }

  static async autoDetectAndConfigure(): Promise<AutoModelConfig> {
    const host = detectMobileTVHardware();
    const isNode = typeof process !== 'undefined' && process.versions?.node;
    let hw: { cpuCores: number; freeRamMB: number; totalRamMB: number; freeDiskMB: number; devices: HardwareDevice[] };
    let appleDevices: HardwareDevice[] = [];

    if (host.platform === 'desktop' && isNode) {
      hw = detectDesktopHW();
      appleDevices = detectAppleDevices();
    } else {
      hw = {
        cpuCores: host.cpuCores,
        freeRamMB: host.freeRamMB,
        totalRamMB: host.totalRamMB,
        freeDiskMB: host.isTV ? 4000 : host.isMobile ? 8000 : 50000,
        devices: host.isTV ? detectWebGPUDevices() : [],
      };
      const detected = detectAppleDevices();
      if (detected.length > 0) appleDevices = detected;
    }

    const allDevices = [...hw.devices, ...appleDevices].sort((a, b) => a.backendPriority - b.backendPriority);
    const cudaDevice = allDevices.find(d => d.type === 'cuda');
    const metalDevice = allDevices.find(d => d.type === 'metal');
    const webgpuDevice = allDevices.find(d => d.type === 'webgpu');
    const vramMB = cudaDevice?.vramMB ?? (metalDevice ? Math.floor(hw.totalRamMB * 0.75) : (host.isTV ? 2048 : 0));
    const deviceType: 'cuda' | 'metal' | 'webgpu' | 'cpu' = cudaDevice ? 'cuda' : metalDevice ? 'metal' : webgpuDevice ? 'webgpu' : 'cpu';
    const deviceMemoryMB = vramMB || hw.freeRamMB || 2048;
    const catalogEntry = MODEL_CATALOG.slice().reverse().find(m => m.minVRAM <= deviceMemoryMB / 1024) || MODEL_CATALOG[0];
    const modelId = catalogEntry.modelId;
    const modelPath = host.platform === 'desktop' && isNode ? findModelFile(modelId) : null;
    const modelLayers = catalogEntry.layers;
    let gpuLayers = 0;
    const vramGB = deviceMemoryMB / 1024;
    const contextSize = vramGB < 6 ? 2048 : 4096;
    const batchSize = vramGB < 6 ? 128 : vramGB < 12 ? 256 : 512;

    if (deviceType === 'cuda' && cudaDevice) {
      const ramForGPU = cudaDevice.vramMB || 4096;
      const kvCacheMB = modelLayers * contextSize * 0.009;
      const scratchMB = 256;
      const overheadMB = 256;
      const cudaRuntimeMB = 512;
      const totalReserved = kvCacheMB + scratchMB + overheadMB + cudaRuntimeMB;
      const availableForLayers = Math.max(0, ramForGPU - totalReserved);
      if (modelLayers === 0 || !isFinite(availableForLayers)) { gpuLayers = 0; } else {
        const safetyFactor = 0.75;
        const bytesPerParam = 0.5 * 1.15;
        const modelWeightMB = (catalogEntry.paramsB || 0) * 1024 * bytesPerParam;
        const perLayerMB = modelWeightMB / modelLayers;
        gpuLayers = Math.min(modelLayers, Math.max(0, Math.floor(availableForLayers * safetyFactor / perLayerMB)));
      }
    } else if (deviceType === 'metal') {
      if (modelLayers === 0) {
        gpuLayers = 0;
      } else {
        gpuLayers = Math.max(0, Math.min(modelLayers, Math.floor((hw.freeRamMB - 4096) / ((catalogEntry.paramsB * 1024 * 0.575) / modelLayers))));
      }
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
      platform: host.platform,
      isMobile: host.isMobile,
      isTV: host.isTV,
    };
  }
}

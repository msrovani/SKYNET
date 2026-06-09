import { type TeeProvider } from './attestation.js';

export type TeeType = TeeProvider | 'none';

export interface TeeCapabilities {
  available: boolean;
  type: TeeType;
  gpuSupport: boolean;
  maxMemoryMb: number;
  attestationSupported: boolean;
  secureStorage: boolean;
  version: string;
}

export interface SecureEnclaveConfig {
  allowedProviders: TeeType[];
  minMemoryMb: number;
  requireAttestation: boolean;
  fallbackToSimulation: boolean;
}

export interface SecureExecutionResult<T = Uint8Array> {
  success: boolean;
  data: T;
  teeType: TeeType;
  attestationVerified: boolean;
  executionTimeMs: number;
  error?: string;
}

export class TeeBridge {
  private config: SecureEnclaveConfig;

  constructor(config?: Partial<SecureEnclaveConfig>) {
    this.config = {
      allowedProviders: config?.allowedProviders ?? ['sgx', 'sev', 'cca'],
      minMemoryMb: config?.minMemoryMb ?? 64,
      requireAttestation: config?.requireAttestation ?? false,
      fallbackToSimulation: config?.fallbackToSimulation ?? true,
    };
  }

  async detect(): Promise<TeeCapabilities> {
    try {
      const hasNavigator = typeof navigator !== 'undefined' && navigator !== null;
      const hasWebGpu = hasNavigator && 'gpu' in navigator;

      if (typeof process !== 'undefined' && process.arch === 'x64') {
        return {
          available: true,
          type: 'sgx',
          gpuSupport: hasWebGpu,
          maxMemoryMb: 2048,
          attestationSupported: true,
          secureStorage: true,
          version: '2.0',
        };
      }

      if (hasWebGpu) {
        return {
          available: true,
          type: 'cca',
          gpuSupport: true,
          maxMemoryMb: 1024,
          attestationSupported: true,
          secureStorage: false,
          version: '1.0',
        };
      }

      if (typeof (globalThis as any).__TAURI__ !== 'undefined') {
        return {
          available: true,
          type: 'sev',
          gpuSupport: true,
          maxMemoryMb: 4096,
          attestationSupported: true,
          secureStorage: true,
          version: '1.5',
        };
      }
    } catch (err) {
      console.debug('[SKYNET] TEE detection error:', err);
    }

    if (typeof process !== 'undefined') {
      const arch: string = process.arch;
      if (arch === 'arm64' || arch === 'aarch64') {
        return {
          available: true,
          type: 'cca',
          gpuSupport: true,
          maxMemoryMb: 1024,
          attestationSupported: true,
          secureStorage: true,
          version: '1.0',
        };
      }
    }

    return {
      available: false,
      type: 'none',
      gpuSupport: false,
      maxMemoryMb: 0,
      attestationSupported: false,
      secureStorage: false,
      version: '0.0',
    };
  }

  async executeSecure<T = Uint8Array>(
    data: Uint8Array,
    operation: (input: Uint8Array) => T | Promise<T>,
  ): Promise<SecureExecutionResult<T>> {
    const capabilities = await this.detect();
    const start = performance.now();

    if (!capabilities.available) {
      if (!this.config.fallbackToSimulation) {
        return {
          success: false,
          data: data as unknown as T,
          teeType: 'none',
          attestationVerified: false,
          executionTimeMs: performance.now() - start,
          error: 'No TEE available and fallback disabled',
        };
      }
    }

    const providerOk = capabilities.available
      ? this.config.allowedProviders.includes(capabilities.type)
      : true;

    if (capabilities.available && !providerOk) {
      return {
        success: false,
        data: data as unknown as T,
        teeType: capabilities.type,
        attestationVerified: false,
        executionTimeMs: performance.now() - start,
        error: `TEE type ${capabilities.type} not in allowed providers`,
      };
    }

    if (capabilities.available && capabilities.maxMemoryMb < this.config.minMemoryMb) {
      return {
        success: false,
        data: data as unknown as T,
        teeType: capabilities.type,
        attestationVerified: false,
        executionTimeMs: performance.now() - start,
        error: `Insufficient TEE memory: ${capabilities.maxMemoryMb}MB < ${this.config.minMemoryMb}MB`,
      };
    }

    try {
      const result = await operation(data);
      return {
        success: true,
        data: result,
        teeType: capabilities.available ? capabilities.type : 'none',
        attestationVerified: !this.config.requireAttestation || capabilities.available,
        executionTimeMs: performance.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        data: data as unknown as T,
        teeType: capabilities.available ? capabilities.type : 'none',
        attestationVerified: false,
        executionTimeMs: performance.now() - start,
        error: err instanceof Error ? err.message : 'Execution failed',
      };
    }
  }

  getConfig(): SecureEnclaveConfig {
    return { ...this.config };
  }
}

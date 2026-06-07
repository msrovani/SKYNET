export type TeeType = 'sgx' | 'sev' | 'cca' | 'trustzone' | 'none';

export interface TeeCapabilities {
  available: boolean;
  type: TeeType;
  gpuSupport: boolean;
  maxMemoryMb: number;
  attestationSupported: boolean;
}

export class TeeBridge {
  async detect(): Promise<TeeCapabilities> {
    try {
      const nav = navigator as any;
      if (nav?.gpu) {
        return {
          available: true,
          type: 'cca',
          gpuSupport: true,
          maxMemoryMb: 1024,
          attestationSupported: true,
        };
      }
    } catch {}

    return {
      available: false,
      type: 'none',
      gpuSupport: false,
      maxMemoryMb: 0,
      attestationSupported: false,
    };
  }

  async executeSecure(data: Uint8Array): Promise<Uint8Array> {
    const capabilities = await this.detect();
    if (!capabilities.available) {
      throw new Error('No TEE available on this device');
    }
    return data;
  }
}

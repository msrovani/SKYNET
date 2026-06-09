export type CcaRealmState = 'active' | 'transitioning' | 'destroyed' | 'unknown';

export interface CcaConfig {
  simulate: boolean;
  realmId?: string;
  verifyUrl?: string;
  minMeasurementHashLength: number;
}

export interface CcaRealmInfo {
  realmId: string;
  state: CcaRealmState;
  measurementHash: string;
  runtimeVersion: string;
  platformId: string;
  flags: string[];
  maxMemoryMb: number;
}

export interface CcaAttestationReport {
  provider: 'cca';
  timestamp: number;
  nonce: string;
  realmId: string;
  measurementHash: string;
  platformEvidence: {
    platformId: string;
    runtimeVersion: string;
    platformToken: string;
    realmFlags: string[];
  };
  userDataHash: string;
  signatures: string[];
  verified: boolean;
  simulated: boolean;
}

export interface CcaVerificationResult {
  verified: boolean;
  timestamp: number;
  reportHash: string;
  trusted: boolean;
  realmId: string;
  reason?: string;
}

function generateRealmId(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateNonce(length: number): string {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function computeHash(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function isCcaAvailable(): boolean {
  if (typeof navigator === 'undefined' && typeof process !== 'undefined') {
    const arch: string = process.arch;
    return arch === 'arm64' || arch === 'aarch64';
  }
  if (typeof navigator !== 'undefined') {
    const hasWebGpu = 'gpu' in navigator;
    const isArm = (navigator as any).deviceMemory ? (navigator as any).deviceMemory <= 8 : false;
    return hasWebGpu && isArm;
  }
  return false;
}

export class CcaAttestation {
  private config: Required<CcaConfig>;
  private realmInfo: CcaRealmInfo | null = null;

  constructor(config: Partial<CcaConfig> = {}) {
    this.config = {
      simulate: config.simulate ?? true,
      realmId: config.realmId ?? generateRealmId(),
      verifyUrl: config.verifyUrl ?? 'https://verify.skynet.network',
      minMeasurementHashLength: config.minMeasurementHashLength ?? 32,
    };
  }

  async initialize(): Promise<CcaRealmInfo> {
    this.realmInfo = {
      realmId: this.config.realmId!,
      state: 'active',
      measurementHash: generateNonce(this.config.minMeasurementHashLength * 2),
      runtimeVersion: 'cca-realm-1.0',
      platformId: `arm-cca-${isCcaAvailable() ? 'hw' : 'sim'}`,
      flags: ['confidential_compute', 'attestable'],
      maxMemoryMb: 1024,
    };
    return this.realmInfo;
  }

  async attest(data: Uint8Array, userData?: Uint8Array): Promise<CcaAttestationReport> {
    if (!this.realmInfo) await this.initialize();

    const nonce = generateNonce(32);
    const measurementHash = await computeHash(data);
    const userDataHash = userData ? await computeHash(userData) : '';

    const report: CcaAttestationReport = {
      provider: 'cca',
      timestamp: Date.now(),
      nonce,
      realmId: this.realmInfo!.realmId,
      measurementHash,
      platformEvidence: {
        platformId: this.realmInfo!.platformId,
        runtimeVersion: this.realmInfo!.runtimeVersion,
        platformToken: nonce.slice(0, 16),
        realmFlags: this.realmInfo!.flags,
      },
      userDataHash,
      signatures: [],
      verified: false,
      simulated: this.config.simulate,
    };

    if (!this.config.simulate) {
      report.signatures = [`cca_sig_${generateNonce(8)}`];
    }

    return report;
  }

  async verifyReport(report: CcaAttestationReport): Promise<CcaVerificationResult> {
    const reportData = new TextEncoder().encode(JSON.stringify(report));
    const reportHash = await computeHash(reportData);

    if (report.simulated) {
      const valid = report.measurementHash.length >= this.config.minMeasurementHashLength * 2
        && report.nonce.length > 0
        && report.realmId.length > 0;
      return {
        verified: valid,
        timestamp: Date.now(),
        reportHash,
        trusted: valid,
        realmId: report.realmId,
      };
    }

    try {
      const response = await fetch(`${this.config.verifyUrl}/cca/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
      if (!response.ok) {
        return { verified: false, timestamp: Date.now(), reportHash, trusted: false, realmId: report.realmId, reason: `HTTP ${response.status}` };
      }
      const result = await response.json();
      return { verified: result.verified === true, timestamp: Date.now(), reportHash, trusted: result.verified === true, realmId: report.realmId, reason: result.reason };
    } catch {
      return { verified: false, timestamp: Date.now(), reportHash, trusted: false, realmId: report.realmId, reason: 'CCA verification service unreachable' };
    }
  }

  async getRealmInfo(): Promise<CcaRealmInfo | null> {
    return this.realmInfo;
  }

  async destroyRealm(): Promise<void> {
    if (this.realmInfo) {
      this.realmInfo.state = 'destroyed';
    }
    this.realmInfo = null;
  }

  async transitionRealm(newState: CcaRealmState): Promise<CcaRealmInfo> {
    if (!this.realmInfo) throw new Error('Realm not initialized');
    this.realmInfo.state = newState;
    return this.realmInfo;
  }
}

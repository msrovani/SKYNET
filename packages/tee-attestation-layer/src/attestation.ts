export type TeeProvider = 'sgx' | 'sev' | 'cca' | 'trustzone';

export interface AttestationConfig {
  provider?: TeeProvider;
  simulate?: boolean;
  verifyUrl?: string;
  nonceLength?: number;
}

export interface PlatformInfo {
  tcbStatus: string;
  isvEnclaveQuoteStatus: string;
  sgxCollateral?: {
    pceSvn: string;
    cpuSvn: string;
    qeVendorId: string;
  };
}

export interface AttestationReport {
  provider: TeeProvider;
  timestamp: number;
  nonce: string;
  measurement: string;
  userDataHash: string;
  signatures: string[];
  platformInfo: PlatformInfo;
  verified: boolean;
  simulated: boolean;
}

export interface AttestationVerificationResult {
  verified: boolean;
  timestamp: number;
  reportHash: string;
  trusted: boolean;
  reason?: string;
}

export class AttestationManager {
  private config: Required<AttestationConfig>;

  constructor(config: AttestationConfig = {}) {
    this.config = {
      provider: config.provider ?? 'sgx',
      simulate: config.simulate ?? true,
      verifyUrl: config.verifyUrl ?? 'https://verify.skynet.network',
      nonceLength: config.nonceLength ?? 32,
    };
  }

  async generateQuote(data: Uint8Array, userData?: Uint8Array): Promise<AttestationReport> {
    const nonce = this.generateNonce();
    const measurement = await this.computeMeasurement(data);
    const userDataHash = userData ? await this.computeMeasurement(userData) : '';

    const report: AttestationReport = {
      provider: this.config.provider,
      timestamp: Date.now(),
      nonce,
      measurement,
      userDataHash,
      signatures: [],
      platformInfo: {
        tcbStatus: 'UpToDate',
        isvEnclaveQuoteStatus: 'OK',
        sgxCollateral: {
          pceSvn: '7',
          cpuSvn: '0606060606060606',
          qeVendorId: '00000000000000000000000000000000',
        },
      },
      verified: false,
      simulated: this.config.simulate,
    };

    if (!this.config.simulate) {
      report.signatures = await this.generateHardwareSignature(report);
    }

    return report;
  }

  async verifyReport(report: AttestationReport): Promise<AttestationVerificationResult> {
    if (report.simulated) {
      const valid = report.measurement.length === 64 && report.nonce.length > 0;
      return {
        verified: valid,
        timestamp: Date.now(),
        reportHash: await this.computeMeasurement(new TextEncoder().encode(JSON.stringify(report))),
        trusted: valid,
      };
    }

    try {
      const response = await fetch(`${this.config.verifyUrl}/attestation/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
      if (!response.ok) return { verified: false, timestamp: Date.now(), reportHash: '', trusted: false, reason: `HTTP ${response.status}` };
      const result = await response.json();
      return { verified: result.verified === true, timestamp: Date.now(), reportHash: '', trusted: result.verified === true, reason: result.reason };
    } catch {
      return { verified: false, timestamp: Date.now(), reportHash: '', trusted: false, reason: 'Verification service unreachable' };
    }
  }

  generateNonce(): string {
    const arr = new Uint8Array(this.config.nonceLength);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async computeMeasurement(data: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', data as BufferSource);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private async generateHardwareSignature(_report: AttestationReport): Promise<string[]> {
    return [`sgx_sig_${this.generateNonce().slice(0, 16)}`];
  }
}

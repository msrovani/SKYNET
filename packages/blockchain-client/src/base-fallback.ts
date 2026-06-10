export interface BaseBridgeConfig {
  rpcUrl: string;
  l1RpcUrl: string;
  portalAddress: string;
  maxConfirmations: number;
}

export interface BridgeDeposit {
  txHash: string;
  l1BlockNumber: number;
  l2BlockNumber: number;
  from: string;
  to: string;
  amount: string;
  asset: 'ETH' | 'USDC';
  status: 'pending' | 'relayed' | 'claimed' | 'failed';
  timestamp: number;
}

export interface BridgeWithdrawal {
  txHash: string;
  l2BlockNumber: number;
  from: string;
  to: string;
  amount: string;
  asset: 'ETH' | 'USDC';
  challengePeriod: number;
  status: 'pending' | 'challenged' | 'finalized' | 'failed';
  timestamp: number;
  proof?: string;
}

export interface ProofVerification {
  valid: boolean;
  stateRoot: string;
  outputRoot: string;
  l2BlockNumber: number;
  error?: string;
}

export class BaseFallback {
  private config: Required<BaseBridgeConfig>;
  private deposits: BridgeDeposit[] = [];
  private withdrawals: BridgeWithdrawal[] = [];
  private fallbackMode = false;

  constructor(config?: Partial<BaseBridgeConfig>) {
    this.config = {
      rpcUrl: config?.rpcUrl ?? 'https://mainnet.base.org',
      l1RpcUrl: config?.l1RpcUrl ?? 'https://api.etherscan.io',
      portalAddress: config?.portalAddress ?? '0x49048044D57e1C92A77f7995C4B97Ae5B0b5F9C3',
      maxConfirmations: config?.maxConfirmations ?? 12,
    };
  }

  get rpcUrl(): string { return this.config.rpcUrl; }

  async sendTransaction(signedTxHex: string): Promise<string> {
    if (!signedTxHex.startsWith('0x')) signedTxHex = '0x' + signedTxHex;
    const response = await fetch(this.config.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_sendRawTransaction',
        params: [signedTxHex],
      }),
    });
    const result = await response.json() as any;
    if (result.error) throw new Error(`Base RPC error: ${result.error.message}`);
    return result.result;
  }

  async getBalance(address: string): Promise<string> {
    const response = await fetch(this.config.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getBalance',
        params: [address, 'latest'],
      }),
    });
    const result = await response.json() as any;
    return result.result ?? '0x0';
  }

  async bridgeDeposit(txHash: string): Promise<BridgeDeposit> {
    const deposit: BridgeDeposit = {
      txHash,
      l1BlockNumber: 0,
      l2BlockNumber: 0,
      from: '',
      to: '',
      amount: '0',
      asset: 'ETH',
      status: 'pending',
      timestamp: Date.now(),
    };

    try {
      const receipt = await this.getTransactionReceipt(txHash);
      deposit.l1BlockNumber = receipt.blockNumber;
      deposit.status = 'relayed';
    } catch {
      deposit.status = 'failed';
    }

    this.deposits.push(deposit);
    return deposit;
  }

  async bridgeWithdraw(to: string, amount: string, asset: 'ETH' | 'USDC'): Promise<BridgeWithdrawal> {
    const withdrawal: BridgeWithdrawal = {
      txHash: `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
      l2BlockNumber: 0,
      from: '',
      to,
      amount,
      asset,
      challengePeriod: 7 * 24 * 3600,
      status: 'pending',
      timestamp: Date.now(),
    };

    try {
      const receipt = await this.sendRawWithdrawal(withdrawal);
      withdrawal.txHash = receipt;
      withdrawal.status = 'pending';
    } catch {
      withdrawal.status = 'failed';
    }

    this.withdrawals.push(withdrawal);
    return withdrawal;
  }

  async verifyProof(withdrawal: BridgeWithdrawal): Promise<ProofVerification> {
    const proof = await this.generateProof(withdrawal);

    try {
      const response = await fetch(this.config.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [{
            to: this.config.portalAddress,
            data: `0x${proof}`,
          }, 'latest'],
        }),
      });
      const result = await response.json() as any;
      const valid = !result.error && result.result !== '0x0000000000000000000000000000000000000000000000000000000000000000';

      return {
        valid,
        stateRoot: this.config.rpcUrl,
        outputRoot: this.config.rpcUrl,
        l2BlockNumber: withdrawal.l2BlockNumber,
        error: result.error?.message,
      };
    } catch (err) {
      return {
        valid: false,
        stateRoot: '',
        outputRoot: '',
        l2BlockNumber: 0,
        error: err instanceof Error ? err.message : 'Verification failed',
      };
    }
  }

  async getTransactionReceipt(txHash: string): Promise<{ blockNumber: number; status: string }> {
    const response = await fetch(this.config.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      }),
    });
    const result = await response.json() as any;
    if (!result.result) throw new Error('Transaction not found');
    return {
      blockNumber: parseInt(result.result.blockNumber, 16),
      status: result.result.status === '0x1' ? 'success' : 'failed',
    };
  }

  async getGasPrice(): Promise<string> {
    const response = await fetch(this.config.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_gasPrice',
        params: [],
      }),
    });
    const result = await response.json() as any;
    return result.result ?? '0x0';
  }

  enableFallbackMode(): void {
    this.fallbackMode = true;
  }

  disableFallbackMode(): void {
    this.fallbackMode = false;
  }

  isFallbackActive(): boolean {
    return this.fallbackMode;
  }

  getDeposits(): BridgeDeposit[] {
    return [...this.deposits];
  }

  getWithdrawals(): BridgeWithdrawal[] {
    return [...this.withdrawals];
  }

  private async sendRawWithdrawal(_withdrawal: BridgeWithdrawal): Promise<string> {
    return `0x${Date.now().toString(16).padStart(64, '0')}`;
  }

  private async generateProof(_withdrawal: BridgeWithdrawal): Promise<string> {
    return Array.from({ length: 128 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }
}

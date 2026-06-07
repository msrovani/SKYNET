export class BaseFallback {
  private rpcUrl: string;

  constructor(rpcUrl = 'https://mainnet.base.org') {
    this.rpcUrl = rpcUrl;
  }

  async sendTransaction(tx: any): Promise<string> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_sendRawTransaction',
        params: [tx],
      }),
    });
    const result = await response.json();
    return result.result;
  }
}

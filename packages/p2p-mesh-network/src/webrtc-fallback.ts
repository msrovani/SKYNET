export class WebRTCFallback {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private config: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      {
        urls: 'turn:turn.skynet.network:3478',
        username: '',
        credential: '',
      },
    ],
  };

  async connect(): Promise<void> {
    this.pc = new RTCPeerConnection(this.config);
    this.dataChannel = this.pc.createDataChannel('skynet-mesh', {
      ordered: false,
      maxRetransmits: 3,
    });

    return new Promise((resolve, reject) => {
      if (!this.dataChannel) return reject(new Error('DataChannel creation failed'));

      this.dataChannel.onopen = () => resolve();
      this.dataChannel.onerror = (err) => reject(err);
    });
  }

  send(data: Uint8Array): void {
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(data.buffer as ArrayBuffer);
    }
  }

  onMessage(handler: (data: Uint8Array) => void): void {
    if (this.dataChannel) {
      this.dataChannel.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          handler(new Uint8Array(event.data));
        }
      };
    }
  }

  disconnect(): void {
    this.dataChannel?.close();
    this.pc?.close();
    this.dataChannel = null;
    this.pc = null;
  }
}

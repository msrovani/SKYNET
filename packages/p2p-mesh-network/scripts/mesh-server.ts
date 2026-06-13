import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

if (!Promise.withResolvers) {
  Promise.withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  } as any;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

const peers = new Map<string, { writer: any }>();
let messageCount = 0;
let shuttingDown = false;

process.on('SIGINT', () => {
  if (shuttingDown) return;
  shuttingDown = true;
  const count = messageCount;
  console.log(`[MESH-STATS] messages_broadcast: ${count}`);
  process.exit(0);
});

async function main(): Promise<void> {
  const certPath = join(__dirname, '..', '.certs', 'cert.pem');
  const keyPath = join(__dirname, '..', '.certs', 'key.pem');
  const cert = readFileSync(certPath);
  const key = readFileSync(keyPath);

  const { Server } = await import('@moq/web-transport');
  const server = Server.bind('[::]:4443', cert, key);
  console.log('[SKYNET] Mesh server listening on [::]:4443');

  while (true) {
    const request = await server.accept();
    if (!request) break;
    const url = await request.url;
    const session = await request.ok();
    console.log(`[SKYNET] Session accepted: ${url}`);
    handleSession(session).catch((err: Error) => {
      console.error(`[SKYNET] Session error: ${err.message}`);
    });
  }
}

async function handleSession(session: any): Promise<void> {
  const reader = session.incomingBidirectionalStreams.getReader();

  while (true) {
    const { done, value: stream } = await reader.read();
    if (done) break;
    handleStream(stream).catch((err: Error) => {
      console.error(`[SKYNET] Stream error: ${err.message}`);
    });
  }
}

async function handleStream(stream: any): Promise<void> {
  const readable = stream.readable.getReader();
  const writable = stream.writable.getWriter();

  let peerId: string | null = null;

  try {
    while (true) {
      const { done, value } = await readable.read();
      if (done) {
        if (peerId) {
          peers.delete(peerId);
          console.log(`[SKYNET] Peer disconnected: ${peerId} (${peers.size} peers remaining)`);
        }
        await writable.close();
        break;
      }

      const text = new TextDecoder().decode(value);

      if (text.startsWith('init:')) {
        peerId = text.slice(5);
        peers.set(peerId, { writer: writable });
        console.log(`[SKYNET] Peer registered: ${peerId} (${peers.size} peers connected)`);
        continue;
      }

      messageCount++;
      for (const [id, peer] of peers) {
        if (id !== peerId) {
          try {
            const payload = new TextEncoder().encode(`from:${peerId}:${text}`);
            await peer.writer.write(payload);
          } catch {
            // peer may have disconnected
          }
        }
      }
    }
  } catch (err) {
    if (peerId) {
      peers.delete(peerId);
      console.log(`[SKYNET] Peer disconnected (error): ${peerId} (${peers.size} peers remaining)`);
    }
  }
}

main().catch((err: Error) => {
  console.error('[SKYNET] Server error:', err);
  process.exit(1);
});

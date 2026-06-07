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

async function main(): Promise<void> {
  const certPath = join(__dirname, '..', '.certs', 'cert.pem');
  const keyPath = join(__dirname, '..', '.certs', 'key.pem');
  const cert = readFileSync(certPath);
  const key = readFileSync(keyPath);

  const { Server } = await import('@moq/web-transport');
  const server = Server.bind('[::]:4443', cert, key);
  console.log('[SKYNET] WebTransport echo server listening on [::]:4443');

  while (true) {
    const request = await server.accept();
    if (!request) break;
    const url = await request.url;
    const session = await request.ok();
    console.log(`[SKYNET] Session accepted: ${url}`);
    handleSession(session).catch(() => {});
  }
}

async function handleSession(session: any): Promise<void> {
  const reader = session.incomingBidirectionalStreams.getReader();
  while (true) {
    const { done, value: stream } = await reader.read();
    if (done) break;
    const readable = stream.readable.getReader();
    const writable = stream.writable.getWriter();
    (async () => {
      while (true) {
        const { done, value } = await readable.read();
        if (done) { await writable.close(); break; }
        console.log(`[SKYNET] Echo stream: ${value.byteLength} bytes`);
        await writable.write(value);
      }
    })();
  }
}

main().catch((err: Error) => {
  console.error('[SKYNET] Server error:', err);
  process.exit(1);
});

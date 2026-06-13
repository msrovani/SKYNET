if (!Promise.withResolvers) {
  Promise.withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  } as any;
}

const peerId = process.env.MESH_PEER_ID || 'unknown';
const serverUrl = process.env.MESH_SERVER_URL || 'https://localhost:4443';

let shuttingDown = false;

async function main(): Promise<void> {
  const { default: Session } = await import('@moq/web-transport');
  const session = new Session(serverUrl, { serverCertificateDisableVerify: true });
  console.log(`[${peerId}] Connecting to mesh server...`);

  await session.ready;
  console.log(`[${peerId}] Connected`);

  const stream = await session.createBidirectionalStream();
  const reader = stream.readable.getReader();
  const writer = stream.writable.getWriter();

  // Register with server
  const initPayload = new TextEncoder().encode(`init:${peerId}`);
  await writer.write(initPayload);
  console.log(`[${peerId}] Registered with mesh`);

  // Read loop for incoming messages
  const readLoop = (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = new TextDecoder().decode(value);
      console.log(`[${peerId}] Received: ${text}`);
    }
  })();

  // Periodic ping sender
  let pingCount = 1;
  const interval = setInterval(async () => {
    if (shuttingDown) return;
    const msg = `ping #${pingCount++}`;
    const payload = new TextEncoder().encode(msg);
    await writer.write(payload);
    console.log(`[${peerId}] Sent: ${msg}`);
  }, 3000);

  process.on('SIGINT', async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[${peerId}] Shutting down...`);
    clearInterval(interval);
    await writer.close();
    session.close({ closeCode: 0, reason: 'shutdown' });
    await session.closed;
    process.exit(0);
  });

  // Wait for SIGINT
  await new Promise(() => {});
}

main().catch((err: Error) => {
  console.error(`[${peerId}] Client error:`, err);
  process.exit(1);
});

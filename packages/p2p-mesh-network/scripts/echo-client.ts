if (!Promise.withResolvers) {
  Promise.withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  } as any;
}

async function main(): Promise<void> {
  const { default: Session } = await import('@moq/web-transport');
  const session = new Session('https://localhost:4443', { serverCertificateDisableVerify: true });
  console.log('[SKYNET] Connecting to WebTransport echo server...');

  const start = performance.now();
  await session.ready;
  const connectMs = performance.now() - start;
  console.log(`[SKYNET] Connected in ${connectMs.toFixed(1)}ms`);

  // Open bidirectional stream to echo server
  const stream = await session.createBidirectionalStream();
  const reader = stream.readable.getReader();
  const writer = stream.writable.getWriter();

  const message = new TextEncoder().encode('Hello SKYNET WebTransport!');
  console.log(`[SKYNET] Sending: "${new TextDecoder().decode(message)}" (${message.byteLength} bytes)`);

  await writer.write(message);
  await writer.close();

  const echoStart = performance.now();
  const { value: echo } = await reader.read();
  const echoMs = performance.now() - echoStart;
  const text = new TextDecoder().decode(echo);
  console.log(`[SKYNET] Echo received in ${echoMs.toFixed(1)}ms: "${text}" (${echo.byteLength} bytes)`);

  session.close({ closeCode: 0, reason: 'done' });
  await session.closed;
  console.log('[SKYNET] Done');
}

main().catch((err: Error) => {
  console.error('[SKYNET] Client error:', err);
  process.exit(1);
});

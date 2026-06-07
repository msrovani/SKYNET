import { fork } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function main(): void {
  const certDir = join(__dirname, '..', '.certs');
  if (!existsSync(join(certDir, 'cert.pem'))) {
    console.log('[SKYNET] Run pnpm example:setup first');
    process.exit(1);
  }

  console.log('[SKYNET] Starting WebTransport echo server...');
  const server = fork(join(__dirname, 'echo-server.ts'), [], { stdio: 'pipe', execArgv: ['--import', 'tsx/esm'] });

  server.stdout?.on('data', (d: Buffer) => process.stdout.write(d));
  server.stderr?.on('data', (d: Buffer) => process.stderr.write(d));
  server.on('error', (e: Error) => { console.error('Server:', e.message); process.exit(1); });

  setTimeout(() => {
    console.log('[SKYNET] Starting WebTransport echo client...');
    const client = fork(join(__dirname, 'echo-client.ts'), [], { stdio: 'pipe', execArgv: ['--import', 'tsx/esm'] });

    client.stdout?.on('data', (d: Buffer) => process.stdout.write(d));
    client.stderr?.on('data', (d: Buffer) => process.stderr.write(d));
    client.on('error', (e: Error) => { console.error('Client:', e.message); process.exit(1); });

    client.on('close', () => { server.kill(); setTimeout(() => process.exit(0), 200); });
  }, 1500);
}

main();

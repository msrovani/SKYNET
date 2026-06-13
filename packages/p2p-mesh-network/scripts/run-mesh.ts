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

  const clients: { process: ReturnType<typeof fork>; id: string }[] = [];
  const pidMap = new Map<number, string>();
  let serverPid: number | null = null;
  let statsMessageCount = 0;

  console.log('[SKYNET] Starting mesh server...');
  const server = fork(join(__dirname, 'mesh-server.ts'), [], { stdio: 'pipe', execArgv: ['--import', 'tsx/esm'] });
  serverPid = server.pid ?? null;

  server.stdout?.on('data', (d: Buffer) => {
    const text = d.toString();
    process.stdout.write(text);
    // Parse stats from server shutdown
    const match = text.match(/\[MESH-STATS\] messages_broadcast: (\d+)/);
    if (match) statsMessageCount = parseInt(match[1], 10);
  });
  server.stderr?.on('data', (d: Buffer) => process.stderr.write(d));
  server.on('error', (e: Error) => { console.error('Server:', e.message); process.exit(1); });

  setTimeout(() => {
    const clientIds = ['client-1', 'client-2', 'client-3'];
    for (const id of clientIds) {
      console.log(`[SKYNET] Starting ${id}...`);
      const client = fork(join(__dirname, 'mesh-client.ts'), [], {
        stdio: 'pipe',
        env: { ...process.env, MESH_PEER_ID: id },
        execArgv: ['--import', 'tsx/esm'],
      });
      pidMap.set(client.pid!, id);
      client.stdout?.on('data', (d: Buffer) => process.stdout.write(d));
      client.stderr?.on('data', (d: Buffer) => process.stderr.write(d));
      client.on('error', (e: Error) => { console.error(`${id}:`, e.message); });
      clients.push({ process: client, id });
    }
  }, 1000);

  setTimeout(() => {
    console.log('[SKYNET] Mesh test period complete, shutting down...');

    // Kill clients first, then server
    for (const { process: client, id } of clients) {
      if (!client.killed) {
        client.kill('SIGINT');
      }
    }

    setTimeout(() => {
      if (serverPid && !server.killed) {
        server.kill('SIGINT');
      }

      setTimeout(() => {
        for (const { process: client, id } of clients) {
          if (!client.killed) client.kill('SIGKILL');
        }
        if (serverPid && !server.killed) server.kill('SIGKILL');

        const expectedPings = Math.floor(14 / 3) * 3 * 2; // 14s of ping * 3 clients * 2 recipients each
        console.log(`[SKYNET] MESH TEST COMPLETE`);
        console.log(`[SKYNET] Server broadcast count: ${statsMessageCount}`);
        console.log(`[SKYNET] Expected pings: ~${expectedPings} broadcasts`);

        setTimeout(() => process.exit(0), 200);
      }, 500);
    }, 500);
  }, 16000);
}

main();

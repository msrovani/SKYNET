import { fork } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface DSDMetrics {
  nodeId: string;
  status: 'starting' | 'ready' | 'inferencing' | 'error';
  acceptanceRate: number;
  draftTokens: number;
  verifiedTokens: number;
  latencyMs: number;
  tokensPerSecond: number;
  backend: string;
  startTime: number;
}

const metrics: Map<string, DSDMetrics> = new Map();
const DRAPT_MODEL = 'phi-3-mini-4k-instruct-q4.gguf';
const TARGET_MODEL = 'llama-3.2-3b-instruct-q4.gguf';

function startMetricsServer(): number {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const snapshot = Array.from(metrics.values()).map(m => ({
      ...m,
      uptime: Date.now() - m.startTime
    }));
    res.end(JSON.stringify({ nodes: snapshot, timestamp: Date.now() }));
  });
  server.listen(0, '127.0.0.1');
  const addr = server.address();
  return typeof addr === 'object' && addr ? addr.port : 9090;
}

function updateMetrics(nodeId: string, partial: Partial<DSDMetrics>): void {
  const existing = metrics.get(nodeId) || {
    nodeId, status: 'starting', acceptanceRate: 0,
    draftTokens: 0, verifiedTokens: 0, latencyMs: 0,
    tokensPerSecond: 0, backend: 'mock', startTime: Date.now()
  };
  metrics.set(nodeId, { ...existing, ...partial });
}

function main(): void {
  const certDir = join(__dirname, '..', '.certs');
  const certPath = join(certDir, 'cert.pem');
  if (!existsSync(certPath)) {
    console.log('[DSD-MESH] Run pnpm example:setup first to generate certs');
    process.exit(1);
  }

  const metricsPort = startMetricsServer();
  console.log(`[DSD-MESH] Metrics server on http://127.0.0.1:${metricsPort}`);

  console.log('[DSD-MESH] Starting mesh relay...');
  const relay = fork(join(__dirname, 'mesh-server.ts'), [], { stdio: 'pipe', execArgv: ['--import', 'tsx/esm'] });
  relay.stdout?.on('data', (d: Buffer) => process.stdout.write(`[RELAY] ${d}`));
  relay.stderr?.on('data', (d: Buffer) => process.stderr.write(`[RELAY-ERR] ${d}`));
  relay.on('error', (e: Error) => { console.error('[RELAY]', e.message); process.exit(1); });

  const configPath = join(__dirname, '..', '.dsd-mesh-config.json');
  const config = {
    metricsPort,
    relayUrl: 'https://localhost:4443',
    draftModel: DRAPT_MODEL,
    targetModel: TARGET_MODEL,
    nodes: [
      { id: 'drafter-1', role: 'drafter', model: DRAPT_MODEL, port: 9101 },
      { id: 'verifier-1', role: 'verifier', model: TARGET_MODEL, port: 9201 },
      { id: 'verifier-2', role: 'verifier', model: TARGET_MODEL, port: 9202 },
    ]
  };
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  const nodes: { process: ReturnType<typeof fork>; id: string; role: string }[] = [];

  setTimeout(() => {
    for (const node of config.nodes) {
      console.log(`[DSD-MESH] Starting ${node.id} (${node.role})...`);
      updateMetrics(node.id, { status: 'starting', backend: node.role === 'drafter' ? 'draft' : 'target' });
      const proc = fork(join(__dirname, '..', '..', 'inference-runtime', 'scripts', 'dsd-mesh-node.ts'), [], {
        stdio: 'pipe',
        env: {
          ...process.env,
          DSD_NODE_ID: node.id,
          DSD_ROLE: node.role,
          DSD_MODEL: node.model,
          DSD_METRICS_PORT: String(metricsPort),
          MESH_SERVER_URL: config.relayUrl,
        },
        execArgv: ['--import', 'tsx/esm'],
      });
      proc.stdout?.on('data', (d: Buffer) => process.stdout.write(`[${node.id}] ${d}`));
      proc.stderr?.on('data', (d: Buffer) => process.stderr.write(`[${node.id}-ERR] ${d}`));
      proc.on('error', (e: Error) => console.error(`[${node.id}]`, e.message));
      proc.on('exit', (code) => {
        console.log(`[DSD-MESH] ${node.id} exited with code ${code}`);
        updateMetrics(node.id, { status: 'error' });
      });
      nodes.push({ process: proc, id: node.id, role: node.role });
    }
  }, 2000);

  setTimeout(() => {
    console.log('[DSD-MESH] Deployment complete. Nodes running.');
    console.log(`[DSD-MESH] Metrics: http://127.0.0.1:${metricsPort}`);
    console.log('[DSD-MESH] Press Ctrl+C to stop all nodes');
  }, 5000);

  process.on('SIGINT', () => {
    console.log('\n[DSD-MESH] Shutting down all nodes...');
    for (const { process: proc, id } of nodes) {
      if (!proc.killed) proc.kill('SIGINT');
    }
    setTimeout(() => {
      for (const { process: proc } of nodes) {
        if (!proc.killed) proc.kill('SIGKILL');
      }
      if (!relay.killed) relay.kill('SIGINT');
      setTimeout(() => process.exit(0), 500);
    }, 2000);
  });
}

main();

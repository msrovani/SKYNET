import { AgentModel, AgentModelConfig } from '../src/agent-model.js';

if (!Promise.withResolvers) {
  Promise.withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  } as any;
}

const nodeId = process.env.DSD_NODE_ID || 'unknown';
const role = process.env.DSD_ROLE || 'verifier';
const modelId = process.env.DSD_MODEL || 'none';
const metricsPort = parseInt(process.env.DSD_METRICS_PORT || '9090', 10);

let shutdown = false;
let totalTokens = 0;
let acceptedTokens = 0;
let startTime = Date.now();

async function reportMetrics(): Promise<void> {
  const acceptanceRate = totalTokens > 0 ? acceptedTokens / totalTokens : 0;
  const uptime = (Date.now() - startTime) / 1000;
  const tps = uptime > 0 ? totalTokens / uptime : 0;

  const payload = JSON.stringify({
    nodeId,
    status: shutdown ? 'shutdown' : 'running',
    acceptanceRate: Math.round(acceptanceRate * 1000) / 1000,
    draftTokens: role === 'drafter' ? totalTokens : 0,
    verifiedTokens: role === 'verifier' ? acceptedTokens : 0,
    latencyMs: 0,
    tokensPerSecond: Math.round(tps * 100) / 100,
    backend: role,
    startTime,
    uptime: Math.round(uptime),
  });

  try {
    const res = await fetch(`http://127.0.0.1:${metricsPort}/metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    if (!res.ok) console.error(`[${nodeId}] Metrics post failed: ${res.status}`);
  } catch (err: any) {
    // metrics server may not be ready yet
  }
}

async function runInference(agent: AgentModel): Promise<void> {
  const prompt = `Explain distributed speculative decoding in AI inference`;
  console.log(`[${nodeId}] Running inference with DSD ${role === 'drafter' ? 'drafting' : 'verifying'}...`);

  const result = await agent.generateWithDSD(prompt);
  const tokens = result.inferenceResult?.tokens?.length || 0;
  totalTokens += tokens;
  if (role === 'verifier') acceptedTokens += tokens;

  console.log(`[${nodeId}] Generated ${tokens} tokens in ${Math.round(result.latencyMs)}ms`);
  console.log(`[${nodeId}] Content preview: ${result.content.slice(0, 100)}...`);
  await reportMetrics();
}

async function main(): Promise<void> {
  console.log(`[${nodeId}] Starting DSD ${role} node (model: ${modelId})`);
  await reportMetrics();

  const config: AgentModelConfig = {
    agentId: nodeId,
    modelId,
    systemPrompt: 'You are a helpful AI assistant on a distributed mesh network.',
    tools: [],
    temperature: 0.7,
    maxTokens: 256,
    autoDownload: true,
  };

  const agent = new AgentModel(config);
  await agent.load();
  console.log(`[${nodeId}] Backend: ${agent.getActiveBackend()}`);

  const interval = setInterval(async () => {
    if (shutdown) return;
    try {
      await runInference(agent);
    } catch (err: any) {
      console.error(`[${nodeId}] Inference error:`, err.message);
    }
  }, 10000);

  process.on('SIGINT', async () => {
    if (shutdown) return;
    shutdown = true;
    console.log(`[${nodeId}] Shutting down...`);
    clearInterval(interval);
    await reportMetrics();
    agent.unload();
    process.exit(0);
  });

  // Trigger first inference immediately
  setTimeout(() => runInference(agent), 2000);

  await new Promise(() => {});
}

main().catch((err: Error) => {
  console.error(`[${nodeId}] Fatal error:`, err);
  process.exit(1);
});

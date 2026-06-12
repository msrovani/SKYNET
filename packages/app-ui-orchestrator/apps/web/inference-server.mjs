import http from 'http';

const PORT = 3001;
let model = null;

async function getModel() {
  if (model) return model;
  const { AgentModel } = await import('@skynet/inference-runtime');
  const m = new AgentModel({
    agentId: 'api-agent',
    modelId: 'phi-3-mini',
    systemPrompt: 'You are a helpful AI assistant. Respond concisely and accurately in the same language as the user\'s question.',
    tools: [],
    temperature: 0.7,
    maxTokens: 2048,
    autoDownload: true,
  });
  await m.load();
  model = m;
  return m;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url !== '/infer') {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const { prompt, mode } = JSON.parse(body);
      if (!prompt) throw new Error('Prompt required');

      const m = await getModel();
      const result = await m.generate(prompt);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ content: result.content, latencyMs: result.latencyMs }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ content: `Erro: ${msg}`, latencyMs: 0 }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Inference server running on http://localhost:${PORT}`);
});

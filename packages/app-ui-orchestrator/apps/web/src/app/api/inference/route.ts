import { NextRequest, NextResponse } from 'next/server';

const INFERENCE_SERVER = 'http://localhost:3001/infer';

export async function POST(request: NextRequest) {
  const { prompt, mode } = await request.json();
  if (!prompt || typeof prompt !== 'string') {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
  }

  try {
    const res = await fetch(INFERENCE_SERVER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, mode }),
      signal: AbortSignal.timeout(120000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 500 });
  } catch (error) {
    console.error('Inference proxy error:', error);
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ content: `Erro na inferência: ${msg}`, latencyMs: 0 }, { status: 500 });
  }
}

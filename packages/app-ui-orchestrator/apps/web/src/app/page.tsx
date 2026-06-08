'use client';

import React, { useState, useCallback } from 'react';

type AiMode = 'lightning' | 'deep' | 'agent';
type AgentAutonomy = 'watch' | 'assist' | 'auto';

const MODES: { key: AiMode; icon: string; label: string; desc: string }[] = [
  { key: 'lightning', icon: '⚡', label: 'Relâmpago', desc: 'Respostas instantâneas' },
  { key: 'deep', icon: '🔬', label: 'Profundo', desc: 'Raciocínio extendido' },
  { key: 'agent', icon: '🤖', label: 'Agente', desc: 'Autónomo multi-passo' },
];

export default function Home() {
  const [mode, setMode] = useState<AiMode>('lightning');
  const [autonomy, setAutonomy] = useState<AgentAutonomy>('assist');
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [computing, setComputing] = useState(false);
  const [silentEnabled, setSilentEnabled] = useState(false);
  const [contributionHours, setContributionHours] = useState(0);
  const [agentTasks, setAgentTasks] = useState<{ id: string; desc: string; status: string }[]>([]);

  const submit = useCallback(async () => {
    if (!input.trim() || computing) return;
    setComputing(true);
    setResponse('');
    setAgentTasks([]);

    switch (mode) {
      case 'lightning':
        setResponse(`⚡ ${input.split(' ').reverse().join(' ')}`);
        break;
      case 'deep':
        for (let i = 0; i < 5; i++) {
          await new Promise(r => setTimeout(r, 150));
          setResponse(prev => prev + `token_${i} `);
        }
        break;
      case 'agent': {
        const tasks = [
          'Planear tarefa', 'Agente webdesign: gerar layout',
          'Agente content: escrever texto', 'Agregar resultados',
        ];
        setAgentTasks(tasks.map((d, i) => ({ id: String(i), desc: d, status: 'pending' })));
        for (const t of tasks) {
          await new Promise(r => setTimeout(r, 300));
          setAgentTasks(prev => prev.map(p => p.desc === t ? { ...p, status: 'executing' } : p));
          await new Promise(r => setTimeout(r, 500));
          setAgentTasks(prev => prev.map(p => p.desc === t ? { ...p, status: 'completed' } : p));
        }
        setResponse('✅ Solução completa! (simulado)');
        break;
      }
    }
    setComputing(false);
    setInput('');
  }, [input, computing, mode]);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ textAlign: 'center', marginBottom: 20 }}>
        <h1 style={{ color: '#00ff88', fontSize: 28, margin: 0 }}>SKYNET</h1>
        <p style={{ color: '#666', fontSize: 12, margin: 0 }}>DePIN — Inferência Distribuída</p>
      </header>

      <div style={{ display: 'flex', gap: 8, overflow: 'auto', marginBottom: 16 }}>
        {MODES.map(m => (
          <button key={m.key} onClick={() => setMode(m.key)}
            style={{
              flex: 1, background: mode === m.key ? '#00ff8822' : '#1a1a2e',
              border: mode === m.key ? '1px solid #00ff88' : '1px solid #333',
              borderRadius: 12, padding: 10, cursor: 'pointer', textAlign: 'center', color: '#ccc',
            }}>
            <div style={{ fontSize: 24 }}>{m.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: mode === m.key ? '#00ff88' : '#ccc' }}>{m.label}</div>
            <div style={{ fontSize: 10, color: '#666' }}>{m.desc}</div>
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }}>
        <textarea value={input} onChange={e => setInput(e.target.value)}
          placeholder={mode === 'lightning' ? 'Pergunta rápida...' : mode === 'deep' ? 'O que analisar?' : 'Qual o objetivo?'}
          style={{
            width: '100%', minHeight: mode === 'lightning' ? 48 : 80, background: '#1a1a2e',
            border: '1px solid #333', borderRadius: 10, padding: 14, color: '#fff',
            fontSize: 15, resize: 'none', boxSizing: 'border-box',
          }} disabled={computing} />
        {mode === 'agent' && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {(['👁️ Vigiar', '🤝 Assistir', '⚡ Auto'] as const).map((l, i) => {
              const val: AgentAutonomy = ['watch', 'assist', 'auto'][i] as AgentAutonomy;
              return (
                <button key={l} onClick={() => setAutonomy(val)}
                  style={{
                    flex: 1, padding: '6px 12px', borderRadius: 8,
                    background: autonomy === val ? '#00ff8822' : '#1a1a2e',
                    border: autonomy === val ? '1px solid #00ff88' : '1px solid #333',
                    cursor: 'pointer', color: autonomy === val ? '#00ff88' : '#888', fontSize: 12,
                  }}>
                  {l}
                </button>
              );
            })}
          </div>
        )}
        <button onClick={submit} disabled={computing}
          style={{
            width: '100%', marginTop: 8, padding: 14, borderRadius: 10,
            background: computing ? '#004422' : '#00ff88', border: 'none',
            color: computing ? '#888' : '#000', fontWeight: 700, fontSize: 15, cursor: computing ? 'default' : 'pointer',
          }}>
          {computing ? (mode === 'deep' ? '🔬 A analisar...' : mode === 'agent' ? '🤖 Agentes a trabalhar...' : '⚡ A processar...') : 'Enviar'}
        </button>

        {response && (
          <div style={{
            background: '#1a1a2e', borderLeft: '3px solid #00ff88', borderRadius: 10,
            padding: 14, marginTop: 12, fontSize: 14, color: '#ddd', lineHeight: 1.5,
          }}>
            {response}
          </div>
        )}

        {agentTasks.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ color: '#aaa', fontSize: 13, marginBottom: 6 }}>Progresso dos Agentes</div>
            {agentTasks.map(t => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, background: '#1a1a2e',
                borderRadius: 8, padding: 10, marginBottom: 6, fontSize: 13,
              }}>
                <span>{t.status === 'completed' ? '✅' : t.status === 'executing' ? '🔄' : '⏳'}</span>
                <span style={{ color: '#ddd' }}>{t.desc}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{
          background: '#1a1a2e', borderRadius: 12, padding: 16, marginTop: 20, fontSize: 13,
        }}>
          <div style={{ color: '#00ff88', fontWeight: 600, marginBottom: 8 }}>Estado da Rede</div>
          <div style={{ color: '#aaa', lineHeight: 1.8 }}>
            <div>🟢 Conectado · 3 peers</div>
            <div>⚡ WebTransport · 15ms</div>
            <div>🔋 85% · 🌡️ 12.5 headroom</div>
            <div>💰 $0.0023 · 0 tarefas</div>
          </div>
        </div>
      </div>

      <footer style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#1a1a2e', borderTop: '1px solid #333', margin: '20px -16px -20px',
        padding: '12px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🌙</span>
          <div>
            <div style={{ color: '#ccc', fontSize: 13, fontWeight: 600 }}>Monetização de fundo</div>
            {silentEnabled && (
              <div style={{ color: '#00ff88', fontSize: 11 }}>{contributionHours.toFixed(1)}h · {(contributionHours * 0.1).toFixed(4)} SKYNET</div>
            )}
          </div>
        </div>
        <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' }}>
          <input type="checkbox" checked={silentEnabled} onChange={() => setSilentEnabled(!silentEnabled)}
            style={{ opacity: 0, width: 0, height: 0 }} />
          <span style={{
            position: 'absolute', inset: 0, backgroundColor: silentEnabled ? '#00ff88' : '#333',
            borderRadius: 24, transition: '0.3s',
          }}>
            <span style={{
              position: 'absolute', height: 18, width: 18, left: silentEnabled ? 22 : 3, top: 3,
              backgroundColor: '#0a0a1a', borderRadius: '50%', transition: '0.3s',
            }} />
          </span>
        </label>
      </footer>

      <footer style={{ textAlign: 'center', marginTop: 8, color: '#444', fontSize: 11 }}>
        SKYNET DePIN v0.2.0 — {new Date().toLocaleDateString()}
      </footer>
    </div>
  );
}

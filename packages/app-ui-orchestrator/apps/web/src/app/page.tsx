'use client';

import React from 'react';
import { useSkynet } from '../../../../shared/hooks/useSkynet';
import { AiMode, AgentAutonomy, AI_MODE_LABELS, AI_MODE_ICONS } from '../../../../shared/types/index';

const MODES: { key: AiMode; icon: string; label: string; desc: string }[] = [
  { key: AiMode.LIGHTNING, icon: '⚡', label: 'Relâmpago', desc: 'Respostas instantâneas' },
  { key: AiMode.DEEP, icon: '🔬', label: 'Profundo', desc: 'Raciocínio extendido' },
  { key: AiMode.AGENT, icon: '🤖', label: 'Agente', desc: 'Multi-agente autónomo' },
];

const AUTONOMY_OPTIONS: { key: AgentAutonomy; label: string }[] = [
  { key: AgentAutonomy.WATCH, label: '👁️ Vigiar' },
  { key: AgentAutonomy.ASSIST, label: '🤝 Assistir' },
  { key: AgentAutonomy.AUTO, label: '⚡ Auto' },
];

export default function Home() {
  const {
    appState, meshStatus, silentConfig,
    agentTasks, response,
    setMode, setAutonomy, submitInference, toggleSilent,
  } = useSkynet();

  const [input, setInput] = React.useState('');

  const handleSubmit = () => {
    submitInference(input);
    setInput('');
  };

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ textAlign: 'center', marginBottom: 20 }}>
        <h1 style={{ color: '#00ff88', fontSize: 28, margin: 0 }}>SKYNET</h1>
        <p style={{ color: '#666', fontSize: 12, margin: 0 }}>
          DePIN — Inferência Distribuída
          {appState.isComputing && <span style={{ color: '#00ff88' }}> · A processar...</span>}
        </p>
      </header>

      <div style={{ display: 'flex', gap: 8, overflow: 'auto', marginBottom: 16 }}>
        {MODES.map(m => (
          <button key={m.key} onClick={() => setMode(m.key)}
            style={{
              flex: 1, background: appState.mode === m.key ? '#00ff8822' : '#1a1a2e',
              border: appState.mode === m.key ? '1px solid #00ff88' : '1px solid #333',
              borderRadius: 12, padding: 10, cursor: 'pointer', textAlign: 'center', color: '#ccc',
            }}>
            <div style={{ fontSize: 24 }}>{m.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: appState.mode === m.key ? '#00ff88' : '#ccc' }}>{m.label}</div>
            <div style={{ fontSize: 10, color: '#666' }}>{m.desc}</div>
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }}>
        <textarea value={input} onChange={e => setInput(e.target.value)}
          placeholder={appState.mode === 'lightning' ? 'Pergunta rápida...' : appState.mode === 'deep' ? 'O que analisar?' : 'Qual o objetivo?'}
          style={{
            width: '100%', minHeight: appState.mode === 'lightning' ? 48 : 80, background: '#1a1a2e',
            border: '1px solid #333', borderRadius: 10, padding: 14, color: '#fff',
            fontSize: 15, resize: 'none', boxSizing: 'border-box',
          }} disabled={appState.isComputing} />

        {appState.mode === AiMode.AGENT && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {AUTONOMY_OPTIONS.map(opt => (
              <button key={opt.key} onClick={() => setAutonomy(opt.key)}
                style={{
                  flex: 1, padding: '6px 12px', borderRadius: 8,
                  background: appState.agentAutonomy === opt.key ? '#00ff8822' : '#1a1a2e',
                  border: appState.agentAutonomy === opt.key ? '1px solid #00ff88' : '1px solid #333',
                  cursor: 'pointer', color: appState.agentAutonomy === opt.key ? '#00ff88' : '#888', fontSize: 12,
                }}>
                {opt.label}
              </button>
            ))}
          </div>
        )}

        <button onClick={handleSubmit} disabled={appState.isComputing}
          style={{
            width: '100%', marginTop: 8, padding: 14, borderRadius: 10,
            background: appState.isComputing ? '#004422' : '#00ff88', border: 'none',
            color: appState.isComputing ? '#888' : '#000', fontWeight: 700, fontSize: 15,
            cursor: appState.isComputing ? 'default' : 'pointer',
          }}>
          {appState.isComputing
            ? (appState.mode === 'deep' ? '🔬 A analisar...' : appState.mode === 'agent' ? '🤖 Agentes a trabalhar...' : '⚡ A processar...')
            : 'Enviar'}
        </button>

        {response && (
          <div style={{
            background: '#1a1a2e', borderLeft: '3px solid #00ff88', borderRadius: 10,
            padding: 14, marginTop: 12, fontSize: 14, color: '#ddd', lineHeight: 1.5, whiteSpace: 'pre-wrap',
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
                <div style={{ flex: 1 }}>
                  <span style={{ color: '#ddd' }}>{t.description}</span>
                  <div style={{
                    height: 3, borderRadius: 2, marginTop: 4,
                    width: `${t.progress * 100}%`, background: '#00ff88',
                  }} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{
          background: '#1a1a2e', borderRadius: 12, padding: 16, marginTop: 20, fontSize: 13,
        }}>
          <div style={{ color: '#00ff88', fontWeight: 600, marginBottom: 8 }}>Estado da Rede</div>
          <div style={{ color: '#aaa', lineHeight: 1.8 }}>
            <div>{meshStatus.connected ? '🟢 Conectado' : '🔴 Desconectado'} · {meshStatus.peerCount} peers</div>
            <div>⚡ {meshStatus.transportType} · {meshStatus.latencyMs.toFixed(0)}ms</div>
            <div>🔋 {(appState.batteryLevel * 100).toFixed(0)}% · 🌡️ {appState.thermalHeadroom.toFixed(1)} headroom</div>
            <div>💰 ${appState.earningsUsd.toFixed(4)} · {appState.tasksCompleted} tarefas</div>
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
            {silentConfig.enabled && (
              <div style={{ color: '#00ff88', fontSize: 11 }}>
                {silentConfig.contributionHours.toFixed(1)}h · {silentConfig.tokensEarned.toFixed(4)} SKYNET
              </div>
            )}
          </div>
        </div>
        <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' }}>
          <input type="checkbox" checked={silentConfig.enabled} onChange={toggleSilent}
            style={{ opacity: 0, width: 0, height: 0 }} />
          <span style={{
            position: 'absolute', inset: 0, backgroundColor: silentConfig.enabled ? '#00ff88' : '#333',
            borderRadius: 24, transition: '0.3s',
          }}>
            <span style={{
              position: 'absolute', height: 18, width: 18, left: silentConfig.enabled ? 22 : 3, top: 3,
              backgroundColor: '#0a0a1a', borderRadius: '50%', transition: '0.3s',
            }} />
          </span>
        </label>
      </footer>

      <footer style={{ textAlign: 'center', marginTop: 8, color: '#444', fontSize: 11 }}>
        SKYNET DePIN v0.3.0 — {new Date().toLocaleDateString()}
      </footer>
    </div>
  );
}

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Switch, FlatList,
} from 'react-native';
import { useSkynet } from '../../shared/hooks/useSkynet.js';
import {
  AiMode, AgentAutonomy, AI_MODE_LABELS, AI_MODE_ICONS, AI_MODE_DESCRIPTIONS,
} from '../../shared/types/index.js';

const modes: AiMode[] = [AiMode.LIGHTNING, AiMode.DEEP, AiMode.AGENT];

function ModeCard({ mode, active, onPress }: { mode: AiMode; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.modeCard, active && styles.modeCardActive]}
      onPress={onPress}
    >
      <Text style={styles.modeIcon}>{AI_MODE_ICONS[mode]}</Text>
      <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>
        {AI_MODE_LABELS[mode]}
      </Text>
      <Text style={styles.modeDesc}>{AI_MODE_DESCRIPTIONS[mode]}</Text>
    </TouchableOpacity>
  );
}

function LightningView({ onSubmit, computing }: { onSubmit: (t: string) => void; computing: boolean }) {
  const [input, setInput] = useState('');
  return (
    <View style={styles.viewContainer}>
      <TextInput
        style={styles.input}
        placeholder="Pergunta rápida..."
        placeholderTextColor="#666"
        value={input}
        onChangeText={setInput}
        onSubmitEditing={() => { onSubmit(input); setInput(''); }}
        editable={!computing}
      />
    </View>
  );
}

function DeepView({ onSubmit, computing }: { onSubmit: (t: string) => void; computing: boolean }) {
  const [input, setInput] = useState('');
  return (
    <View style={styles.viewContainer}>
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        placeholder="O que queres analisar em profundidade?"
        placeholderTextColor="#666"
        value={input}
        onChangeText={setInput}
        multiline
        editable={!computing}
      />
      <TouchableOpacity
        style={[styles.submitBtn, computing && styles.submitBtnDisabled]}
        onPress={() => { onSubmit(input); setInput(''); }}
        disabled={computing}
      >
        <Text style={styles.submitText}>{computing ? '🔬 A analisar...' : '🔬 Analisar'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function AgentView({
  onSubmit, computing, autonomy, setAutonomy,
}: {
  onSubmit: (t: string) => void; computing: boolean;
  autonomy: AgentAutonomy; setAutonomy: (a: AgentAutonomy) => void;
}) {
  const [input, setInput] = useState('');
  const autonomies = [AgentAutonomy.WATCH, AgentAutonomy.ASSIST, AgentAutonomy.AUTO];
  return (
    <View style={styles.viewContainer}>
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        placeholder="Qual é o teu objectivo?"
        placeholderTextColor="#666"
        value={input}
        onChangeText={setInput}
        multiline
        editable={!computing}
      />
      <Text style={styles.sectionLabel}>Nível de autonomia:</Text>
      <View style={styles.autonomyRow}>
        {autonomies.map(a => (
          <TouchableOpacity
            key={a}
            style={[styles.autonomyChip, autonomy === a && styles.autonomyChipActive]}
            onPress={() => setAutonomy(a)}
          >
            <Text style={[styles.autonomyText, autonomy === a && styles.autonomyTextActive]}>
              {a === 'watch' ? '👁️ Vigiar' : a === 'assist' ? '🤝 Assistir' : '⚡ Auto'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        style={[styles.submitBtn, computing && styles.submitBtnDisabled]}
        onPress={() => { onSubmit(input); setInput(''); }}
        disabled={computing}
      >
        <Text style={styles.submitText}>{computing ? '🤖 Agentes a trabalhar...' : '🤖 Executar'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function SilentBar({ config, onToggle }: { config: any; onToggle: () => void }) {
  return (
    <View style={styles.silentBar}>
      <View style={styles.silentLeft}>
        <Text style={styles.silentIcon}>🌙</Text>
        <View>
          <Text style={styles.silentLabel}>Monetização de fundo</Text>
          {config.enabled && (
            <Text style={styles.silentStats}>
              {config.contributionHours.toFixed(1)}h · {config.tokensEarned.toFixed(4)} SKYNET
            </Text>
          )}
        </View>
      </View>
      <Switch
        value={config.enabled}
        onValueChange={onToggle}
        trackColor={{ false: '#333', true: '#00ff88' }}
      />
    </View>
  );
}

export default function App() {
  const {
    appState, meshStatus, silentConfig, agentTasks, response,
    setMode, setAutonomy, submitInference, toggleSilent,
  } = useSkynet();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>SKYNET</Text>
        <Text style={styles.subtitle}>DePIN — Inferência Distribuída</Text>
      </View>

      <ScrollView horizontal style={styles.modeRow} showsHorizontalScrollIndicator={false}>
        {modes.map(m => (
          <ModeCard key={m} mode={m} active={appState.mode === m} onPress={() => setMode(m)} />
        ))}
      </ScrollView>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {appState.mode === AiMode.LIGHTNING && (
          <LightningView onSubmit={submitInference} computing={appState.isComputing} />
        )}
        {appState.mode === AiMode.DEEP && (
          <DeepView onSubmit={submitInference} computing={appState.isComputing} />
        )}
        {appState.mode === AiMode.AGENT && (
          <AgentView
            onSubmit={submitInference}
            computing={appState.isComputing}
            autonomy={appState.agentAutonomy}
            setAutonomy={setAutonomy}
          />
        )}

        {response ? (
          <View style={styles.responseBox}>
            <Text style={styles.responseText}>{response}</Text>
          </View>
        ) : null}

        {agentTasks.length > 0 ? (
          <View style={styles.agentList}>
            <Text style={styles.sectionLabel}>Progresso dos Agentes</Text>
            {agentTasks.map(t => (
              <View key={t.id} style={styles.agentRow}>
                <Text style={styles.agentStatus}>
                  {t.status === 'completed' ? '✅' : t.status === 'executing' ? '🔄' : t.status === 'failed' ? '❌' : '⏳'}
                </Text>
                <View style={styles.agentInfo}>
                  <Text style={styles.agentName}>{t.description}</Text>
                  {t.result && <Text style={styles.agentResult}>{t.result}</Text>}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Estado da Rede</Text>
          <Text style={styles.statusText}>
            {meshStatus.connected ? '🟢 Conectado' : '🔴 Desconectado'} · {meshStatus.peerCount} peers
          </Text>
          <Text style={styles.statusText}>
            ⚡ {meshStatus.transportType} · {meshStatus.latencyMs.toFixed(0)}ms
          </Text>
          <Text style={styles.statusText}>
            🔋 {Math.round(appState.batteryLevel * 100)}% · 🌡️ {appState.thermalHeadroom.toFixed(1)} headroom
          </Text>
          <Text style={styles.statusText}>
            💰 ${appState.earningsUsd.toFixed(4)} · {appState.tasksCompleted} tarefas
          </Text>
        </View>
      </ScrollView>

      <SilentBar config={silentConfig} onToggle={toggleSilent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a1a', paddingTop: 50 },
  header: { alignItems: 'center', paddingBottom: 16 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#00ff88' },
  subtitle: { fontSize: 12, color: '#666' },
  modeRow: { paddingHorizontal: 12, marginBottom: 12 },
  modeCard: {
    backgroundColor: '#1a1a2e', borderRadius: 12, padding: 12, marginRight: 8,
    alignItems: 'center', width: 100,
  },
  modeCardActive: { backgroundColor: '#00ff8822', borderColor: '#00ff88', borderWidth: 1 },
  modeIcon: { fontSize: 24, marginBottom: 4 },
  modeLabel: { fontSize: 13, fontWeight: '600', color: '#ccc' },
  modeLabelActive: { color: '#00ff88' },
  modeDesc: { fontSize: 9, color: '#666', textAlign: 'center', marginTop: 2 },
  content: { flex: 1, paddingHorizontal: 16 },
  viewContainer: { marginBottom: 12 },
  input: {
    backgroundColor: '#1a1a2e', borderRadius: 10, padding: 14, color: '#fff',
    fontSize: 15, borderWidth: 1, borderColor: '#333',
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  submitBtn: {
    backgroundColor: '#00ff88', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8,
  },
  submitBtnDisabled: { backgroundColor: '#004422' },
  submitText: { color: '#000', fontWeight: '700', fontSize: 15 },
  sectionLabel: { color: '#aaa', fontSize: 13, marginTop: 12, marginBottom: 6 },
  autonomyRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  autonomyChip: {
    backgroundColor: '#1a1a2e', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#333',
  },
  autonomyChipActive: { borderColor: '#00ff88', backgroundColor: '#00ff8822' },
  autonomyText: { color: '#888', fontSize: 12 },
  autonomyTextActive: { color: '#00ff88' },
  responseBox: {
    backgroundColor: '#1a1a2e', borderRadius: 10, padding: 14, marginBottom: 12,
    borderLeftWidth: 3, borderLeftColor: '#00ff88',
  },
  responseText: { color: '#ddd', fontSize: 14, lineHeight: 20 },
  agentList: { marginBottom: 12 },
  agentRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a2e',
    borderRadius: 8, padding: 10, marginBottom: 6,
  },
  agentStatus: { fontSize: 16, marginRight: 10 },
  agentInfo: { flex: 1 },
  agentName: { color: '#ddd', fontSize: 13 },
  agentResult: { color: '#888', fontSize: 11, marginTop: 2 },
  statusCard: {
    backgroundColor: '#1a1a2e', borderRadius: 12, padding: 16, marginBottom: 20,
  },
  statusTitle: { color: '#00ff88', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  statusText: { color: '#aaa', fontSize: 13, marginVertical: 2 },
  silentBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1a1a2e', borderTopWidth: 1, borderTopColor: '#333',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  silentLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  silentIcon: { fontSize: 20 },
  silentLabel: { color: '#ccc', fontSize: 13, fontWeight: '600' },
  silentStats: { color: '#00ff88', fontSize: 11, marginTop: 1 },
});

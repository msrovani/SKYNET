import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Button, Switch } from 'react-native';
import { OperationMode, AppState, FarmConfig } from '../../shared/types/index.js';

export default function App() {
  const [mode, setMode] = useState<OperationMode>(OperationMode.PASSIVE);
  const [farming, setFarming] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SKYNET DePIN</Text>
      <Text style={styles.subtitle}>Rede de Infraestrutura Física Descentralizada</Text>

      <View style={styles.modeContainer}>
        <Text style={styles.label}>Modo: {mode.toUpperCase()}</Text>
        <View style={styles.buttonRow}>
          <Button title="Tático" onPress={() => setMode(OperationMode.TACTICAL)} />
          <Button title="Fazenda" onPress={() => setMode(OperationMode.FARM)} />
          <Button title="Passivo" onPress={() => setMode(OperationMode.PASSIVE)} />
        </View>
      </View>

      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>🌡️ Thermal: -- °C</Text>
        <Text style={styles.statusText}>🔋 Bateria: --%</Text>
        <Text style={styles.statusText}>📡 Peers: 0</Text>
        <Text style={styles.statusText}>💰 Ganhos: $0.00</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a1a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#00ff88',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 40,
  },
  modeContainer: {
    marginBottom: 30,
    alignItems: 'center',
  },
  label: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statusContainer: {
    backgroundColor: '#1a1a2e',
    padding: 20,
    borderRadius: 12,
    width: '100%',
  },
  statusText: {
    color: '#ccc',
    fontSize: 16,
    marginVertical: 4,
  },
});

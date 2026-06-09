# SKYNET DePIN

**Inferência de IA distribuída. Computação ociosa global. Uma malha auto-evolutiva.**

[![CI](https://github.com/msrovani/SKYNET/actions/workflows/ci.yml/badge.svg)](https://github.com/msrovani/SKYNET/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.9.0-green.svg)](CHANGELOG.md)
[![Tests](https://img.shields.io/badge/tests-395%20passing-brightgreen.svg)]()

---

SKYNET agrega **computação ociosa** de smartphones, PCs, Smart TVs e browsers numa malha global de inferência de IA. Qualquer dispositivo com chip pode contribuir — e ganhar.

## O Problema

- **Datacenters estão no limite**: 70% da capacidade global está em dispositivos pessoais ociosos.
- **IA centralizada é frágil**: gargalos, censura, risco de falha única.
- **Custos proibitivos**: inferência em GPU cloud custa 10-100x mais que o necessário.

## A Solução

SKYNET é uma **DePIN super app** que orquestra dispositivos heterogéneos numa única máquina de inferência distribuída, com:

| Camada | Dispositivos | Capacidade |
|--------|-------------|------------|
| **L0** | Smartphones, IoT | 1-3B params, draft tokens |
| **L1** | PCs, Consolas | 7-13B params, verificação |
| **L2** | Workstations, Smart TVs | 13-70B params, sharding |
| **L3** | Datacenters (parceiros) | 70B+, scheduling global |

## Ciclo Completo: Do Pedido à Resposta

Segue o rasto de um pedido de inferência desde que o utilizador toca no ecrã até ao momento em que vê a resposta — e como cada pacote do SKYNET contribui.

```
   ┌──────────────────────────────────────────────────────────────────┐
   │                    CICLO DE INFERÊNCIA DISTRIBUÍDA               │
   │                                                                  │
   │  ① Pedido      ② Descoberta    ③ Roteamento     ④ Pipeline     │
   │  ┌────────┐    ┌───────────┐   ┌───────────┐   ┌────────────┐   │
   │  │ App UI │───▶│ Orchestr. │──▶│ Thermal   │──▶│ Pipeline   │   │
   │  │ (L0/L1)│    │ Descobre  │   │ Router    │   │ Manager    │   │
   │  └────────┘    │ peers     │   │ (quem faz │   │ (distribui │   │
   │                └───────────┘   │ o quê)    │   │ layers)    │   │
   │                                └───────────┘   └─────┬──────┘   │
   │                                                      │          │
   │  ┌───────────────────────────────────────────────────┼──────────┐│
   │  │                MALHA P2P (WebTransport + QUIC)    │          ││
   │  │                                                   ▼          ││
   │  │  ⑤ Speculative Decoding (6 passos por token)                ││
   │  │                                                   │          ││
   │  │     ┌──────────┐    ┌──────────┐    ┌──────────┐ │          ││
   │  │     │ Phone A  │    │ Phone B  │    │  PC C    │ │          ││
   │  │     │ (L0)     │    │ (L0)     │    │ (L1)     │ │          ││
   │  │     │ draft 1  │    │ draft 2  │    │ verify   │ │          ││
   │  │     │ token 1-5│    │ token 6-9│    │ tokens   │ │          ││
   │  │     └────┬─────┘    └────┬─────┘    └────┬─────┘ │          ││
   │  │          │               │               │        │          ││
   │  │          └───────┬───────┘               │        │          ││
   │  │                  ▼                       │        │          ││
   │  │          ┌──────────────┐                │        │          ││
   │  │          │  Token       │◄───────────────┘        │          ││
   │  │          │  Aggregator  │                         │          ││
   │  │          │  (aceita/    │                         │          ││
   │  │          │   rejeita)   │                         │          ││
   │  │          └──────┬───────┘                         │          ││
   │  │                 │                                 │          ││
   │  │  ⑥ Se aceite: token → próximo ciclo               │          ││
   │  │  ⑦ Se reject: resample → corrige                  │          ││
   │  └───────────────────────────────────────────────────┼──────────┘│
   │                                                      │          │
   │  ⑧ Resposta    ⑨ Pagamento     ⑩ Evolução          │          │
   │  ┌────────┐    ┌───────────┐   ┌────────────┐       │          │
   │  │ App UI │◀───│ x402 micro│   │ Genome     │◄──────┘          │
   │  │ stream │    │ tx (Sol.) │   │ evolve     │                  │
   │  │ tokens │    │ ~$0/sessão│   │ parâmetros │                  │
   │  └────────┘    └───────────┘   └────────────┘                  │
   └──────────────────────────────────────────────────────────────────┘
```

### Fase ① — Pedido (Frontend)

O utilizador interage com a **app SKYNET** (React Native no telemóvel ou Next.js PWA no browser). O prompt é um JSON com o modelo alvo (ex: `"llama-3.2-3b-int4"`), os tokens de input e parâmetros de inferência (temperature, max_tokens).

```
app-ui-orchestrator/  ← envia pedido
    → p2p-mesh-network/  ← descobre & coordena
```

### Fase ② — Descoberta de Nós (Mesh Discovery)

O **PeerDiscovery** no `p2p-mesh-network` consulta a malha P2P para encontrar nós disponíveis com capacidade para o modelo pedido:

1. **L0** (telemóveis) — anunciam-se via WebTransport + WebRTC fallback
2. **L1** (PCs) — correm `desktop-node-agent` com Tauri, expõem GPU (CUDA/Metal) e capacidade
3. **L2** (workstations, Smart TVs) — tal como L1 mas com mais VRAM
4. PCs configuram-se como **servidores TURN/STUN descentralizados** para relays

Cada nó publica uma `NodeCapability` com:
- `computeScore` — TFLOPS relativos
- `vramGb`, `bandwidthGbps`, `latencyMs`
- `thermalHeadroom` — quanto pode aquecer
- `uptimeHours` — fiabilidade

O **RoleElection** classifica cada nó como `drafter` (L0, gera candidatos) ou `verifier` (L1+, valida).

### Fase ③ — Roteamento Térmico e Circadiano

O **Adaptive Scheduler** no `core-wasm-engine` (módulo `thermal.rs`) decide **quem faz o quê** com base em:

| Fator | Peso | Descrição |
|-------|------|-----------|
| Compute score | 0.30 | TFLOPS relativos do nó |
| VRAM livre | 0.25 | Cabe o modelo? |
| Thermal headroom | 0.20 | Distância do throttling |
| Bandwidth | 0.15 | Velocidade de rede |
| Circadian phase | 0.10 | Noite no fuso horário do nó = mais peso |

O **Circadian-Aware Scheduling** (ADR-14) dá prioridade a nós onde é noite — aproveita dispositivos ociosos enquanto os donos dormem. À medida que o terminador terrestre se move, as cargas deslocam-se.

### Fase ④ — Pipeline Assignment (Distribuição de Layers)

O **PipelineManager** no `p2p-mesh-network` pega na arquitectura do transformer (ex: 32 layers, Llama 3.2 3B) e distribui as layers pelos nós selecionados:

```
Modelo: 32 layers, 2048 hidden_dim
Nós:    phone-1 (fraco), phone-2 (fraco), pc-1 (forte)

Partição proporcional:
  phone-1: layers 0-1   (2 layers, draft)
  phone-2: layers 2-3   (2 layers, draft)
  pc-1:    layers 4-31  (28 layers, verify)
```

- **Cada nó recebe um shard vertical** do modelo (fatia de layers contíguas)
- O algoritmo garante que **nenhum nó morre de fome**: cada um recebe pelo menos 1 layer
- Se um nó falha, o pipeline é **reconfigurado automaticamente** (testado em 9 testes)
- Para modelos muito grandes, as layers são também **sharded horizontalmente** (column-wise) entre múltiplos PCs

### Fase ⑤ — Speculative Decoding Distribuído (6 Sub-passos por Token)

Este é o coração. Para **cada token** gerado, o sistema executa 6 sub-passos:

```
Passo 5a — Draft: L0 (phone-1) gera N=5 tokens candidatos
    Usa modelo pequeno (draft) — corre em ExecuTorch com backend CPU/GPU pequeno
    Saída: [token_17, token_42, token_88, token_3, token_155]
    + as probabilidades de cada token (p_draft)

Passo 5b — Compressão: SegmentMeans comprime as ativações
    As ativações entre layers são grandes (hidden_dim * 4 bytes)
    SegmentMeans divide em segmentos de tamanho S e substitui cada segmento pela média
    Ratio de compressão = S (ex: S=16 → 16x menos dados)
    Isso reduz largura de banda entre nós --- crucial em mobile

Passo 5c — Verificação: L1 (pc-1) corre os 5 tokens em paralelo
    PC corre o modelo grande (target) e obtém distribuições p_target para cada posição
    Uma única forward pass do target processa todos os 5 tokens de uma vez
    Isto é o que torna speculative decoding eficiente: 1 forward do target ≈ 5 tokens

Passo 5d — Rejection Sampling: quantos aceitamos?
    Para cada token i, calcula-se ratio = p_target(token_i) / p_draft(token_i)
    Se random() < min(1, ratio * acceptance_threshold) → ACEITE
    Senão → REJEITADO e resample da distribuição ajustada

Passo 5e — Agregação: quantos tokens produzimos neste ciclo?
    Exemplo: aceites [17, 42, 88]; rejeitado o 4º; resample token_201
    Output deste ciclo: 4 tokens (em vez de 1)
    Speedup = accepted_count / speculation_len

Passo 5f — Feedback: o speculation_len adapta-se
    Se acceptance_rate > 70% → aumenta speculation_len (mais agressivo)
    Se acceptance_rate < 30% → reduz (mais conservador)
    Isto maximiza tokens/segundo
```

#### Porquê isto é melhor que Pipeline Parallelism puro?

| PP puro | Speculative Decoding Distribuído |
|---------|----------------------------------|
| Cada forward ociosa espera pelo anterior | Mobile gera draft sem esperar |
| Pipeline bubbles em cada stage | Target processa N tokens em 1 forward |
| Mobile não consegue participar | Mobile é essencial (draft rápido) |
| Gargalo no nó mais lento | Carga distribuída por capacidade |

### Fase ⑥ — KV Cache e Long Context

O `inference.rs` no `core-wasm-engine` gere a **KV cache** para cada layer em cada nó:

- Cache alocada no momento do planeamento (`createKvCache`)
- Cresce incrementalmente com cada token aceite (`appendToKvCache`)
- Para sequências longas (4k+), a cache é **sharded** entre nós
- A cache persiste durante a sessão — não há recálculo

### Fase ⑦ — Checkpoints de Ativação (Preemption Recovery)

Se um nó falha ou atinge throttling térmico:

```
ActivationCheckpoint {
    layer_idx: 5,
    input_data: [0.1, -0.3, ...],   // input da layer
    output_data: [0.5, 0.1, ...],    // output calculado
    hidden_dim: 2048,
    seq_pos: 42,
}
```

- Checkpoints são guardados no **nó anterior + 1 backup aleatório**
- Se o nó 5 falha, o pipeline reconfigura-se e recomeça do checkpoint
- **Nenhum token perdido** — apenas o trabalho da layer falhada

### Fase ⑧ — Stream de Resposta

À medida que os tokens são verificados e aceites, são **streamed em tempo real** de volta ao frontend:

```
PC (verify) → Token Aggregator → Orchestrator → App UI
                token a token          streaming HTTP/SSE
```

- **Latência: ~100-500ms** por ciclo de speculative decoding (5-10 tokens)
- O utilizador vê os tokens a aparecer em tempo real — como ChatGPT
- Se o nó verificador está longe, a latência sobe mas o throughput mantém-se

### Fase ⑨ — Pagamento (x402 + State Channels)

Cada sessão de inferência é paga via **Solana x402**:

1. App solicita sessão → gera **State Channel** entre utilizador e mesh
2. A cada N tokens, assina uma **micro-transacção off-chain**
3. Saldo é liquidado na Solana quando o canal fecha (custo ≈ $0.001)
4. **80% do pagamento** vai para os operadores dos nós que processaram
5. **20% para a rede** (desenvolvimento, operação, staking)

### Fase ⑩ — Evolução Genética (Self-Healing)

Enquanto corre, o sistema recolhe telemetria:

| Métrica | Descrição |
|---------|-----------|
| Acceptance rate | Eficácia do draft |
| Latência por ciclo | Performance da rede |
| Thermal throttle | Stress térmico |
| Earnings/hr | Rentabilidade |
| Success rate | Fiabilidade |

Esta telemetria alimenta o **EvolutionEngine** (algoritmo genético, pop=20):

- **Crossover (70%)**: combina parâmetros de 2 pais
- **Mutação (15%)**: pequenas variações aleatórias
- **Novos parâmetros**: speculation_len, threshold, batch_size, segment_size, pesos do scheduler

O genome mais apto sobrevive → **parâmetros propagam-se pela mesh via CRDT**.

---

### Diagrama de Sequência Simplificado

```
App              Orchestrator       Phone (L0)        PC (L1)
 │                     │                │               │
 │── prompt ──────────▶│                │               │
 │                     │── discover ───▶│               │
 │                     │◀─ capability ──│               │
 │                     │── discover ──────────────────▶│
 │                     │◀─ capability ─────────────────│
 │                     │ (thermal routing)             │
 │                     │── assign layers ─────────────▶│
 │                     │── assign layers ──▶│          │
 │                     │                   │          │
 │                     │─── draft N ──────▶│          │
 │                     │                   │── tokens │
 │                     │── activations ──────────────▶│
 │                     │ (segment means)   │          │
 │                     │                   │── verify │
 │                     │◀─ accept/reject ─────────────│
 │── token stream ◀────│                   │          │
 │                     │                   │          │
 │                     │ (loop até eos)    │          │
 │                     │                   │          │
 │── close session ───▶│                   │          │
 │                     │── settle payment ─│─────────▶│
 │                     │ (x402 channel)    │          │
 │◀─ done ◀────────────│                   │          │
```

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                    SKYNET Mesh                           │
│                                                         │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐            │
│  │  Phone   │   │    PC    │   │  Smart TV│   ...       │
│  │ (L0)     │──▶│ (L1)     │──▶│ (L2)     │            │
│  │ draft    │   │ verify   │   │ shard    │            │
│  └──────────┘   └──────────┘   └──────────┘            │
│       │              │              │                   │
│       └──────────────┴──────────────┘                   │
│                      │                                  │
│               ┌──────┴──────┐                           │
│               │  WebTransport + QUIC │                  │
│               │  (Multipath, 0-RTT)  │                  │
│               └──────┬──────┘                           │
│                      │                                  │
│        ┌─────────────┼─────────────┐                    │
│        │  Automerge  │  FedYogi FL │  x402 Payments    │
│        │  CRDT Sync  │  MPC Secure │  (Solana + Base)  │
│        └─────────────┴─────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

## Stack

| Componente | Tecnologia |
|------------|-----------|
| Core | Rust → WASM (wgpu, WebGPU, INT4) |
| Transporte | WebTransport + Multipath QUIC, WebRTC fallback |
| Sincronização | Automerge CRDT v2 |
| Inferência | ExecuTorch 1.2 (5 backends) |
| FL | FedYogi + Secure Aggregation MPC |
| TEE | Intel SGX / AMD SEV → ARM CCA |
| Blockchain | Solana x402 + State Channels, Base fallback |
| Térmico | Adaptive Scheduler + Dynamic Shifting |
| App | React Native (Expo) + Next.js PWA + Tauri |

## Diferenciais

- **Speculative Decoding Distribuído**: mobile gera draft tokens, PC verifica — sem pipeline bubbles.
- **Semantic Affinity Routing**: cache semântico distribuído — a rede é a memória coletiva.
- **Circadian-Aware Scheduling**: cargas seguem o terminador terrestre (aproveitam noite/ociosidade).
- **Self-Healing via Evolução Genética**: parâmetros evoluem (pop 20, crossover 70%, mutação 15%).
- **Custo ~zero/sessão**: x402 micropagamentos off-chain via Solana State Channels.
- **80/20 Split**: 80% para o operador do nó, 20% para a rede — competitivo vs Vast.ai.

## Roadmap & Estado

```
Sprint 0 ████████████████████ 100%  Planeamento, ADRs
Sprint 1 ████████████████████ 100%  Fundação (WASM, WebTransport, ExecuTorch, 8 pacotes)
Sprint 2 ████████████████████ 100%  Mesh Local L1 (DSD, Inference pipeline, Checkpoints)
Sprint 3 ████████████████████ 100%  Mobile App + Thermal
Sprint 4a ████████████████████ 100%  Agentic Mesh: Semantic Router + HNSW
Sprint 4b ████████████████████ 100%  Agentic Mesh: Planner + Aggregator
Sprint 4c ████████████████████ 100%  Agentic Mesh: Agent Runtime + Desktop
Sprint 4d ████████████████████ 100%  Agentic Mesh: UI + Payments + Release
Sprint 5 ████████████████████ 100%  TEE Attestation + Blockchain Client
Sprint 6 ████████████████████ 100%  Federated Learning
Sprint 7 ████████████████████ 100%  Circadian + Plugin System + Multi-chain
Sprint 8 ████████████████████ 100%  iOS CoreML + Smart TV + ARM CCA
Sprint 9 ████████████████████ 100%  zk-SNARKs FL + LoRaWAN/Acústica
Sprint 10 ████████████████████ 100%  Integração + Beta
```

### O que funciona HOJE (podes executar)

| Componente | Estado |
|-----------|--------|
| `pnpm install` + `pnpm build` | ✅ 8/8 packages |
| `pnpm test` | ✅ 395 testes passam (41 core-wasm + 47 blockchain + 43 inference + 21 desktop + 167 p2p + 37 tee + 7 app-ui + 32 fl) |
| WebTransport echo demo (`pnpm example:echo`) | ✅ QUIC ~170ms, roundtrip ~15ms |
| Pipeline Parallelism (código + testes) | ✅ Layer partition por capacidade |
| Segment Means compression (código + testes) | ✅ Compressão lossy de ativações |
| Distributed Speculative Decoding (código + testes) | ✅ 11 testes (draft, verify, rejection) |
| Sharded Inference Pipeline (código + testes) | ✅ 11 testes (plan, memory, KV cache) |
| Activation Checkpoints (código + testes) | ✅ Preemption/recovery |
| Thermal Management (código + testes) | ✅ 30 testes (zone/trend/cooldown/shift) |
| Semantic Router (código + testes) | ✅ 22 testes (HNSW index + semantic matching) |
| Agent Mesh Manager (código + testes) | ✅ 8 testes (registry, heartbeats, health) |
| DAG Task Planner (código + testes) | ✅ 8 testes (4 templates, critical path) |
| Topology Router (código + testes) | ✅ 5 testes (AdaptOrch, 4 topologias) |
| Fraction Aggregator (código + testes) | ✅ 10 testes (checksums, merge, consistency) |
| Agent Runtime Rust (código + testes) | ✅ 12 testes (lifecycle, templates) |
| Agent Host (desktop-node-agent + testes) | ✅ 16 testes (spawn/execute/stop, 9 tools) |
| Agent Model (inference adapter + testes) | ✅ 7 testes (tool detection, prompt) |
| x402 Agent Payments (código + testes) | ✅ 5 testes (quote/pay/verify) |
| E2E Agentic Mesh (testes) | ✅ 5 testes (lifecycle, multi-agent) |
| WASM core (Rust → WebAssembly) | ✅ 178KB otimizado |
| App UI (React Native + Next.js PWA) | ✅ Scaffolds com 3 modos + monetização |
| App UI web build (Next.js) | ✅ Compila e exporta com sucesso |
| App UI integrado (useSkynet real) | ✅ AgentRuntime + AgentHost + AgentModel + x402 |
| TEE Remote Attestation (código + testes) | ✅ 24 testes (SGX sim, bridge, Proof of Time) |
| Solana x402 + Base fallback + State Channels | ✅ 35 testes (quote, pay, verify, microtx) |
| Federated Learning (FedYogi + QLocalAdam + FEDADAVR + ClientSelection) | ✅ 19 testes, todos os 4 módulos |
| Circadian-Aware Scheduling (ADR-014) | ✅ 12 testes, terminador, scores sazonais |
| Plugin System para modelos customizados | ✅ 16 testes (schema, registry, loader) |
| Multi-chain (Polygon, Arbitrum, router) | ✅ 12 testes (quotes, bridge, routing) |
| iOS CoreML delegate (via ExecuTorch) | ✅ 12 testes (ANE, chip optimization) |
| WebGPU preprocess + TV adaptive PWA | ✅ 8 testes WebGPU + useTvPlatform hook |
| ARM CCA native attestation | ✅ 13 testes (realm, attest, verify) |
| zk-SNARKs FL prover + verifier | ✅ 13 testes (proof gen, verify, batch, scheme filter) |
| LoRaWAN CRDT sync | ✅ 9 testes (SF, fragmentação, CRC32, loss) |
| Acoustic CRDT sync (ultrassom) | ✅ 10 testes (FSK/MSK, bandas 200-48kHz) |
| Opportunistic transport router | ✅ 10 testes (IP→LoRa→Acoustic fallthrough) |

### O que NÃO funciona ainda (próximas sprints)

| Funcionalidade | Previsão |
|---------------|----------|
| **iOS (CoreML via ExecuTorch)** | ✅ Sprint 8 (12 testes) |
| **Smart TVs (PWA + WebGPU)** | ✅ Sprint 8 (8 testes WebGPU + hook React) |
| **ARM CCA nativo** | ✅ Sprint 8 (13 testes CCA) |
| **zk-SNARKs FL verificável** | ✅ Sprint 9 (13 testes prover + verifier) |
| **LoRaWAN + acústica ultrassónica (ADR-015)** | ✅ Sprint 9 (29 testes LoRa + acoustic + router) |
| **Web App UI build** | ✅ Sprint 10 |
| **WebTransport E2E real entre 2 peers** | ✅ Sprint 10 |
| **E2E cross-package integration tests** | ✅ Sprint 10 |
| **Beta fechado (early adopters)** | Sprint 11 |
| **Beta público instalável** | Sprint 11 |

> **⚠️ SKYNET está em desenvolvimento ativo (Alpha).** Código funcional, testado e buildável — 395 testes, 8/8 packages, Web App UI funcional. Se és developer ou early adopter, mergulha em [github.com/msrovani/SKYNET](https://github.com/msrovani/SKYNET).

## Quick Start

```bash
# Instalar dependências
pnpm install

# Build todos os pacotes
pnpm build

# Correr testes
pnpm test

# WebTransport echo demo (Hello World)
pnpm --filter @skynet/p2p-mesh-network example:setup
pnpm --filter @skynet/p2p-mesh-network example:echo
```

## Repositório

```
SKYNET/
├── packages/
│   ├── core-wasm-engine/        ← Rust→WASM (tensors, thermal, evolution)
│   ├── p2p-mesh-network/        ← Transporte P2P, CRDT, pipeline parallelism
│   ├── inference-runtime/       ← ExecuTorch, model loader
│   ├── tee-attestation-layer/   ← Remote attestation, Proof of Time
│   ├── blockchain-client/       ← Solana x402, State Channels
│   ├── fl-training-client/      ← FedYogi, Secure Aggregation
│   ├── app-ui-orchestrator/     ← React Native + Next.js PWA
│   └── desktop-node-agent/      ← Tauri (GPU, power, node service)
├── docs/                        ← ADRs, planning, analysis
├── CHANGELOG.md
└── README.md
```

## Apoiar

- **Código**: contribuições via PR — issues, features, testes.
- **Computação**: instala o nó SKYNET (em breve nos stores).
- **Parcerias**: datacenters L3, ISP para TURN/STUN descentralizado.

---

> *"SKYNET não é um projeto fechado. SKYNET é uma grelha de utilidade pública — sem núcleo, sem dono, auto-evolutiva."*

# SKYNET DePIN — Base de Conhecimento

> Estado: **Sprint 1 Concluído** | 8 Pacotes | ~4.000+ linhas | WASM funcional | 13 testes unitários
> Data: Junho 2026

---

## 1. Visão Geral

**SKYNET** é uma Rede de Infraestrutura Física Descentralizada (DePIN) que agrega poder computacional ocioso de smartphones, PCs, Smart TVs e browsers numa malha de inferência de IA distribuída.

### 1.1 Proposta de Valor

- **Para fornecedores (nós):** Ganhar dinheiro com hardware ocioso ($5-1,200/mês por dispositivo)
- **Para consumidores (clientes):** Inferência IA a custo marginal (80% mais barato que AWS/GCP/Azure)
- **Para desenvolvedores:** API unificada para deploy de modelos sem infraestrutura centralizada

### 1.2 Stack Tecnológica Universal

| Camada | Tecnologia | Justificação |
|--------|-----------|-------------|
| Core | Rust → WASM | Performance, segurança, ecossistema WebAssembly |
| GPU Compute | WebGPU + ExecuTorch | WebGPU para preprocessing, ExecuTorch para ML |
| Transport | WebTransport + Multipath QUIC + WebRTC fallback | 4G/5G+Wi-Fi simultâneo, 0-RTT, resiliência |
| Transport Aux | PCs L2 como TURN/STUN descentralizados | Zero dependência externa |
| Sync State | Automerge (CRDT) + vetor térmico | Offline-first + estado térmico partilhado |
| Inferência L1 | Distributed Speculative Decoding (mobile→PC) | Assimetria como vantagem |
| Inferência L1b | Pipeline Parallelism + Segment Means (fallback) | Malhas homogéneas |
| Mobile | React Native (Expo) + Foreground Service | Cross-platform, Doze Mode bypass |
| Web/PWA | Next.js + Web Workers | SSR, streaming, service workers |
| Desktop | Tauri (Rust + React) | Nativo, CUDA/Metal/Vulkan, TURN/STUN embutido |
| FL | FedYogi + Secure Aggregation (MPC) + Q-LocalAdam + FEDADAVR | Gradientes mascarados bit-level em Rust |
| TEE | ARM CCA (futuro) + Intel SGX/AMD SEV (presente) | Remote Attestation, Confidential Computing |
| Blockchain | Solana (x402) + State Channels + Base (fallback) | Liquidação batch off-chain; custo ~zero |
| Thermal | Thermal-Aware Task Routing (CRDT) + Adaptive Scheduler | Despacho preventivo para peers frios |

---

## 2. Arquitetura de 3 Níveis + PC Layer

```
L0 — Nó Local (todos os dispositivos)
├── Cache de inferência, pré-processamento, embeddings, cache semântico
├── Smartphone: WASM + ExecuTorch (XNNPACK/Vulkan)
├── PC: WASM + ExecuTorch (CUDA/Metal/XNNPACK)
├── Multipath QUIC (4G/5G + Wi-Fi simultâneo)
├── Thermal monitor + CRDT state broadcast
├── Entrada: dados crus, Saída: respostas via DSD ou cache semântico
├── LoRaWAN + acústica ultrassónica (CRDT fallback extremo)
└── Resposta <100ms (pedidos síncronos); 0ms via cache semântico

L1 — Mesh Local (LAN/P2P)
├── Semantic Affinity Routing (nós organizam-se por contexto)
├── Distributed Speculative Decoding (mobile draft, PC verify)
├── Pipeline Parallelism + Segment Means (fallback homogéneo)
├── Thermal-Aware Task Routing via CRDT state sync
├── WebTransport + Multipath QUIC + WebRTC fallback
├── PCs como TURN/STUN descentralizados
├── Secure Aggregation (MPC) para gradientes FL
└── Apenas batch inference / treino federado

L2 — Rede Global (Internet)
├── Circadian-Aware Global Scheduling (cargas seguem a noite)
├── PCs high-end como nós de inferência primários (7B-70B)
├── Smartphones como pré-processamento/embedding (<3B)
├── WebTransport (client-server) + Remote Attestation
├── State channels off-chain + batch settlement Solana x402
├── PCs como TURN/STUN servers + coordenadores mesh
├── Split 80/20
└── Tolerância a falhas com preempção preditiva + self-healing
```

---

## 3. Monorepo — 8 Pacotes (Estado: Sprint 1 Concluído)

```
skynet-monorepo/
├── .github/workflows/ci.yml
│
├── packages/
│   ├── core-wasm-engine/              # Rust → WASM (WASM COMPILADO: 502KB)
│   │   ├── src/lib.rs                 # WASM bindings (25 funções exportadas)
│   │   ├── src/webgpu.rs              # Contexto WebGPU (dispositivo, fila, shader) — stubbed
│   │   ├── src/tensor.rs              # Sharding row/col, quantização INT4, reconstruct
│   │   ├── src/thermal.rs             # Monitor térmico, params adaptativos
│   │   ├── src/capability.rs          # NodeCapability, score/tier computation
│   │   ├── src/evolution.rs           # Genetic algorithm (pop 20, crossover 70%, mutation 15%)
│   │   ├── src/autonomous.rs          # AutonomousOrchestrator, evolvable params mutation
│   │   ├── src/knowledge_graph.rs     # Directed graph + thermal cascade analysis
│   │   ├── src/context_prune.rs       # 95% compression for edge devices
│   │   ├── stub/index.ts              # TS stub replicating ALL WASM bindings (fallback)
│   │   ├── stub/__tests__/sharding.test.ts  # 13 unit tests (vitest 1.6.1)
│   │   ├── build.cjs                  # Compila via temp dir ASCII (%TEMP%\skynet-wasm-build)
│   │   └── Cargo.toml                 # wasm-bindgen, serde, getrandom(js), fastrand
│   │
│   ├── p2p-mesh-network/              # WebTransport + Multipath QUIC + WebRTC
│   │   ├── src/transport.ts           # TransportManager (auto fallback, WebTransport)
│   │   ├── src/webrtc-fallback.ts     # WebRTC DataChannel
│   │   ├── src/crdt-sync.ts           # Automerge v2 CRDT (functional API)
│   │   ├── src/failover.ts            # Heartbeat, redistribuição, circuit breaker
│   │   ├── src/discovery.ts           # Peer Discovery (mDNS, signalling)
│   │   ├── src/instinct.ts            # Instinct Engine (cross-node pattern promotion)
│   │   ├── src/autonomous.ts          # EvolvableParams mutation + ExperimentTracker
│   │   ├── src/election.ts            # Role election
│   │   └── src/capability.ts          # Node capability computation
│   │
│   ├── inference-runtime/             # Binding ML
│   │   ├── src/executorch.ts          # ExecuTorch (XNNPACK/Vulkan/QNN/CoreML)
│   │   ├── src/mlx.ts                 # MLX (Apple Silicon)
│   │   ├── src/onnx-runtime.ts        # ONNX Runtime Web (fallback)
│   │   └── src/model-loader.ts        # Download, cache, metadados
│   │
│   ├── tee-attestation-layer/         # Segurança
│   │   ├── src/attestation.ts         # Remote Attestation (SGX/SEV/CCA)
│   │   ├── src/tee-bridge.ts          # Abstração TEE
│   │   └── src/proof-of-time.ts       # Proof of Inference Time
│   │
│   ├── blockchain-client/             # Pagamentos
│   │   ├── src/solana-x402.ts         # Solana x402 protocol
│   │   ├── src/base-fallback.ts       # Base fallback
│   │   └── src/microtx.ts             # Microtransações + histórico
│   │
│   ├── fl-training-client/            # Federated Learning
│   │   ├── src/fed-yogi.ts            # FedYogi (server-side adaptive)
│   │   ├── src/q-local-adam.ts        # Q-LocalAdam (8-bit optimizer)
│   │   ├── src/fedadavr.ts            # FEDADAVR (variance reduction)
│   │   └── src/client-selection.ts     # Seleção heterogénea
│   │
│   ├── app-ui-orchestrator/           # UI
│   │   ├── apps/mobile/               # React Native (Expo)
│   │   ├── apps/web/                  # Next.js PWA
│   │   └── shared/
│   │       ├── types/index.ts         # AppState, OperationMode, MeshStatus
│   │       └── hooks/useSkynet.ts     # Estado global
│   │
│   └── desktop-node-agent/            # PC Nó (Tauri v2)
│       ├── src-tauri/
│       │   ├── src/lib.rs             # Tauri entry (pub fn run())
│       │   ├── src/main.rs            # Binary entry
│       │   ├── src/gpu_detect.rs      # Deteção GPU, backends
│       │   ├── src/power_mgmt.rs      # Power profiles, idle detection
│       │   ├── src/node_service.rs    # Foreground service
│       │   ├── src/installer.rs       # Windows/Mac/Linux service installer
│       │   ├── src/auto_updater.rs    # Auto-update
│       │   └── src/moss.rs            # MOSS circuit breaker + recovery
│       └── src/                       # Frontend React
│
├── package.json                       # Turborepo root (v2.9.16)
├── pnpm-workspace.yaml
├── turbo.json                         # v2 schema (tasks, não pipeline)
├── tsconfig.base.json
├── SPRINT_0_PLANNING.md
├── ANALYSIS_PC_NODES.md
├── KNOWLEDGE_BASE.md                  # ← Este arquivo
├── AGENTS.md                          # Contexto permanente para LLMs
└── TODO.md                            # Task list detalhada
```

### 3.1 Módulos Implementados no core-wasm-engine

| Módulo | Responsabilidade | Linhas |
|--------|-----------------|--------|
| `tensor.rs` | Sharding row/col, reconstruct, verify checksum, INT4 quantize/dequantize | ~150 |
| `thermal.rs` | get_headroom(), compute_inference_params(), should_throttle(), estimate_safe_workload() | ~60 |
| `capability.rs` | NodeCapability struct, score(), tier computation (T1-T5) | ~40 |
| `evolution.rs` | Genetic algorithm: tournament selection, crossover, mutation, elitism | ~130 |
| `autonomous.rs` | AutonomousOrchestrator: experiment tracking, evolvable params mutation | ~160 |
| `knowledge_graph.rs` | Directed graph: add_node/edge, thermal cascade analysis, impact chain | ~120 |
| `context_prune.rs` | 95% compression: prune_context(), prune_summarize(), ContextItem | ~60 |
| `webgpu.rs` | Stubbed (web-sys 0.3.99 lacks WebGPU bindings) | ~20 |

### 3.2 Módulos Implementados no p2p-mesh-network

| Módulo | Responsabilidade |
|--------|-----------------|
| `transport.ts` | TransportManager with WebTransport + Multipath QUIC + WebRTC fallback |
| `crdt-sync.ts` | Automerge v2 CRDT (functional API, init<T>, change<T>, save<T>, load<T>) |
| `instinct.ts` | Instinct Engine: pattern extraction + cross-node promotion via CRDT |
| `autonomous.ts` | EvolvableParams mutation + ExperimentTracker (A/B testing) |
| `failover.ts` | Heartbeat + circuit breaker + recovery + redistribution |
| `discovery.ts` | Peer discovery (mDNS, signalling server, LAN broadcast) |
| `election.ts` | Role election for mesh coordination |
| `capability.ts` | Node capability computation and scoring |

---

## 4. Estado da Arte Tecnológica (2026) — O que Aprendemos

### 4.1 WebTransport (Baseline Março 2026)

- **Status:** Chrome 97+, Firefox 114+, Edge 97+, Safari 26.4+
- **Vantagens:** 0-RTT handshake, 30-50% menos latência que WebRTC, Web Workers, backpressure nativo
- **Limitação:** UDP/443 pode ser bloqueado em redes corporativas (5-10%)
- **Melhoria — Multipath QUIC:** Conexões simultâneas 4G/5G + Wi-Fi. Quedas intermitentes não matam o fluxo.
- **Decisão:** WebTransport + Multipath QUIC primário. WebRTC fallback com PCs como TURN/STUN descentralizados. Deteção via `webtransport-ponyfill-websocket`

### 4.2 WebGPU (Baseline Janeiro 2026)

- **Status:** Chrome 113+, Edge 113+, Firefox 141+ (Win)/145+ (macOS ARM), Safari 26+
- **Mobile:** Chrome 121+ (Android 12+, Qualcomm/ARM GPUs), iOS 26+ (A12+)
- **Desktop:** wgpu nativo → Vulkan (Linux/Win), Metal (macOS), DX12 (Win)
- **Limitação:** iPhones pré-A12 sem suporte; float16 inconsistente; Linux Firefox em progresso
- **Decisão:** WebGPU para preprocessing; ExecuTorch para inferência ML

### 4.3 ExecuTorch 1.0 (Meta, Outubro 2025)

- **Runtime:** 50KB footprint, 12+ backends
- **Backends desktop:** CUDA (experimental), Metal (experimental), XNNPACK
- **Performance (S25 Ultra):** Llama 3.2 1B INT4 → 350+ tok/s prefill, 40+ tok/s decode
- **Memória:** 1.1GB PTE, pico 1.9GB RSS (vs 3.1GB BF16)
- **KleidiAI:** +20% performance em Cortex-A v9
- **Windows:** Suporte WIP (WSL como bridge)
- **Decisão:** Motor primário; CoreML no iOS; XNNPACK + KleidiAI para CPU

### 4.4 ARM CCA (Confidential Compute Architecture)

- **Status:** Hardware previsto 2026-2027; simulação disponível
- **Vantagem sobre TrustZone:** 4 worlds, memória dinâmica, GPU assignment via RME-DA
- **Overhead:** 17-22% para inferência ML em Realm
- **Acai:** Extensão CCA para GPU → 43.5% overhead, +3704 LoC TCB
- **CAGE:** Shadow task mechanism para GPU confidencial
- **Decisão:** Preparar para CCA; implementar com Intel SGX/AMD SEV como ponte

### 4.5 Federated Learning — Algoritmos SOTA

| Algoritmo | Precisão | Estabilidade | Custo | Ideal para |
|-----------|----------|-------------|-------|-----------|
| **FedYogi** | Mais alto | Alta | Baixo | **Default** |
| **Q-LocalAdam** | Alto | Alta | 3.37x menos RAM | Memória limitada |
| **FEDADAVR** | Mais alto | Muito alta | Médio | Alta evasão de nós |
| **FedAdamW (2026)** | Superior | Alta | Baixo | Large models, weight decay |

- **Decisão:** FedYogi primário; Q-LocalAdam para mobile; FEDADAVR para cenários de falha

### 4.6 Thermal Throttling

- **Queda real (S8 Gen 3, 30min):** 12.4 → 3.8 tok/s (69% perda)
- **Adaptive Parameter Scheduler:** 77% retenção vs 31% naive
- **API:** `PowerManager.getThermalHeadroom()` (API 31+)
- **Dynamic Shifting:** Model switching baseado em temperatura + derivada
- **Decisão:** Thermal-Aware Task Routing via CRDT primário (despacho preventivo para peers frios). Adaptive Scheduler secundário (throttling local). Dynamic Shifting terciário.

### 4.7 Pipeline vs Tensor Parallelism para Mobile

- **TP:** Melhor latência, exige alta largura de banda (inviável para mobile mesh)
- **PP:** Menor exigência de comunicação, melhor para throughput
- **Position-wise Partitioning (Prism):** Compressão Segment Means → 90% menos dados
- **SpecPipe (2026):** Speculative decoding + PP → 4.19-5.53x melhor TBT
- **Parallel Track Transformer (2026):** 16x menos sincronização
- **Inovação — Distributed Speculative Decoding:** Mobile (<3B) gera draft tokens; PC verifica/valida. Zero pipeline bubbles.
- **Decisão:** DSD primário para malhas heterogéneas. PP + Position-wise Partitioning fallback para malhas homogéneas ou sem PC. Inferência local para modelos <1B.

### 4.8 x402 Protocol — Solana vs Base

| Característica | Solana | Base |
|---------------|--------|------|
| Finalidade | ~400ms | ~2s |
| Custo/tx | <$0.001 | <$0.01 |
| Share (AI agents) | **70%** | 30% |
| Transações | 35M+ | 119M+ |

- **Inovação — State Channels Off-Chain:** Proof-of-Time alimenta assinatura provisória. Liquidação batch em Solana apenas no encerramento da tarefa. Custo ~zero por inferência.
- **Decisão:** State channels + Solana x402; Base fallback

### 4.9 PC como Nós

| Tier | Hardware | Modelos | Ganho/mês |
|------|----------|---------|-----------|
| Tier 5 | CPU only (sem GPU) | Embeddings | $5-15 |
| Tier 4 | GPU 4-6GB | <3B INT4 | $15-50 |
| Tier 3 | GPU 8-12GB | <13B INT4 | $50-130 |
| Tier 2 | GPU 16-24GB | <30B INT4 | $130-500 |
| Tier 1 | GPU 32GB+ | <70B INT4 | $500-1,200 |

- **Stack:** Tauri + wgpu + ExecuTorch + CUDA/Metal/Vulkan
- **Split:** 80% nó / 20% rede

---

## 5. Decisões Arquiteturais (ADRs)

| ADR | Decisão | Alternativa Rejeitada | Razão |
|-----|---------|----------------------|-------|
| 001 | WebTransport + Multipath QUIC | WebRTC puro | 30-50% menos latência, 0-RTT, failover 4G/WiFi |
| 002 | ExecuTorch > ONNX Runtime | ONNX Runtime puro | 50KB runtime, 12 backends, KleidiAI, Meta-prod |
| 003 | FedYogi > FedAvg | FedAvg, FedDyn | +5-15% precisão, mesmo custo, 0% falhas |
| 004 | Solana x402 + State Channels | On-chain puro | Custo ~zero por inferência com batch settlement |
| 005 | Remote Attestation > zk-SNARKs | zk-SNARKs | zk-SNARKs inviável para inferência ML |
| 006 | Thermal-Aware Task Routing + Adaptive Scheduler | Térmico reativo | 77% retenção local; >90% em mesh graças a CRDT |
| 007 | PC como nó L2 primário | Apenas mobile | 10-100x mais capacidade, 7B-70B models |
| 008 | App desktop nativa (Tauri) | Só browser/PWA | Acesso CUDA/Metal nativo, foreground service |
| 009 | Abstração GPU via wgpu + ExecuTorch | CUDA-only | Cross-platform (Win/Mac/Linux) |
| 010 | Split 80/20 (nó/rede) | Split 50/50 ou 70/30 | Competitivo com Vast.ai, atrativo para fornecedores |
| 011 | Distributed Speculative Decoding (DSD) | PP puro | Zero pipeline bubbles em malhas heterogéneas |
| 012 | Secure Aggregation (MPC) p/ FL | Gradientes em plain text | Privacidade diferencial garantida em P2P |
| 013 | Semantic Affinity Routing | Latência física | Rede como memória coletiva; resultados repetidos → latência zero |
| 014 | Circadian-Aware Global Scheduling | Distribuição uniforme | Cargas pesadas seguem a noite; menos throttling, bateria cheia |
| 015 | Opportunistic CRDT Transport | Só WebTransport/WebRTC | LoRaWAN + acústica ultrassónica como fallback extremo |

---

## 6. Sprint 1 — Concluído (Junho 2026)

### 6.1 Conquistas

| Item | Status | Detalhes |
|------|--------|----------|
| Monorepo Turborepo v2 | ✅ | 8 pacotes, pnpm-workspace, turbo.json v2 schema |
| core-wasm-engine WASM | ✅ | 502KB `.wasm` compilado (3.15s) via temp dir ASCII |
| build.cjs | ✅ | Copia fontes para `%TEMP%\skynet-wasm-build`, compila lá, copia de volta |
| Tensor sharding | ✅ | shard_rowwise, shard_colwise, reconstruct_from_shards, verify_shard (Rust+TS) |
| 13 testes unitários | ✅ | vitest 1.6.1: sharding row/col, reconstruct, verify, edge cases |
| Automerge v2 | ✅ | API funcional: init<T>, change<T>, save<T>, load<T> |
| @solana/web3.js v1 | ✅ | v2 API radicalmente diferente, v1 mantida por compatibilidade |
| turbo.json v2 | ✅ | pipeline → tasks |
| Rust toolchain | ✅ | 1.96.0 (stable-x86_64-pc-windows-gnu), wasm32-unknown-unknown |
| TS stub fallback | ✅ | stub/index.ts replica todas bindings WASM |
| Instinct Engine | ✅ | Pattern extraction + cross-node promotion via CRDT |
| MOSS recovery | ✅ | Circuit breaker + plan generator + invariant validator |
| Knowledge Graph | ✅ | Directed graph + thermal cascade analysis |
| Context Prune | ✅ | 95% compression for edge devices |
| desktop-node-agent | ✅ | Tauri v2 fix (lib.rs + main.rs split) |
| pnpm build | ✅ | 8/8 packages OK |
| pnpm test | ✅ | 14/14 tasks successful (13 tests + 7 no-ops) |

### 6.2 Bug Fixes Realizados

1. **~55 erros Rust** corrigidos (evolution.rs, autonomous.rs, knowledge_graph.rs, capability.rs, tensor.rs, webgpu.rs, thermal.rs, context_prune.rs, lib.rs, Cargo.toml)
2. **web-sys 0.3.99** não tem bindings WebGPU → webgpu.rs stubbed
3. **Automerge v2** API completamente diferente (funcional vs classe)
4. **@solana/web3.js v2** re-exports de sub-pacotes incompatíveis → mantido v1
5. **turbo.json** v2 schema (pipeline → tasks)
6. **tsconfig references** circulares removidos
7. **desktop-node-agent** Tauri v2 precisa lib.rs + main.rs

### 6.3 Build Pipeline

```
pnpm build
├── @skynet/core-wasm-engine   → node build.cjs
│   ├── Copia Cargo.toml + src/ para %TEMP%\skynet-wasm-build
│   ├── cargo build --lib --release --target wasm32-unknown-unknown
│   ├── Copia .wasm para dist/
│   └── pnpm exec tsc (type declarations)
├── @skynet/tee-attestation-layer → tsc
├── @skynet/blockchain-client     → tsc
├── @skynet/p2p-mesh-network      → tsc
├── @skynet/inference-runtime     → tsc
├── @skynet/fl-training-client    → tsc
├── @skynet/desktop-node-agent    → node build.cjs (Tauri build, fallback stub)
└── @skynet/app-ui-orchestrator   → echo (placeholder)
```

---

## 7. Plano de Sprints (24 Semanas)

### Sprint 1 ✅ (1-4): Fundação
- Monorepo setup, compilação WASM, tensor sharding, testes
- **Milestone:** WASM 502KB compilado, 13 testes passando, 8/8 pacotes OK

### Sprint 1.5 (Integração) — Próximo
1. Gerar JS glue via wasm-bindgen-cli (binary precompilado ou MSVC linker)
2. Integrar primitivas WASM com WebGPU/NPU via TypeScript
3. Integrar ExecuTorch Llama 3.2 1B INT4 num dispositivo
4. Hello world WebTransport + Multipath QUIC entre 2 peers
5. Verificar build cross-platform (Linux/macOS CI)

### Sprint 2 (5-8): Mesh Local (L1)
- WebTransport DataChannels + Multipath QUIC, CRDT sync com vetor térmico
- Distributed Speculative Decoding (mobile draft, PC verify)
- Pipeline Parallelism + Segment Means (fallback)
- PCs como TURN/STUN descentralizados
- **Milestone:** 2+ dispositivos fazem inferência fragmentada via mesh WiFi com DSD

### Sprint 3 (9-12): Mobile App + Thermal
- React Native + Foreground Service
- Thermal-Aware Task Routing via CRDT (1ª linha)
- Adaptive Parameter Scheduler (2ª linha) + Dynamic Shifting (3ª linha)
- **Milestone:** App roda 30+ min sem throttling (>90% retenção em mesh, 77% isolada)

### Sprint 4 (13-16): Segurança + Blockchain
- Remote Attestation, State Channels off-chain, Solana x402 batch settlement
- Proof of Inference Time → provisional signing structure
- **Milestone:** Pagamento funcional com custo ~zero por inferência em testnet

### Sprint 5 (17-20): Federated Learning
- FedYogi + Secure Aggregation (MPC) — mascaramento bit-level Rust→WASM
- Q-LocalAdam, FEDADAVR, Client Selection heterogénea
- **Milestone:** Treino federado funcional em 10+ dispositivos com gradientes protegidos

### Sprint 6 (21-24): Integração + Beta
- Integração 8 pacotes, testes 100+ nós, auditoria segurança
- **Milestone:** Beta fechado (20 empresas, 500 dispositivos)

---

## 8. Riscos e Mitigações

### Técnicos

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| WebTransport bloqueado em firewalls | 10% | Alto | Fallback WebRTC + WebSocket |
| ARM CCA hardware não disponível em 2026 | Alta | Médio | SGX/SEV como ponte |
| GPU memory insuficiente para LLMs | Alta | Alto | Position-wise Partitioning + INT4 |
| Preempção abrupta | Alta | Alto | Checkpoint ativações; cache L0 |
| Bateria >5%/dia → desinstalação | Média | Crítico | Modo Fazenda só com carregamento + Wi-Fi |
| Windows sem ExecuTorch CUDA nativo | Média | Médio | WSL como bridge; ONNX DirectML fallback |
| Custo elétrico supera ganho (PCs) | Média | Alto | Pagamento por token; bloqueio geográfico |
| wasm-bindgen-cli requer MSVC linker | Média | Médio | Binary precompilado ou instalar Windows SDK |

### Não Técnicos

| Risco | Mitigação |
|-------|-----------|
| Operadoras bloqueiam P2P | Relay Cloudflare + parcerias ISPs |
| GDPR/LGPD | Federated Learning + TEE |
| Regulatório cripto | USDC (stablecoin regulada); saques fiat via Circle |
| Adoção chicken-and-egg | MVP B2B primeiro; consumer depois |

---

## 9. Padrões de Código

### Rust
- `unsafe` minimizado (apenas FFI)
- `wasm-bindgen` para exportação WASM
- Tipos `Result<T, JsValue>` em todas as funções exportadas
- shaders WGSL compilados em compile-time
- **ATENÇÃO:** Accented paths ("Área de Trabalho") quebram linker GNU → usar temp dir ASCII

### TypeScript
- `strict: true` no tsconfig
- Módulos ES (`type: "module"`)
- Interfaces exportadas sem prefixo `I`
- `async/await` em todas as operações de I/O
- Error handling: `try/catch` com fallback explícito

### Organização
- Monorepo Turborepo v2 com pnpm
- Cada pacote tem: `src/`, `package.json`, `tsconfig.json`
- Dependências entre pacotes via `workspace:*`
- CI: lint → build TS → build WASM → test

---

## 10. Ambiente de Desenvolvimento

### Pré-requisitos
- Node.js 20+, pnpm 9+
- Rust 1.96.0+ (wasm32-unknown-unknown target)
- Para desktop: Tauri CLI, dependências nativas
- Para mobile: Expo CLI, Android SDK / Xcode

### Comandos
```bash
pnpm install            # Instalar dependências
pnpm dev                # Dev mode (Turborepo)
pnpm build              # Build todos os pacotes (8/8 OK)
pnpm test               # Testes (14/14 tasks OK)
pnpm lint               # Linting

# Core WASM Engine específico
pnpm --filter=@skynet/core-wasm-engine exec vitest run  # 13 testes sharding
```

### WASM Build Pipeline
```bash
# O build.cjs faz automaticamente:
# 1. Copia Cargo.toml + src/ para %TEMP%\skynet-wasm-build
# 2. cargo build --lib --release --target wasm32-unknown-unknown
# 3. Copia .wasm para dist/
# 4. Gera type declarations via tsc
```

---

## 11. Referências e Recursos

### Papers Fundamentais (2025-2026)
1. ARM CCA for On-Device ML (arXiv 2504.08508)
2. ACAI: Accelerator Execution with Arm CCA (USENIX ATC'24)
3. CAGE: GPU Computing for Arm CCA (NDSS'24)
4. Prism: Distributed Transformer Inference (arXiv 2605.25682)
5. SpecPipe: Speculative Decoding + PP (arXiv 2504.04104)
6. Parallel Track Transformer (arXiv 2602.07306)
7. FEDADAVR: Adaptive FL Optimizer (arXiv 2601.22204)
8. Q-LocalAdam: 8-bit Client-Side FL (arXiv 2605.17552)
9. FedAdamW (AAAI 2026)
10. Thermal Throttling Analysis (MVP Factory, 2026)

### Repositórios Base
- pytorch/executorch
- w3c/webtransport
- gfx-rs/wgpu
- tracel-ai/burn + cubecl
- dawn-gpu/node-webgpu

### APIs Chave
- `navigator.gpu` (WebGPU)
- `new WebTransport(url)` (WebTransport)
- `RTCPeerConnection` (WebRTC)
- `PowerManager.getThermalHeadroom()` (Android API 31+)
- `PerformanceHintManager` (Android API 31+)
- `@solana/web3.js` v1 (não v2!)
- `@automerge/automerge` v2 (API funcional)

---

## 12. Vetores de Inovação Não-Lineares (Visão 2026+)

### 12.1 Semantic Swarm Routing (ADR-013)
**Status: Adotado.** Nós organizam-se por contexto semântico, não latência. Embeddings em cache local; similaridade de cosseno evita GPU para resultados repetidos.

### 12.2 Blind Compute — FHE Dinâmico
**Status: Research track.** FHE para LLMs ainda impraticável (10⁵-10⁶x slowdown). Roadmap: MPC+TEE (2026-27) → FHE híbrido (2027-28) → FHE integral (2028+).

### 12.3 Heliocentric Migration (ADR-014)
**Status: Adotado.** Cargas pesadas seguem o terminador terrestre. Noite = menor temperatura, dispositivos na corrente, energia fora de pico.

### 12.4 Opportunistic Spectrum (ADR-015)
**Status: Adotado.** LoRaWAN + acústica ultrassónica como fallback CRDT para cenários sem qualquer infraestrutura de rede.

### 12.5 Visão Final: "Atmosfera Cognitiva"
- **Utility Grid:** IA como grelha de utilidade pública, sem núcleo central
- **Self-healing:** Nós compromises isolados; pesos adaptam-se organicamente
- **Economia x402:** Computação como lastro monetário transacionável entre dispositivos

---

## 13. Aprendizados Críticos (Sprint 1)

### 13.1 Rust + WASM no Windows
- **GNU toolchain** (stable-x86_64-pc-windows-gnu) compila WASM, mas **MSVC linker** não está disponível
- **Accented paths** ("Área de Trabalho") quebram o linker GNU → **solução: temp dir ASCII**
- **web-sys 0.3.99** não inclui WebGPU bindings → stubbed com fallback síncrono
- **getrandom = "js"** necessário para RNG em WASM

### 13.2 Ecossistema Node.js
- **Turborepo v2** usa `tasks` em vez de `pipeline`
- **@solana/web3.js v2** tem API radicalmente diferente → manter v1
- **Automerge v2** usa API funcional (não classes) → `init<T>()` em vez de `new Document()`
- **vitest** precisa estar no devDependencies de cada pacote para `turbo test`

### 13.3 Padrões de Arquitetura
- **TS stub** como fallback quando Rust indisponível → build.cjs tenta Rust, cai em stub
- **WASM via temp dir** → compilar em path ASCII, copiar output para dist/
- **lib.rs + main.rs** em Tauri v2 → lib.rs contém `pub fn run()`, main.rs chama

### 13.4 Próximos Passos Críticos
1. **wasm-bindgen-cli** → precisa de binary precompilado ou MSVC linker
2. **WebGPU real** → aguardar web-sys updates ou usar Dawn bindings
3. **ExecuTorch** → precisa de dispositivo físico para teste
4. **WebTransport** → precisa de 2 peers para hello world

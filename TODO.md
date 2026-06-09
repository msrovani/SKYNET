# SKYNET DePIN — Task List

## Sprint 0: Planejamento ✅

- [x] Pesquisar WebTransport vs WebRTC, WebGPU, ExecuTorch, ARM CCA, FedYogi, thermal, pipeline vs tensor, x402
- [x] Sintetizar research em SPRINT_0_PLANNING.md
- [x] Definir arquitetura 8 pacotes, 6 sprints

## Sprint 1: Fundação ✅

- [x] Monorepo (Turborepo + pnpm), CI (GitHub Actions matrix)
- [x] `core-wasm-engine`: Rust→WASM (tensor sharding, INT4, thermal, capability, evolution, KG, context prune, inference)
- [x] `p2p-mesh-network`: TransportManager, WebRTC fallback, Automerge CRDT, failover, discovery, role election, instinct, capability, pipeline, segment-means, speculative-decoding, thermal
- [x] `inference-runtime`: ExecuTorch 1.2 API, model loader, KNOWN_MODELS
- [x] `desktop-node-agent`: Tauri v2 (GPU, power, MOSS), stub build
- [x] WebTransport Hello World (`@moq/web-transport`, QUIC ~170ms)
- [x] WASM: 168KB, JS glue 34KB, types 8KB
- [x] 8/8 packages build, CI matrix ubuntu/macos/windows

## Sprint 2: Mesh Local — L1 ✅

- [x] Pipeline Parallelism — layer partition proporcional, reconfiguração (9 testes)
- [x] Segment Means — compressão lossy de ativações (6 testes)
- [x] Distributed Speculative Decoding — draft/verify/rejection sampling, adaptive speculation (11 testes)
- [x] Sharded Inference Pipeline — TransformerConfig, PipelinePlan, KV cache, memory (11 testes)
- [x] Activation Checkpoints — snapshots preemption/recovery
- [x] Agentic Mesh Planning — SPRINT_AGENTIC_PLANNING.md, 10 papers, 4 ADRs

## Sprint 3: Mobile App + Thermal ✅

- [x] **Thermal Management**: ThermalManager (zone/trend/cooldown, 20 testes) + DynamicShifter (model chain, 10 testes) + `thermal.rs` WASM exports
- [x] **AI_USAGE_MODES.md** — 4 modos baseados em IA (Relâmpago/Profundo/Agente + monetização toggle)
- [x] **App UI scaffold**: React Native (Expo) + Next.js PWA com 3 modos (⚡Relâmpago, 🔬Profundo, 🤖Agente) + 🌙 toggle monetização
- [x] `useSkynet.ts` hook com submitInference mock para cada modo, telemetria simulada
- [x] Web app (Next.js 15) build OK, static export, sem warnings
- [x] Modo monetização = toggle global (chave on/off), não modo separado

## Sprint 4a: Agentic Mesh — Semantic Router ✅

- [x] `capability.ts` extended: VCapabilityVector, embedText() hash→vector, cosineSimilarity()
- [x] `semantic-router.ts`: HnswIndex (ANN O(log N)) + SemanticRouter (registo, matching semântico+tools, fallback, eventos)
- [x] `agent-mesh.ts`: AgentMeshManager (registo local/remoto, heartbeats, health monitoring, eventos)
- [x] 30 testes (5 HnswIndex + 17 SemanticRouter + 8 AgentMeshManager)
- [x] Event system: onEvent/emit com Set<Callback>, cleanup function

## Sprint 4b: Agentic Mesh — Planner + Aggregator ✅

- [x] `planner.ts`: TaskPlanner — decompõe prompts em DAGs (4 templates: webdesign/content/image/analysis), critical path depth, layer grouping
- [x] `topology-router.ts`: TopologyRouter — AdaptOrch (parallel/sequential/hierarchical/hybrid), metrics parallelismWidth/criticalPathDepth/coupling
- [x] `fraction-aggregator.ts`: FractionAggregator — valida checksums, merge HTML+CSS→página, JSON→merge, texto→markdown, consistência CSS/HTML class overlap, refinamento multi-round
- [x] 25 testes (8 planner + 5 topology + 10 aggregator + 2 checksum)
- [x] 149 testes totais (24 core-wasm + 125 p2p, 7 test files)

## Sprint 4c: Agentic Mesh — Runtime + Desktop ✅

### 4c.1 Agent Runtime
- [x] `agent_runtime.rs` no core-wasm-engine: AgentConfig, AgentInput/Output, ToolCall, ciclo de vida (Idle→Loading→Ready→Executing→Completed)
- [x] `AgentHost` no desktop-node-agent: spawn/stop agent runtimes, 9 builtin tools (html-renderer, css-generator, text-generator, etc.), max agents limit, status tracking
- [x] Adapter no inference-runtime: AgentModel com ExecuTorch, tool call detection, context-aware prompt builder
- [x] 3 agent templates: webdesign (qwen-2.5-7b-int4), content-writer (llama-3.2-3b), image-optimizer (flux-1-dev)
- [x] Testes: 35+ (12 runtime + 16 agent-host + 7 agent-model)

### 4c.2 Milestone S4c
- [x] AgentRuntime em Rust WASM + TS stub + factory createAgentFromTemplate()
- [x] 9 tools injetadas por template, executeTool() via AgentHost

## Sprint 4d: Agentic Mesh — UI + Payments + Release ✅

### 4d.1 Frontend
- [x] Modo "Agente" no app-ui-orchestrator (page.tsx): task list, autonomy selector (Vigiar/Assistir/Auto), streaming progress
- [x] Agent payment via x402 no blockchain-client: AgentX402Payments (quote/pay/verify)
- [x] Reputation tracking — deferred (CRDT-based planned)

### 4d.2 Release
- [x] Testes E2E: 5 (lifecycle, multi-agent, cross-template, confidence/latency) + 5 agent-payments
- [x] Bump v0.3.0 + AGENTS.md update + git tag

## Sprint 5: Segurança e Blockchain ✅

### 5.1 tee-attestation-layer ✅
- [x] `attestation.ts`: Remote Attestation — SGX simulation (quote/verify/measurement, nonce challenge-response, SHA-256 measurement hash, simulated + hardware modes)
- [x] `tee-bridge.ts`: Abstração SGX/SEV/CCA — deteção automática (x64→SGX, WebGPU→CCA, Tauri→SEV), secure execution com fallback, validação de memória/providers
- [x] `proof-of-time.ts`: Proof of Inference Time — work chunks com FLOPS tracking, signature vinculada a measurement hash, integração com attestation, verificação de duração mínima

### 5.2 blockchain-client ✅
- [x] `solana-x402.ts`: Integração com Solana x402 protocol (9 testes)
- [x] `base-fallback.ts`: Base como fallback (10 testes)
- [x] `microtx.ts`: Microtransações USDC (11 testes)
- [x] `agent-payments.ts`: Agent payments via x402 (5 testes)

## Sprint 6: Federated Learning ✅

### 6.1 fl-training-client
- [x] `fed-yogi.ts`: FedYogi — adaptive server optimizer com momentum/variance (Yogi rule)
- [x] `q-local-adam.ts`: Q-LocalAdam — 8-bit quantized Adam local optimizer (Int8 states)
- [x] `fedadavr.ts`: FEDADAVR — variance reduction para alta evasão de clientes
- [x] `client-selection.ts`: Seleção heterogénea (bateria, Wi-Fi, thermal, memória, reliability)
- [x] Testes unitários: 19 (4 FedYogi + 4 QLocalAdam + 5 FEDADAVR + 6 ClientSelection)

## Sprint 7: Scheduling + Plugin System + Multi-chain

### 7.1 Circadian-Aware Scheduling (ADR-014) ✅
- [x] `circadian-scheduler.ts`: Scheduler que segue o terminador terrestre
- [x] Modelo de carga: dia → dispositivos urbanos, noite → PCs/workstations
- [x] Integração com ThermalManager + DynamicShifter (score combinado)
- [x] 12 testes: local hour, night detection, terminator longitude, scores, selection

### 7.2 Plugin System para Modelos Customizados ✅
- [x] `plugin-types.ts`: Schema de plugin (ModelPluginCard, PluginSchema, validação)
- [x] `plugin-registry.ts`: Registo com versionamento semântico, checksum, search, manifest import/export
- [x] `plugin-loader.ts`: Loading dinâmico (HuggingFace, ONNX Zoo, URL), memory check, cache
- [x] 16 testes: validation, register, upgrade, downgrade, remove, search, verify, manifest, events, loader

### 7.3 Multi-chain (Polygon, Arbitrum) ✅
- [x] `chain-adapters.ts`: PolygonAdapter + ArbitrumAdapter com bridge x402 simulado
- [x] `multi-chain-router.ts`: Roteamento fee/speed, preferred chain, max fee, eventos
- [x] Integração com blockchain-client + SolanaX402
- [x] 12 testes: quotes, bridge, routing, fallback, events

## Sprint 8: Mobile + TV + ARM CCA ✅

### 8.1 iOS CoreML via ExecuTorch ✅
- [x] `coreml.ts`: CoreML delegate — detectPlatform, recommendDelegate, ANE detection, chip-based optimization (12 testes)
- [x] Export via inference-runtime index.ts (CoreMLRuntime, tipos CoreMLDelegate/CoreMLPlatform)
- [x] Integração com AgentModel + inference-runtime

### 8.2 Smart TVs (PWA + WebGPU) ✅
- [x] `webgpu-preprocess.ts`: WebGPU compute shader pipeline (espcn/esrgan/normalize/resize/layout), adapter detection, TV detection (8 testes)
- [x] `useTvPlatform.ts`: Hook React para deteção TV (Tizen/webOS/Android TV/Roku), input type, screen info
- [x] Integração com pipeline parallelism + thermal + app-ui-orchestrator

### 8.3 ARM CCA nativo ✅
- [x] `cca-attestation.ts`: Remote Attestation via ARM CCA Realm — CcaAttestation com initialize/attest/verifyReport/destroyRealm/transitionRealm, SHA-256 measurement, nonce challenge-response (13 testes)
- [x] CCA provider para TeeBridge (detecção arm64/aarch64)
- [x] Integração com tee-attestation-layer

## Sprint 9: Verifiable FL + Fallback Extremo ✅

### 9.1 zk-SNARKs FL verificável ✅
- [x] `zk-fl-prover.ts`: ZkFlProver — proof generation, batch proof, simulated + hardware mode, size estimation (7 testes)
- [x] `zk-fl-verifier.ts`: ZkFlVerifier — single/batch verify, scheme filtering, size check, gradient integrity (6 testes)
- [x] Integração com FedYogi + FEDADAVR
- [x] 13 testes: proof generation, verification, batch verify, scheme filter, oversize reject

### 9.2 LoRaWAN + Acústica Ultrassónica (ADR-015) ✅
- [x] `lora-crdt-sync.ts`: LoRaCrdtSync — SF7-12, BW125-500, CR4/5-4/8, Class A/B/C, fragmentação, CRC32, retry, packet loss sim (9 testes)
- [x] `acoustic-crdt-sync.ts`: AcousticCrdtSync — FSK/MSK/OFDM, audible/near-ultrasonic/ultrasonic, bandas 200Hz-48kHz, checksum (10 testes)
- [x] `opportunistic-router.ts`: OpportunisticRouter — fila prioritária IP→LoRa→Acoustic, fallthrough em falha, eventos route-selected/transport-failed/fallback-activated (10 testes)
- [x] Integração com CrdtSync + FailoverManager
- [x] 29 testes: sync, fragmentação, perda pacotes, fallback automático, eventos

## Sprint 10: Integração + Beta

### 10.1 Integração + Qualidade
- [ ] Integrar todos os 8 + novos pacotes
- [ ] Testes de carga (100+ nós simulados)
- [ ] Stress test 30+ min, auditoria segurança, otimização bateria
- [ ] E2E: speculative decoding + semantic routing + thermal → mobile → PC → cloud

### 10.2 Beta
- [ ] Beta fechado (20 empresas, 500 dispositivos)
- [ ] Dashboard, documentação API
- [ ] Beta público instalável (app stores + PWA)

---

## Log de Conquistas

### Sprint 3 (Junho 2026)
- **Thermal Management:** ThermalManager (zone/trend/cooldown, 30 testes), DynamicShifter, WASM exports
- **AI Usage Modes:** 4 modos (Relâmpago/Profundo/Agente/Silêncio), AI_USAGE_MODES.md
- **App UI Scaffold:** React Native (Expo) + Next.js PWA com 3 modos + toggle monetização
- **Web App Build:** Next.js 15 static export OK, sem warnings

### Sprint 4a (Junho 2026)
- **Semantic Router:** HnswIndex + SemanticRouter (22 testes) + AgentMeshManager (8 testes)
- **VCapabilityVector:** embedText hash-based + cosineSimilarity
- **30 testes agentic mesh**, 100 testes p2p-mesh-network total
- **7 test files** em p2p-mesh-network

### Sprint 4b (Junho 2026)
- **TaskPlanner:** DAG decomposition com 4 templates, critical path, layers
- **TopologyRouter:** AdaptOrch topology selection (parallel/seq/hierarchical/hybrid)
- **FractionAggregator:** Checksum validation + artifact merge + consistency detection
- **25 testes**, 125 testes p2p-mesh-network, 149 total

### Sprint 4c (Junho 2026)
- **Agent Runtime Rust:** AgentConfig/Input/Output/ToolCall, ciclo de vida WASM + TS stub
- **Agent Templates:** webdesign (qwen), content-writer (llama), image-optimizer (flux)
- **AgentHost:** spawn/execute/stop, 9 builtin tools, max agents limit, 16 testes
- **AgentModel:** inference adapter com ExecuTorch, tool call detection, 7 testes
- **35 testes novos** (12 core-wasm + 16 desktop-node + 7 inference)

### Sprint 4d (Junho 2026)
- **AgentX402Payments:** quote/pay/verify flow via Solana x402 + microtx, 5 testes
- **E2E Agentic Mesh:** 5 testes de integração (lifecycle, multi-agent, cross-template)
- **Agent Query UI:** modo Agente no page.tsx com task list + autonomy selector
- **WASM:** 178KB, JS glue 35KB

### Sprint 5 (Junho 2026)
- **AttestationManager:** SGX simulation com quote/verify, SHA-256 measurement, nonce challenge-response, hardware signature mode, 9 testes
- **TeeBridge:** Deteção automática TEE (x64→SGX, WebGPU→CCA, Tauri→SEV), secure execution com fallback, validação memória/providers, 6 testes
- **ProofOfTime:** Work chunks com FLOPS tracking, signature measurement hash, attestation integration, minWorkMs verification, 9 testes
- **24 testes novos** (9 attestation + 6 tee-bridge + 9 proof-of-time)

### Sprint 6 (Julho 2026)
- **FedYogi:** Adaptive server optimizer (Yogi rule) com momentum/variance tracking, 4 testes
- **QLocalAdam:** 8-bit quantized local Adam com Int8 estados de momentum/variance, 4 testes
- **FEDADAVR:** Variance reduction para high evasão (extends FedYogi), 5 testes
- **ClientSelection:** Heterogeneous client selection (bateria, Wi-Fi, thermal, memory, reliability), 6 testes
- **19 testes novos**, 273 tests totais, 17/17 tasks

### Sprint 7 (Julho 2026)
- **Circadian Scheduler:** Scheduler que segue terminador terrestre, scores sazonais (12 testes)
- **Plugin System:** PluginSchema + PluginRegistry + PluginLoader, HuggingFace/ONNX/URL, 16 testes
- **Multi-chain:** PolygonAdapter + ArbitrumAdapter + MultiChainRouter, 12 testes
- **40 testes novos**, 313 tests totais, 16/16 tasks

### Sprint 8 (Julho 2026)
- **iOS CoreML:** CoreMLRuntime, detectPlatform, recommendDelegate, chip-based optimization (12 testes)
- **WebGPU Preprocess:** Shaders ESPCN/ESRGAN/Normalize/Resize/Layout, adapter detection (8 testes)
- **PWA TV Adaptive:** useTvPlatform hook (Tizen/webOS/Android TV/Roku), deteção input remoto
- **ARM CCA Attestation:** CcaAttestation, realm lifecycle, measurement hash, nonce challenge (13 testes)
- **33 testes novos**, 347 tests totais, 16/16 tasks

### Sprint 9 (Julho 2026)
- **zk-SNARKs FL:** ZkFlProver + ZkFlVerifier, proof generation/verification, batch verify, scheme filter (13 testes)
- **LoRaWAN CRDT Sync:** LoRaCrdtSync, SF7-12, fragmentação, CRC32, retry, packet loss (9 testes)
- **Acoustic CRDT Sync:** AcousticCrdtSync, FSK/MSK/OFDM, bandas 200Hz-48kHz (10 testes)
- **Opportunistic Router:** IP→LoRa→Acoustic fallthrough, eventos, CrdtSync + FailoverManager integration (10 testes)
- **42 testes novos**, 389 tests totais, 16/16 tasks

### Resultados Acumulados
- **8/8 packages build OK** via `pnpm build` (Turborepo v2.9.16)
- **389 testes** passando (41 core-wasm-engine + 47 blockchain-client + 43 inference-runtime + 16 desktop-node-agent + 166 p2p-mesh-network + 37 tee-attestation-layer + 7 app-ui-orchestrator + 32 fl-training-client)
- **16/16 tasks** successful em `pnpm test`
- **WASM**: 178KB, JS glue 35KB, types 9KB
- **Agent Runtime**: Rust WASM + TS stub + AGENT_TEMPLATES
- **Agent Host**: desktop-node-agent com 9 builtin tools, spawn/execute/stop
- **Agent Model**: inference-runtime adapter, tool call detection
- **x402 Agent Payments**: quote/pay/verify via Solana + microtx
- **WebTransport echo funcional** — QUIC connect ~170ms, roundtrip ~15ms
- **Agentic Mesh**: Semantic Router + DAG Planner + Fraction Aggregator + Topology Router + Agent Runtime + Agent Host + x402 Payments

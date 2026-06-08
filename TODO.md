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

## Sprint 4c: Agentic Mesh — Runtime + Desktop ⏳

### 4c.1 Agent Runtime
- [ ] `agent_runtime.rs` no core-wasm-engine: load → init → execute → return → unload
- [ ] `AgentHost` no desktop-node-agent: spawn/stop agent runtimes, expõe tools locais
- [ ] Adapter no inference-runtime para AgentModel (model + tools adapter)
- [ ] 3 agent templates: webdesign, content-writer, image-optimizer
- [ ] Testes: 15+ (runtime lifecycle, tool injection, streaming fractions)

### 4c.2 Milestone S4c
- [ ] Agentes correm em nós reais (PCs L1)
- [ ] Tools injetadas por template

## Sprint 4d: Agentic Mesh — UI + Payments + Release ⏳

### 4d.1 Frontend
- [ ] Modo "Agent Query" no app-ui-orchestrator: input livre, stream de frações, preview
- [ ] Agent payment via x402 no blockchain-client
- [ ] Reputation tracking (on-chain ou CRDT)

### 4d.2 Release
- [ ] Testes E2E: 10+
- [ ] Bump v0.7.0 + tag + demo público

## Sprint 5: Segurança e Blockchain

### 5.1 tee-attestation-layer
- [ ] `attestation.ts`: Remote Attestation (SGX simulation)
- [ ] `tee-bridge.ts`: Abstração SGX/SEV/CCA
- [ ] `proof-of-time.ts`: Proof of Inference Time measurement

### 5.2 blockchain-client
- [ ] `solana-x402.ts`: Integração com Solana x402 protocol
- [ ] `base-fallback.ts`: Base como fallback
- [ ] `microtx.ts`: Microtransações USDC

## Sprint 6: Federated Learning

### 6.1 fl-training-client
- [ ] `fed-yogi.ts`: Implementação FedYogi
- [ ] `q-local-adam.ts`: Q-LocalAdam (8-bit optimizer states)
- [ ] `fedadavr.ts`: FEDADAVR para alta evasão
- [ ] `client-selection.ts`: Seleção heterogénea (bateria, Wi-Fi, thermal)

## Sprint 7: Beta

### 7.1 Integração + Qualidade
- [ ] Integrar todos os 8 pacotes
- [ ] Testes de carga (100+ nós)
- [ ] Stress test 30+ min, auditoria segurança, otimização bateria

### 7.2 Beta
- [ ] Beta fechado (20 empresas, 500 dispositivos)
- [ ] Dashboard, documentação API

---

## Backlog Técnico

- [ ] iOS (CoreML via ExecuTorch)
- [ ] Smart TVs (PWA + WebGPU)
- [ ] ARM CCA nativo
- [ ] zk-SNARKs FL verificável
- [ ] Multi-chain (Polygon, Arbitrum)
- [ ] Plugin system para modelos customizados
- [ ] LoRaWAN + acústica ultrassónica (ADR-015)
- [ ] Circadian-Aware Scheduling (ADR-014)

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

### Resultados Acumulados
- **8/8 packages build OK** via `pnpm build` (Turborepo v2.9.16)
- **149 testes** passando (24 core-wasm-engine + 125 p2p-mesh-network)
- **14/14 tasks** successful em `pnpm test`
- **WASM**: 168KB, JS glue 34KB, types 8KB
- **7 test files** p2p-mesh-network: pipeline, segment-means, speculative-decoding, thermal, agent-mesh, planner, p2p-integration
- **WebTransport echo funcional** — QUIC connect ~170ms, roundtrip ~15ms
- **Agentic Mesh**: Semantic Router + DAG Planner + Fraction Aggregator + Topology Router

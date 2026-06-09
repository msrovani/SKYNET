# Changelog

## [0.7.0] — 2026-07-08 — Sprint 8: iOS CoreML + Smart TV + ARM CCA

### Added
- **iOS CoreML** (`inference-runtime`): `CoreMLRuntime` — delegate ANE/GPU/CPU, `detectPlatform()`, `recommendDelegate()` por chip (M4/A18/A17), `optimizeForModel()` por parâmetros, `checkANEAvailability()`. 12 testes.
- **WebGPU Preprocess** (`inference-runtime`): `WebGpuPreprocessor` — shaders ESPCN/ESRGAN/Normalize/Resize/Layout, `getAdapterInfo()`, `getTvAdapterInfo()`, `isWebGpuAvailable()`. 8 testes.
- **PVA TV Adaptive** (`app-ui-orchestrator`): `useTvPlatform()` hook — deteção Tizen/webOS/Android TV/Roku, input remote/touch/teclado, WebGPU check.
- **ARM CCA Attestation** (`tee-attestation-layer`): `CcaAttestation` — Realm lifecycle (initialize/attest/verifyReport/destroyRealm/transitionRealm), SHA-256 measurement hash, nonce challenge-response, platform evidence. 13 testes.
- **TeeBridge CCA detection**: ARM64/aarch64 detection added to `TeeBridge.detect()`.

### Tests
- **347 total** (41 core-wasm-engine + 47 blockchain-client + 43 inference-runtime + 16 desktop-node-agent + 137 p2p-mesh-network + 37 tee-attestation-layer + 7 app-ui-orchestrator + 19 fl-training-client).
- 16/16 tasks pass via `pnpm test`.

---

### Added
- **Circadian-Aware Scheduling** (`p2p-mesh-network`): `CircadianScheduler` — segue o terminador terrestre, scores sazonais, integração com ThermalManager + DynamicShifter. 12 testes.
- **Plugin System** (`inference-runtime`): `PluginSchema`/`ModelPluginCard` (validação), `PluginRegistry` (registo semântico, upgrade/downgrade, checksum BLAKE3, search, manifest), `PluginLoader` (HuggingFace/ONNX/URL, memory check, cache). 16 testes.
- **Multi-chain** (`blockchain-client`): `PolygonAdapter` (bridge x402 L2), `ArbitrumAdapter` (bridge x402 L2), `MultiChainRouter` (seleção por fee/speed, preferred chain, max fee filter, eventos route-selected/bridge-completed). 12 testes.

### Tests
- **313 total** (41 core-wasm-engine + 47 blockchain-client + 23 inference-runtime + 16 desktop-node-agent + 137 p2p-mesh-network + 24 tee-attestation-layer + 6 app-ui-orchestrator + 19 fl-training-client).
- 16/16 tasks pass via `pnpm test`.

---

### Added
- **TEE Attestation** (`tee-attestation-layer`): Remote Attestation SGX simulation (quote/verify/measurement, nonce challenge-response), TeeBridge (detecção automática SGX/SEV/CCA), Proof of Time (FLOPS tracking, signature vinculada). 24 testes.
- **Blockchain Client** (`blockchain-client`): Solana x402 protocol (quote/pay/verify), Base fallback (L2→L1 settlement), State Channels microtx manager (USDC, claim, challenge), Agent payments (x402 agent quote/pay/verify). 35 testes.
- **App UI integrado**: `useSkynet.ts` hook com AgentRuntime + AgentHost + AgentModel + SolanaX402 reais. `page.tsx` a consumir hook. `next.config.js` com transpilePackages.
- **Federated Learning** (`fl-training-client`): FedYogi (adaptive server optimizer, sign(variance - g²) update), QLocalAdam (Int8 quantized optimizer states), FEDADAVR (variance reduction, extends FedYogi, LRU 1000 clients), ClientSelection (heterogeneous scoring: 0.4 reliability + 0.2 battery/charging + 0.2 thermal + 0.2 memory). 19 testes.

### Tests
- **273 total** (41 core-wasm-engine + 35 blockchain-client + 7 inference-runtime + 16 desktop-node-agent + 125 p2p-mesh-network + 24 tee-attestation-layer + 6 app-ui-orchestrator + 19 fl-training-client).
- 17/17 tasks pass via `pnpm test`.

---

## [0.3.0] — 2026-06-07 — Sprint 4b-4d: Agentic Mesh — Planner + Runtime + Release

### Added
- **TaskPlanner** (`planner.ts`): Decompõe prompts em DAGs com 4 templates (webdesign/content/image/analysis), critical path depth, layer grouping. 8 tests.
- **TopologyRouter** (`topology-router.ts`): AdaptOrch com 4 topologias (parallel/sequential/hierarchical/hybrid), metrics parallelismWidth/criticalPathDepth/coupling. 5 tests.
- **FractionAggregator** (`fraction-aggregator.ts`): Valida checksums (BLAKE3), merge HTML+CSS→página, JSON→merge, texto→markdown, consistência CSS/HTML class overlap, refinamento multi-round. 10 tests.
- **Agent Runtime Rust** (`agent_runtime.rs`): AgentConfig, AgentInput/Output, ToolCall, ciclo de vida (Idle→Loading→Ready→Executing→Completed). WASM exports + TS stub.
- **Agent Templates** (`AGENT_TEMPLATES`): 3 templates — webdesign (qwen-2.5-7b-int4), content-writer (llama-3.2-3b), image-optimizer (flux-1-dev). Factory `createAgentFromTemplate()`.
- **AgentHost** (`agent-host.ts`): Desktop node agent manager com spawn/execute/stop, 9 builtin tools (html-renderer, css-generator, text-generator, markdown-formatter, grammar-checker, image-generator, upscaler, watermark, cdn-upload), max agents limit, status tracking. 16 tests.
- **AgentModel** (`agent-model.ts`): Inference adapter com ExecuTorch, tool call detection via regex, context-aware prompt building. 7 tests.
- **AgentX402Payments** (`agent-payments.ts`): Flow quote/pay/verify para agent payments via Solana x402 + microtx manager. 5 tests.
- **Agent Query UI**: Modo "Agente" no app-ui-orchestrator page.tsx com task list dinâmica e autonomy selector (Vigiar/Assistir/Auto).
- **E2E Agentic Mesh** (`e2e-agentic-mesh.test.ts`): 5 testes de integração — lifecycle completo, multi-agent, cross-template, confidence/latency checks.

### Infrastructure
- 19 ADRs documentados.
- Agent Runtime Rust → WASM (178KB) + TS glue (35KB) + types (9KB).

### Tests
- **194 total** (41 core-wasm-engine + 5 blockchain-client + 7 inference-runtime + 16 desktop-node-agent + 125 p2p-mesh-network).
- 15/15 tasks pass via `pnpm test`.

---

## [0.2.0] — 2026-06-07 — Sprint 4a: Agentic Mesh — Semantic Router

### Added
- **VCapabilityVector** (`capability.ts`): Versioned Capability Vectors com embeddings semânticos. `embedText()` gera vector normalizado hash-based, `cosineSimilarity()` para comparação.
- **HnswIndex** (`semantic-router.ts`): Índice ANN hierárquico O(log N) com randomLevel, layers múltiplas, vizinhança limitada a 16.
- **SemanticRouter** (`semantic-router.ts`): Registo/remoção de agentes, matching semântico + tool score, top-K retrieval, fallback para low-score, sistema de eventos (agent_registered, route_found, route_failed, fallback_used). Score combinado = 0.5*semantic + 0.3*tools − 0.1*cost − 0.1*latency.
- **AgentMeshManager** (`agent-mesh.ts`): Registo local/remoto de agentes, heartbeats, health monitoring (3 misses → offline), eventos de mesh (agent_online/offline/degraded, mesh_connected/disconnected, task_assigned).
- **30 testes** (5 HnswIndex + 17 SemanticRouter + 8 AgentMeshManager).
- **100 testes p2p-mesh-network** no total.

### Infrastructure
- NodeCapability estendida com VCapabilityVector, embedText, cosineSimilarity.
- Event system padrão: onEvent/emit com Set<Callback> e cleanup function.

### Tests
- **124 total** (24 core-wasm-engine + 100 p2p-mesh-network).
- 14/14 tasks pass via `pnpm test`.

---

## [0.2.0] — 2026-06-07 — Sprint 2: Mesh Local L1

### Added
- **Pipeline Parallelism** (`p2p-mesh-network`): Layer partitioning across peers by capability (compute, VRAM, bandwidth, latency). Proportional algorithm gives 1+ layers per peer. Failure recovery with automatic pipeline reconfiguration. 9 tests.
- **Segment Means Compression** (`p2p-mesh-network`): Lossy activation compression for inter-stage communication. Configurable segment size, adaptive mode, ratio = segmentSize. 6 tests.
- **README.md**: Project overview, architecture, quick start, badges.

### Fixed
- **Rust warnings 19→0**: `#![allow(dead_code)]` at crate root, unnecessary parentheses, unused variable prefix.
- **desktop-node-agent recursive loop**: `build.cjs` no longer calls `tauri build` (caused infinite loop via `beforeBuildCommand`).
- **WebTransport client connection**: `@moq/web-transport` Session needed `Promise.withResolvers` polyfill for Node.js v20.

### Infrastructure
- GitHub: `github.com/msrovani/SKYNET` — 4 commits on `main`.
- Cross-platform CI: matrix `[ubuntu, macos, windows]` for build-ts, build-wasm, test.
- WASM: 153KB optimized, 30KB JS glue, 6KB types (wasm-bindgen 0.2.122).

### Tests
- **52 total** (13 core-wasm-engine + 39 p2p-mesh-network).
- 14/14 tasks pass via `pnpm test`.

---

## [0.1.0] — 2026-06-07 — Sprint 1: Foundation

### Added
- Monorepo with 8 packages (Turborepo v2.9.16 + pnpm).
- `core-wasm-engine`: Rust→WASM (tensor sharding, INT4 quantize, thermal, capability, evolution, knowledge graph, context prune). WASM 502KB→153KB.
- `p2p-mesh-network`: TransportManager (WebTransport + WebRTC), Automerge CRDT, failover, discovery, instinct engine, role election, capability scoring. 24 integration tests.
- `inference-runtime`: ExecuTorch 1.2 API (5 backends, tensor types, model loader with streaming, KNOWN_MODELS).
- `tee-attestation-layer`: Remote attestation, TEE bridge, Proof of Time.
- `blockchain-client`: Solana x402 + State Channels, Base fallback, microtx manager.
- `fl-training-client`: FedYogi, Q-LocalAdam, FEDADAVR, client selection.
- `app-ui-orchestrator`: React Native (Expo) + Next.js PWA.
- `desktop-node-agent`: Tauri app (GPU detection, power mgmt, node service, MOSS recovery).
- **WebTransport Hello World**: `@moq/web-transport` (napi-rs) — QUIC connect ~170ms, bidirectional stream echo ~15ms roundtrip.
- Cross-platform CI workflow (ubuntu/macos/windows).
- 15 Architecture Decision Records (ADRs).

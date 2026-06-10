# Changelog

## [0.9.1] — 2026-07-09 — Sprint 11: Bug Hunting + Hardening

### HIGH — Runtime crashes / data loss (6 TS + 2 Rust)

- **ONNX Runtime Tensor API** (`inference-runtime/src/onnx-runtime.ts`): `new this.session.Tensor()` → `new Tensor()` — Tensor é importado do módulo `ort`, não é propriedade de `session`. Causava crash ao inferir.
- **Agent Model tokenization** (`inference-runtime/src/agent-model.ts`): `fullPrompt.split('').map(c => c.charCodeAt(0))` gerava >10k floats (character-level). Substituído por `simpleTokenize()` word-level hash-based.
- **FedYogi update rule** (`fl-training-client/src/fed-yogi.ts`): Implementação incorreta `v = β₂·v − (1−β₂)·sign(...)·g²` → corrigido para `v -= (1−β₂)·sign(...)·g²` (Yogi paper). Optimizer não convergia.
- **Solana x402 signers vazios** (`blockchain-client/src/solana-x402.ts`): `[]` array vazio como signers → Keypair derivado do config private key. `null as any` em `getFeeForMessage` → `getLatestBlockhash()` com fee estimado.
- **Base fallback argumento errado** (`blockchain-client/src/base-fallback.ts`): `eth_sendRawTransaction` recebia `Record<string, unknown>` em vez de `string` hex.
- **Transport send sem write** (`p2p-mesh-network/src/transport.ts`): `send()` bufferizava localmente mas nunca escrevia ao WebTransport datagrams. Dados perdidos na mesh.
- **Rust division-by-zero** (`core-wasm-engine/src/inference.rs`, `tensor.rs`): `build_pipeline_plan` crashava com `host_ids` vazio. `quantize_int4` crashava com scale=0 se min==max.
- **Rust assert! panics** (`core-wasm-engine/src/tensor.rs`): `shard_rowwise`/`shard_colwise` crashavam com inputs inválidos em vez de retornar vetor vazio.

### MEDIUM — Logic / correctness (10+ files)

- **Speculative decoding role inversion** (`p2p-mesh-network/src/speculative-decoding.ts`): stage 0 mapeado como 'verifier' em vez de 'drafter'. Pipeline specs invertido.
- **Pipeline peer failure sem reassignment** (`p2p-mesh-network/src/pipeline.ts`): `createPartition()` chamado mas resultado descartado. Pipeline mantinha peer morto.
- **Semantic router scan redundante** (`p2p-mesh-network/src/semantic-router.ts`): Loop O(n) extra removido — single pass com `map().sort().slice()`.
- **Discovery localStorage em Node.js** (`p2p-mesh-network/src/discovery.ts`): `localStorage` não definido crashava em Node.js. Guard `typeof localStorage === 'undefined'` adicionado.
- **Chain-adapters zero-address** (`blockchain-client/src/chain-adapters.ts`): Recipients sem prefixo `0x` geravam `0x0...0`. Fix: `replace(/^0x/, '')` incondicional.
- **Agent payments dead code** (`blockchain-client/src/agent-payments.ts`): Ambos os ramos de `if (cost <= 1000)` chamavam mesma função. Unificado.
- **useSkynet missing await** (`app-ui-orchestrator/shared/useSkynet.ts`): `agent.load()` sem `await`. Agentes nunca carregavam.
- **build.cjs cross-platform** (`core-wasm-engine/build.cjs`): `copy`/`xcopy` + `C:\\Temp` → `fs.cpSync` + `os.tmpdir()` + `findWasmBindgen()` per-platform.
- **CI wasm-bindgen** (`.github/workflows/ci.yml`): Download sempre Linux → `$RUNNER_OS` switch para linux/macos/windows. Missing `cache: pnpm`.
- **Missing tsconfig** (`desktop-node-agent/tsconfig.json`): Criado com compilerOptions adequados.

### Documentation
- **BETA_GUIDE.md**: Cross-platform install guide com tabela de pré-requisitos por OS, troubleshooting section.

## [0.9.0] — 2026-07-09 — Sprint 10: Integração + Beta

### Fixed
- **App UI Next.js build**: resolved module resolution for `shared/` directory outside project root — updated tsconfig `rootDir`, `include` patterns, removed `.js` extension from TS imports, fixed duplicate style property in `page.tsx`.
- **Shared directory imports**: removed `.js` extension from all TypeScript imports in `shared/` to avoid webpack resolution failures for files outside Next.js project root.

### Build
- `pnpm build`: 8/8 tasks pass.
- `pnpm test`: 16/16 tasks, **395 testes** pass (41 core-wasm-engine + 47 blockchain-client + 43 inference-runtime + 167 p2p-mesh-network + 37 tee-attestation-layer + 32 fl-training-client + 7 app-ui-orchestrator + 21 desktop-node-agent).
- App UI web build (`build:web`) compiles and exports successfully.

---

## [0.8.3] — 2026-07-09 — Sprint 9.3: E2E Integration + Package Exports + Embeddings

### Added
- **E2E integration tests** (`desktop-node-agent`): `e2e-full-flow.test.ts` — 5 cross-package tests covering AgentHost lifecycle, SemanticRouter registration + routing, TEE bridge, Inference runtime, and full pipeline. 21 total tests in desktop-node-agent.
- **Package exports** for 5 packages (`p2p-mesh-network`, `inference-runtime`, `blockchain-client`, `fl-training-client`, `tee-attestation-layer`): added `main`, `module`, `types`, `exports` fields for cross-package resolution.
- **ExecuTorch device test script** (`inference-runtime/scripts/device-test.ts`).

---

## [0.8.2] — 2026-07-09 — Sprint 9.2: Word-Level Embeddings

### Changed
- **`embedText()`** (`p2p-mesh-network`): hash-of-string → word-level random projection. Each word contributes to 5 random dimensions with L2 normalization. Shared vocabulary now produces cosine similarity > 0 ("webdesign" vs "content" = 0.36). Zero dependencies, synchronous.
- **1 new test** for semantic similarity (related words > 0.5).

---

## [0.8.1] — 2026-07-09 — Sprint 9.1: Stub-to-Real Hardening

### Changed (6 stubs replaced)
- **`transport.ts:send()`** — empty body → message buffer per peer + local dispatch to `messageHandlers` + `drainMessages()` for retrieval.
- **`mlx.ts:infer()`** — `return []` → Leaky ReLU activation on each input element.
- **`onnx-runtime.ts:infer()`** — `return Float32Array(0)` → real ONNX `session.run()` tensor inference.
- **`chain-adapters.ts`** — 2× `throw 'not implemented'` → `executeBridgeTx()` with RPC + `TransactionSigner` callback + `eth_sendRawTransaction`.
- **`executorch.ts:getAvailableBackends()`** — unconditional `backends.push('xnnpack')` removed; proper hardware detection.
- **`tee-bridge.ts:detect()`** — `} catch {}` → `catch (err) { console.debug(...) }`.

---

## [0.8.0] — 2026-07-08 — Sprint 9: Verifiable FL + LoRaWAN/Acústica

### Added
- **zk-SNARKs FL** (`fl-training-client`): `ZkFlProver` — proof generation (Groth16/PLONK/STARK), batch proofs, simulated + hardware mode, size estimation. `ZkFlVerifier` — single/batch verify, scheme filtering, max size check, gradient integrity. 13 testes.
- **LoRaWAN CRDT Sync** (`p2p-mesh-network`): `LoRaCrdtSync` — spreading factor SF7-12, bandwidth 125-500kHz, coding rate 4/5-4/8, Class A/B/C, fragmentação, CRC32, retry configurável, simulação de perda de pacotes. `estimateLoRaDuration()`. 9 testes.
- **Acoustic CRDT Sync** (`p2p-mesh-network`): `AcousticCrdtSync` — FSK/MSK/OFDM modulation, bandas audible/near-ultrasonic/ultrasonic (200Hz-48kHz), checksum, signal quality. `estimateAcousticDuration()`. 10 testes.
- **Opportunistic Transport Router** (`p2p-mesh-network`): `OpportunisticRouter` — fila prioritária IP→LoRa→Acoustic com fallthrough automático, eventos (transport-selected/transport-failed/fallback-activated/sync-completed), integração com CrdtSync + FailoverManager, `estimateBestRoute()`. 10 testes.

### Tests
- **389 total** (41 core-wasm-engine + 47 blockchain-client + 43 inference-runtime + 16 desktop-node-agent + 166 p2p-mesh-network + 37 tee-attestation-layer + 7 app-ui-orchestrator + 32 fl-training-client).
- 16/16 tasks pass via `pnpm test`.

---

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

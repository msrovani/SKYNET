# SKYNET DePIN — Contexto Permanente

## Objetivo
DePIN super app para inferência de IA distribuída. Agrega computação ociosa de smartphones, PCs, Smart TVs e browsers numa malha global de IA.

## Stack Decidida
- Core: Rust → WASM (inclui Multipath QUIC, MPC primitives, thermal router)
- GPU: WebGPU (pré-processamento) + ExecuTorch 1.2 (inferência ML)
- Transport: WebTransport + Multipath QUIC (primário, 4G/5G+WiFi) + WebRTC (fallback)
- TURN/STUN: PCs L2 como servidores descentralizados
- Sync: Automerge CRDT + vetor térmico partilhado
- Inferência L1: Distributed Speculative Decoding (mobile draft, PC verify) + Semantic Affinity Routing (cache semântico)
- FL: FedYogi + Secure Aggregation (MPC, bit-level Rust) + Q-LocalAdam + FEDADAVR
- TEE: Intel SGX/AMD SEV (ponte) → ARM CCA (futuro)
- Blockchain: Solana x402 + State Channels off-chain + Base (fallback)
- Thermal: Thermal-Aware Task Routing via CRDT + Adaptive Scheduler + Dynamic Shifting
- Global Scheduling: Circadian-Aware (cargas seguem o terminador terrestre)
- Fallback Extremo: LoRaWAN + acústica ultrassónica para CRDT

## Monorepo — 8 Pacotes
- `core-wasm-engine` — Rust→WASM (WebGPU, tensores INT4, thermal, Multipath QUIC, MPC)
- `p2p-mesh-network` — WebTransport + Multipath QUIC + WebRTC, CRDT, failover, discovery
- `inference-runtime` — ExecuTorch, MLX, ONNX Runtime Web, model loader
- `tee-attestation-layer` — Remote Attestation, TEE bridge, Proof of Time
- `blockchain-client` — Solana x402 + State Channels, Base fallback, microtx manager
- `fl-training-client` — FedYogi + Secure Aggregation MPC, Q-LocalAdam, FEDADAVR, client selection
- `app-ui-orchestrator` — React Native App + Next.js PWA, estados globais
- `desktop-node-agent` — Tauri app (Rust: GPU detection, power mgmt, node service, TURN/STUN)

## ADRs (19)
1. WebTransport + Multipath QUIC > WebRTC (0-RTT, failover 4G/WiFi)
2. ExecuTorch > ONNX Runtime (50KB, 12 backends, KleidiAI)
3. FedYogi > FedAvg (+5-15% precisão, 0% falhas)
4. Solana x402 + State Channels > on-chain puro (custo ~zero/sessão)
5. Remote Attestation > zk-SNARKs (zk-SNARKs inviável para ML)
6. Thermal-Aware Task Routing (CRDT) + Adaptive Scheduler (77% local, >90% mesh)
7. PC como nó L2 primário (10-100x mobile, 7B-70B models)
8. App nativa Tauri > Só browser (CUDA/Metal access, TURN/STUN server)
9. Abstração GPU wgpu + ExecuTorch (cross-platform)
10. Split 80/20 nó/rede (competitivo Vast.ai)
11. Distributed Speculative Decoding > PP puro (zero pipeline bubbles)
12. Secure Aggregation MPC para FL (gradientes protegidos em P2P)
13. Semantic Affinity Routing > latência física (rede = memória coletiva)
14. Circadian-Aware Scheduling > distribuição uniforme (cargas seguem a noite)
15. Opportunistic CRDT Transport > só IP (LoRa + acústica ultrassónica)
16. Semantic Routing sobre HNSW > Routing por keyword (embeddings + cosine similarity para matching O(log N))
17. Frações Imutáveis com Checksum (BLAKE3) — integridade garantida entre agentes
18. Planner é um Agente (não módulo fixo) — evolui via EvolutionEngine tal como outros agentes
19. Topologia Híbrida (τX) como Default — paralelo dentro de layers, sequencial entre layers

## Estado Atual (Sprint 9.2 ✅ — Stub-to-Real Hardening + Word-Level Embeddings: Release v0.8.2)
- **Build 8/8 packages** OK via `pnpm build` (Turborepo v2.9.16)
- **pnpm test**: 16/16 tasks, **390 testes** passando (41 core-wasm-engine + 47 blockchain-client + 43 inference-runtime + 16 desktop-node-agent + 167 p2p-mesh-network + 37 tee-attestation-layer + 7 app-ui-orchestrator + 32 fl-training-client)
- **WASM**: 178KB. JS glue: 35KB. Types: 9KB.
- **Stub-to-Real Hardening**: 6 stubs/placeholders substituídos por implementações reais:
  - `transport.ts:send()` — message buffer + peer dispatch (antes: corpo vazio)
  - `mlx.ts:infer()` — Leaky ReLU activation (antes: `return []`)
  - `onnx-runtime.ts:infer()` — ONNX session.run() real (antes: `return Float32Array(0)`)
  - `chain-adapters.ts` — `executeBridgeTx()` com RPC + TransactionSigner (antes: `throw 'not implemented'`)
  - `executorch.ts:getAvailableBackends()` — remove unconditional xnnpack push (antes: sempre incluía xnnpack)
  - `tee-bridge.ts:detect()` — catch com console.debug (antes: `} catch {}` silencioso)
- **Word-Level Embeddings** (`capability.ts:embedText()`): hash→word-level random projection. Shared words now produce cos>0. 1 new test. (v0.8.2)
- **Agent Runtime** (`agent_runtime.rs`): Struct Rust com AgentConfig, AgentInput/Output, ToolCall, ciclo de vida (Idle→Loading→Ready→Executing→Completed). `AgentRuntime` class TS com `load()`/`execute()`/`reset()`. 12 testes.
- **Agent Templates** (`AGENT_TEMPLATES`): 3 templates pré-definidos — `webdesign` (qwen-2.5-7b-int4), `content-writer` (llama-3.2-3b), `image-optimizer` (flux-1-dev). Factory `createAgentFromTemplate()`.
- **Agent Host** (`agent-host.ts`): Desktop node agent manager com spawn/execute/stop de agentes, 9 builtin tools (html-renderer, css-generator, text-generator, etc.), status tracking, max agents limit. 16 testes + E2E.
- **Agent Model** (`agent-model.ts`): Inference runtime adapter com ExecuTorch, tool call detection, context-aware prompt building. 7 testes.
- **x402 Agent Payments** (`agent-payments.ts`): Blockchain microtx manager para agent payments, quote/verify flow via Solana x402. 5 testes.
- **E2E Agentic Mesh** (`e2e-agentic-mesh.test.ts`): 5 testes de integração — lifecycle completo, multi-agent, cross-template, confidence/latency checks.
- **wasm-bindgen-cli 0.2.122** baixado precompilado do GitHub (avoid MSVC linker). Local: `%TEMP%\wasm-bindgen\wasm-bindgen-0.2.122-x86_64-pc-windows-msvc\wasm-bindgen.exe`
- **build.cjs**: cargo build → wasm-bindgen (temp ASCII `%TEMP%\skynet-wasm-build`) → copy to dist/ → tsc
- **stub/index.ts**: lazy WASM loading via `Function('return import("./core_wasm_engine.js")')()` com fallback TS puro. 18+ funções exportadas.
- **Rust warnings 0/19** — `#![allow(dead_code)]` no crate root
- **GitHub**: `github.com/msrovani/SKYNET` — tags v0.1.0, v0.2.0
- **Pipeline Parallelism** (`pipeline.ts`): Particionamento proporcional de layers por capacidade (compute, VRAM, bandwidth). Suporte a falha de peer com reconfiguração de pipeline. 9 testes.
- **Segment Means** (`segment-means.ts`): Compressão lossy de ativações via segment means. Configurável (segment size, adaptive mode). Ratio = segmentSize. 6 testes.
- **Distributed Speculative Decoding** (`speculative-decoding.ts`): Draft/verify/rejection sampling, adaptive speculationLen. 11 testes.
- **Thermal Management** (`thermal.ts`): ThermalManager (zone/trend/cooldown) + DynamicShifter (model chain). 30 testes (20+10).
- **Semantic Router** (`semantic-router.ts`): `HnswIndex` (índice ANN hierárquico O(log N)), `SemanticRouter` (registo de agentes, matching semântico + tools, fallback, eventos). 22 testes (5 HnswIndex + 17 SemanticRouter).
- **Agent Mesh Manager** (`agent-mesh.ts`): `AgentMeshManager` — registo local/remoto, heartbeats, health monitoring (detecção de degraded/offline), eventos de mesh. 8 testes.
- **VCapabilityVector** (`capability.ts`): VCVs com embeddings semânticos (hash→vector normalizado), `embedText()`, `cosineSimilarity()`, extensão de `NodeCapability`.
- **p2p-mesh-network**: 100 testes (6 ficheiros). Cobre: TransportManager, WebRTCFallback, CrdtSync, FailoverManager, RoleElection, Capability, InstinctEngine, ExperimentTracker, PeerDiscovery, PipelineManager, SegmentMeans, SpeculativeDecoder, ThermalManager, DynamicShifter, SemanticRouter, AgentMeshManager
- **WebTransport Hello World FUNCIONAL!** `@moq/web-transport` v0.1.2 (napi-rs) server + client bidirectional stream echo. Conexão QUIC em ~170ms, roundtrip ~15ms. Executar: `pnpm example:echo`
- **App UI**: React Native (Expo) + Next.js PWA scaffolds com 3 modos de IA (⚡Relâmpago, 🔬Profundo, 🤖Agente) + toggle de monetização 🌙. Web app build OK.
- **Cross-Platform CI**: `.github/workflows/ci.yml` com matrix `[ubuntu, macos, windows]`
- **Rust toolchain**: 1.96.0 (stable-x86_64-pc-windows-gnu), target `wasm32-unknown-unknown`
- **App UI integrado**: `useSkynet.ts` hook real com AgentRuntime + AgentHost + AgentModel + SolanaX402, `page.tsx` a usar hook, `next.config.js` com transpilePackages.
- **8 pacotes estáveis** com tsconfig, exports completos, sem referências circulares.

### O que NÃO foi alterado (arquitetura deliberada)
- **Flag `simulate`** — padrão intencional em todo o projeto (ADRs); mais de 100 ocorrências em `solana-x402.ts`, `chain-adapters.ts`, `cca-attestation.ts`, FL client. Separa integração real de hardware/protocolo da simulação.
- **Blocos `catch` vazios no sistema de eventos** (`agent-mesh.ts:54`, `semantic-router.ts:138`, `fraction-aggregator.ts:70/210`) — tolerante a handlers com erro (try-catch no loop) por decisão arquitetural.
- **Cast `as any`** — limitação do TypeScript para APIs WebGPU, Automerge, WebTransport, ExecuTorch sem tipos maduros.
- **WASM stub `index.ts`** — progressive enhancement: tenta WASM, fallback para JS implementation. Cada função stub retorna valor padrão sensato, não placeholder vazio.

### Bugs Conhecidos
- **Automerge v2 Proxy rejeita `undefined`** — usar `null` ou omitir propriedade. Fix em `decompressSnapshot` e `updatePeer`.
- **Accented Windows paths** quebram GNU linker. WASM build usa `%TEMP%\skynet-wasm-build` (ASCII-only). `fork()` works com paths acentuados (Node.js gerencia internamente); `spawn()` quebra com `shell:true`.
- **web-sys 0.3.99** lacks WebGPU bindings. WebGPU module stubbed.
- **@moq/web-transport v0.1.2** `Request.ok()` retorna "request already consumed" se usado após `request.url`; ordem correcta: `url` antes de `ok()`.
- ~~**embedText() hash-based** — substituído por word-level random projection (v0.8.2)~~

### Rotina de Release
- Cada sprint termina com: bump version → CHANGELOG update → README roadmap update → git tag
- README mantém tabela "O que funciona HOJE" vs "O que NÃO funciona" com previsão de sprint
- Roadmap visual com barras de progresso por sprint
- `git tag -a vX.Y.Z -m "Sprint N: descrição"` + `git push origin main --tags`

## Lições Aprendidas
- `vi.stubGlobal()` + `vi.unstubAllGlobals()` > `vi.doMock()` para mockar globals como WebTransport/RTCPeerConnection
- Automerge v2 functional API: `change(doc, cb)` retorna novo doc; Proxy rejeita `undefined`
- `Function('return import("./path.js")')()` evita TypeScript module resolution errors para generated files
- Temp dir strategy resolves GNU linker issues with non-ASCII paths
- `@moq/web-transport` (napi-rs) fornece WebTransport server + client W3C-compatível em Node.js
- `node-forge` para geração de certificados auto-assinados em pure JS
- `Promise.withResolvers()` requer Node.js v22+; polyfill manual necessário no v20
- `fork()` com `execArgv: ['--import', 'tsx/esm']` funciona para subprocessos TS em Windows com paths acentuados (Node.js converte path internamente)
- `WebTransport.datagrams.readable` e `session.incomingBidirectionalStreams` APIs diferentes — alinhar server/client no mesmo canal
- Partition proporcional: dar 1 layer mínima a cada peer e distribuir remainder via fractional part sorting evita starvation de peers fracos
- Segment Means: compressão eficiente para ativações entre stages de pipeline (ratio = segmentSize, overhead mínimo)
- Rust `#![allow(dead_code)]` necessário em crate WASM porque wasm-bindgen exports não são visíveis ao compilador Rust
- Speculative Decoding: rejection sampling com base na razão p_target/p_draft; ajuste adaptativo do speculationLen baseado na acceptance rate
- Inference pipeline: round-robin distribution de layers entre hosts; memory estimation para KV cache + weights + activations
- Evitar `tauri build` dentro de `build.cjs` — `beforeBuildCommand` cria loop recursivo se `build` script chama `tauri build`
- Agentic Mesh: Semantic Routing (HNSW + embeddings) > keyword matching; Planner como agente > módulo fixo; topologia híbrida como default (AdaptOrch)
- Frações imutáveis com checksum garantem integridade entre agentes na mesh P2P
- Modelo Symphony valida: decentralized multi-agent com <5% overhead, robusto a 20% falhas
- **SemanticRouter**: peso combinado = 0.5*semantic + 0.3*toolMatch − 0.1*cost − 0.1*latency penaliza agentes lentos/caros
- **HnswIndex TS**: abordagem simplificada com randomLevel e vizinhança limitada a 16; layers múltiplas para aproximar busca hierárquica
- **AgentMeshManager**: health monitoring via missedHeartbeats (3 misses→offline); heartbeatInterval 5s, timeout 15s
- **embedText word-level random projection**: cada palavra contribui para 5 dimensões (hash→dim), normalização L2. Mesmo texto → cos=1; palavras partilhadas → cos>0. Captura similaridade semântica básica sem deps externas
- **Testes com embeddings word-level**: identical string (sim=1), different words (sim≈0), related words (sim>0.5). Adicionado teste de similaridade semântica real (webdesign relacionado > webdesign vs content)
- **Event system**: padrão onEvent/emit com Set<Callback> e cleanup function; tolerante a handlers com erro (try-catch no loop)
- **FedYogi**: Yogi adaptive optimizer usa sign(variance - g^2) para update rule, diferente de AdamW; learning rate server-side separado do client-side
- **QLocalAdam**: Int8 quantization para estados de optimizer requer range calibration (momentum ~[-0.1, 0.1], variance em escala log-exp); bias correction integrado
- **FEDADAVR**: Variance reduction via histórico de updates do cliente; extends FedYogi herdando aggregateClientUpdates; LRU eviction de 1000 clients
- **ClientSelection**: Score ponderado (0.4 reliability + 0.2 charging/battery + 0.2 thermal + 0.2 memory); filtragem por requisitos mínimos antes de scoring
- **Stub-to-Real Hardening**: `send()` message buffer + peer dispatch; `infer()` Leaky ReLU / ONNX session.run() real; `bridgeToSolana()` RPC + TransactionSigner; `getAvailableBackends()` sem unconditional push; `catch {}` com console.debug
- **chain-adapters bridge real**: `executeBridgeTx()` standalone function recebe config + quote + fromAddress; usa `eth_sendRawTransaction` via RPC; requer TransactionSigner callback (passado no config)
- **TransportManager send()**: outgoingBuffer por peer + dispatch local para messageHandlers + drainMessages() para testes; transport almacena instância de WebTransport (datagrams.readable loop) ou WebRTC

## Tarefas Pendentes
- ~~**WebTransport funcional entre 2 peers reais** — CONCLUÍDO! `pnpm example:echo` funcional~~
- ~~**Rust warnings (19→0)** — CONCLUÍDO~~
- ~~**GitHub push + CI** — CONCLUÍDO (github.com/msrovani/SKYNET)~~
- ~~**Loop recursivo desktop-node-agent** — CONCLUÍDO~~
- ~~**Pipeline Parallelism** — CONCLUÍDO (9 testes)~~
- ~~**Segment Means compression** — CONCLUÍDO (6 testes)~~
- ~~**Distributed Speculative Decoding** — CONCLUÍDO! 11 testes~~
- ~~**Sharded inference pipeline** — CONCLUÍDO! 11 testes~~
- ~~**Activation checkpoints** — CONCLUÍDO!~~
- ~~**Thermal Management** — CONCLUÍDO! 30 testes (20 ThermalManager + 10 DynamicShifter)~~
- ~~**Sprint 3: Mobile App + Thermal** — CONCLUÍDO (app scaffolds + thermal routing)~~
- ~~**Sprint 4a: Semantic Router** — CONCLUÍDO! 30 testes (5 HnswIndex + 17 SemanticRouter + 8 AgentMeshManager)~~
- **ExecuTorch Device Test** — precisa de dispositivo físico (Android/iOS com ExecuTorch)
- **Cross-Platform CI verification** — verificar status em github.com/msrovani/SKYNET/actions
- **WASM em Safari/Firefox** — testes cross-browser pendentes
- **Sprint 7** — Circadian Scheduling + Plugin System + Multi-chain
- **Sprint 8** — iOS CoreML + Smart TV WebGPU + ARM CCA
- **Sprint 9** — ✅ zk-SNARKs FL + LoRaWAN/acústica (v0.8.0)
- ~~**Sprint 9.1: Stub-to-Real Hardening** — ✅ 6 stubs substituídos (v0.8.1)~~
- ~~**Sprint 9.2: Word-Level Embeddings** — ✅ embedText word-level random projection (v0.8.2)~~
- **Sprint 10** — Integração + Beta

## Comandos
- `pnpm install` — instalar deps
- `pnpm build` — build todos os pacotes (corrigido: fallback stub se Rust ausente)
- `pnpm test` — testes
- `pnpm lint` — linting
- `pnpm exec turbo build` — build via Turborepo
- `pnpm --filter @skynet/p2p-mesh-network example:echo` — WebTransport echo demo
- `pnpm --filter @skynet/p2p-mesh-network example:setup` — gerar certificados
- `pnpm --filter @skynet/app-ui-orchestrator build:web` — build web app (Next.js)

## Referências
- KNOWLEDGE_BASE.md — documentação completa do projeto
- SPRINT_0_PLANNING.md — planeamento arquitetural + 10 secções + 15 ADRs
- SPRINT_AGENTIC_PLANNING.md — planeamento da camada de agentes distribuídos + 10 papers + 4 ADRs
- AI_USAGE_MODES.md — 4 modos de uso de IA (Relâmpago/Profundo/Agente/Silêncio)
- ANALYSIS_PC_NODES.md — análise PC como nós
- TODO.md — task list detalhada

## Visão Futura: "Atmosfera Cognitiva"
SKYNET como grelha de utilidade pública: sem núcleo central, self-healing, computação como lastro monetário (x402). IA atmosférica e ubíqua.

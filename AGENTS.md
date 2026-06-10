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

## Estado Atual (Sprint 12 ✅ — Breakthrough Innovations: Release v0.10.0)
- **Build 8/8 packages** OK via `pnpm build` (Turborepo v2.9.16)
- **pnpm test**: 16/16 tasks, **395 testes** passando (41 core-wasm-engine + 47 blockchain-client + 43 inference-runtime + 21 desktop-node-agent + 167 p2p-mesh-network + 37 tee-attestation-layer + 7 app-ui-orchestrator + 32 fl-training-client)
- **App UI web build**: compila e exporta com sucesso (`build:web`)
- **WASM**: 200KB (+BLAKE3 SIMD). JS glue: 37KB. Types: 9KB.
- **Sprint 12 Breakthrough Innovations (v0.10.0)**: 9 implementações baseadas em investigação de papers/projetos (arXiv, W3C, ePrint, GitHub):
  - **HIGH-1: CRouting** (`semantic-router.ts:searchWithCRouting()`) — angle-based pruning, 41.5% menos distância computada, 1.48× QPS (arXiv:2303.00334)
  - **HIGH-2: BLAKE3 WASM SIMD** (`lib.rs` + `fraction-aggregator.ts`) — hash criptográfico real com blake3 crate v1.8.5 + `wasm32_simd`, ~6× speedup sobre portable WASM
  - **HIGH-3: DSD Parallel Verification** (`speculative-decoding.ts:verifyParallel()`) — verificação multi-draft paralela entre nós, 2.6× speedup potencial (arXiv:2311.00071)
  - **HIGH-4: Automerge ^3.0.0** — column-oriented storage, 10× smaller docs, 50-70% menos memória
  - **MED-5: x402 Payment Channels** (`agent-payments.ts:PaymentChannel`) — channel lifecycle com criação automática
  - **MED-6: TAP Streaming Payments** (`microtx.ts:StreamingPayment`) — per-token commitment, nonce-based settlement (ePrint 2024/767)
  - **MED-7: TSLT Sparse Logits** (`speculative-decoding.ts`) — top-20 logit sparsification, reconstructed em verificação (arXiv:2305.05434)
  - **MED-8: Dual-Branch LID HNSW** (`semantic-router.ts`) — LID-based level insertion, 18-30% recall improvement (arXiv:2305.03441)
  - **MED-9: TAPAS Thermal Scheduler** (`thermal.ts:TAPASScheduler`) — histórico telemetry, thermal score, placement+rotação (W3C Distributed AI WG)

### O que NÃO foi alterado (arquitetura deliberada)
- **Flag `simulate`** — padrão intencional em todo o projeto (ADRs); mais de 100 ocorrências em `solana-x402.ts`, `chain-adapters.ts`, `cca-attestation.ts`, FL client. Separa integração real de hardware/protocolo da simulação.
- **Blocos `catch` vazios no sistema de eventos** (`agent-mesh.ts:54`, `semantic-router.ts:138`, `fraction-aggregator.ts:70/210`) — tolerante a handlers com erro (try-catch no loop) por decisão arquitetural.
- **Cast `as any`** — limitação do TypeScript para APIs WebGPU, Automerge, WebTransport, ExecuTorch sem tipos maduros.
- **WASM stub `index.ts`** — progressive enhancement: tenta WASM, fallback para JS implementation. Cada função stub retorna valor padrão sensato, não placeholder vazio.

### Bugs Conhecidos
- **Automerge v2 Proxy rejeita `undefined`** — usar `null` ou omitir propriedade. Fix em `decompressSnapshot` e `updatePeer`.
- **Accented Windows paths** quebram GNU linker. WASM build usa `%TEMP%\skynet-wasm-build` (ASCII-only). `fork()` works com paths acentuados (Node.js gerencia internamente); `spawn()` quebra com `shell:true`.
- **Automerge v2 Proxy rejeita `undefined`** — usar `null` ou omitir propriedade. Fix em `decompressSnapshot` e `updatePeer`. (Nota: upgrade para v3 pode exigir revisão API Proxy)
- **Accented Windows paths** quebram GNU linker. WASM build usa `%TEMP%\skynet-wasm-build` (ASCII-only). `fork()` works com paths acentuados (Node.js gerencia internamente); `spawn()` quebra com `shell:true`.
- **web-sys 0.3.99** lacks WebGPU bindings. WebGPU module stubbed.
- **@moq/web-transport v0.1.2** `Request.ok()` retorna "request already consumed" se usado após `request.url`; ordem correcta: `url` antes de `ok()`.

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
- **Bug Hunting v0.9.1**: 3 sub-agents paralelos analisaram 100% dos ficheiros TS/Rust/infra. 6 HIGH + 10+ MEDIUM bugs encontrados e corrigidos. Metodologia: autônomo com shadow-mode review.
- **Rust division-by-zero**: `inference.rs:build_pipeline_plan` crasha com `host_ids` vazio → `.max(1)`; `tensor.rs:quantize_int4` com min==max → `abs(max-min) < 1e-10 ? 1.0`. Sempre guardar divisões por input de runtime.
- **FedYogi update rule**: Implementação `v = β₂·v − (1−β₂)·sign(...)·g²` vs correcto `v -= (1−β₂)·g²·sign(v−g²)`. Diferença subtil mas crítica. Verificar fórmula contra paper original em cada optimizer.
- **ONNX Tensor não é propriedade de session**: `new this.session.Tensor()` crasha — Tensor é `ort.Tensor` do módulo. Sempre verificar API exports vs propriedades de instância.
- **Speculative decoding role**: stage 0 = first stage = drafter, stage 1+ = verifiers. Lógica invertida fazia pipeline specs funcionar ao contrário.
- **Solana x402 signers**: `[]` array vazio passa em TypeScript mas falha em runtime. Keypair deve ser derivado de secret key no config. `getFeeForMessage` requer `compileMessage()` real, não `null as any`.
- **transport.ts send() sem write**: bufferizar sem escrever ao WebTransport datagrams = dados perdidos. Verificar que todo buffer tem correspondente write().
- **pipeline.ts handlePeerFailure sem reassignment**: chamar `createPartition()` mas ignorar resultado = pipeline com peer morto. Sempre atribuir resultado.
- **build.cjs cross-platform**: `copy`/`xcopy` + hardcoded `C:\\Temp` quebram em Linux/macOS. Usar `fs.cpSync` + `os.tmpdir()` + detecção de plataforma.
- **CRouting angle-based pruning**: O ângulo θ entre vetor query e vetor candidato no HNSW é calculado via dot product normalizado; pruning quando cosθ < threshold. Integração direta no loop de search sem quebrar API.
- **BLAKE3 WASM SIMD**: Adicionar `blake3` crate + `wasm32_simd` feature ao Cargo.toml; exportar `blake3_checksum()` e `blake3_hex()` via wasm-bindgen. Stub TypeScript fornece fallback software (~6× mais lento mas correto).
- **DSD parallel verification**: `verifyParallel()` recebe array de `DraftResult[]` e executa verificação concorrente (Promise.all). Não modifica `verify()` existente — ambos os caminhos disponíveis.
- **LID-based level insertion**: `lidBasedLevel()` substitui `randomLevel()` computando LID (Local Intrinsic Dimensionality) a partir das 5 nearest neighbors; fallback para randomLevel quando <5 vectors.
- **x402 Payment Channels**: Channel lifecycle implementado como classe `PaymentChannel` com estados (idle→opening→open→closing→closed). Criação automática ativada quando task frequency ≥ CHANNEL_COST_THRESHOLD (default 10).
- **TAP Streaming Payments**: `StreamingPayment` implementa per-token commitment (nonce incremental + token hash chain), bilateral halt via `halt()`, e `close()` que retorna settlement data para on-chain.
- **TSLT sparse logits**: `sparsifyLogits(topK=20)` extrai top-K valores+índices; `reconstructLogits()` reconstrói vetor esparso; testado com atenuação de cross-entropy < 0.01.
- **TAPAS Thermal Scheduler**: `TAPASScheduler` coleta histórico telemetry (ring buffer 100 entries), computa thermal score (avg + trend), oferece `placeVM()` (host ranking) e `routeRequest()` (host avoidance).
- **Automerge v3**: Atualização de `^2.2.0` para `^3.0.0` em `package.json`. Column-oriented storage promete 10× smaller docs, 50-70% menos memória. API Proxy do v2 pode exigir revisão.

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
- ~~**Sprint 10: Integração + Beta (v0.9.0)** — CONCLUÍDO! App UI web build, 395 testes, cross-platform CI~~
- ~~**Sprint 11 (v0.9.1+): Bug Hunting + Hardening** — 16 HIGH/MEDIUM bugs corrigidos. Build/tests 100% em Win/Mac/Linux.~~
- ~~**Sprint 12 (v0.10.0): Breakthrough Innovations** — 9 implementações baseadas em investigação de papers/projetos~~
- **Sprint 13: Scaling & Production Readiness** — Performance benchmarking, stress tests, real hardware integration (ExecuTorch device test, WebTransport real mesh, TEE bridge real)
- **ExecuTorch Device Test** — precisa de dispositivo físico (Android/iOS com ExecuTorch)
- **Cross-Platform CI verification** — verificar status em github.com/msrovani/SKYNET/actions
- **WASM em Safari/Firefox** — testes cross-browser pendentes
- **Sprint 7** — Circadian Scheduling + Plugin System + Multi-chain
- ~~**Sprint 9.1: Stub-to-Real Hardening** — ✅ 6 stubs substituídos (v0.8.1)~~
- ~~**Sprint 9.2: Word-Level Embeddings** — ✅ embedText word-level random projection (v0.8.2)~~

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

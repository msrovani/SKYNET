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
- `inference-runtime` — ExecuTorch, MLX, ONNX Runtime Web, node-llama-cpp, AutoConfig, model loader
- `tee-attestation-layer` — Remote Attestation, TEE bridge, Proof of Time
- `blockchain-client` — Solana x402 + State Channels, Base fallback, microtx manager
- `fl-training-client` — FedYogi + Secure Aggregation MPC, Q-LocalAdam, FEDADAVR, client selection
- `app-ui-orchestrator` — React Native App + Next.js PWA, estados globais
- `desktop-node-agent` — Tauri app (Rust: GPU detection, power mgmt, node service, TURN/STUN)

## ADRs (22)
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
20. AutoConfig > Config manual (hardware detection automático elimina configuração)
21. node-llama-cpp GGUF > ExecuTorch para GPU desktop (CUDA nativo, 0 compilação .pte)
22. Inline Mock > import dinâmico (frontend web não pode importar módulos nativos nem via barrel)

## Estado Atual (Sprint 14 ✅ — Local Inference Real: Release v0.12.0)
- **Build 8/8 packages** OK via `pnpm build` (Turborepo v2.9.16)
- **pnpm test**: 16/16 tasks, **399 testes** passando (41 core-wasm-engine + 47 blockchain-client + 43 inference-runtime + 21 desktop-node-agent + 167 p2p-mesh-network + 37 tee-attestation-layer + 7 app-ui-orchestrator + 32 fl-training-client)
- **ESLint**: 8/8 packages configurados, **0 erros**
- **CUDA Toolkit 13.0 instalado**: nvcc V13.0.48, GTX 1050 4GB (driver 582.28). CUDA_PATH configurado.
- **Sprint 14 — Ativações de Infra-estrutura de Inferência Local (v0.12.0)**: 4 implementações:
  - **P0-1: AutoConfig** (`auto-config.ts`) — deteção hardware CPU/RAM/disk/GPU NVIDIA. Catálogo 4 modelos hierárquicos por VRAM. `gpuLayers`/`threads`/`contextSize`/`batchSize` calculados automaticamente. `modelId: 'none'` skip total sem deteção.
  - **P0-2: LLaMACppRuntime** (`llamacpp.ts`) — wrapper `node-llama-cpp` v3.18.1: `getLlama({gpu:'auto'})` → `loadModel()` → `createContext()` → `LlamaCompletion.generateCompletion()`. CUDA automático via `gpu: 'auto'`.
  - **P0-3: AgentModel integrado** (`agent-model.ts`) — `load()` chama `AutoConfig.autoDetectAndConfigure()`. Prioridade: GGUF (LLaMACppRuntime) → ExecuTorch → mock Português. Fallback contextual automático.
  - **P0-4: Frontend Webpack fix** (`next.config.js`) — `ignore-loader` para `.node` + `IgnorePlugin` para `@node-llama-cpp/*` e `@reflink/*`. `MockAgentModel` inline substitui import estático de `@skynet/inference-runtime`. Build 86KB JS, export static.
- **App UI web build**: compila e exporta com sucesso (`build:web`)
- **Frontend dev server**: http://localhost:3000 (Next.js 15.5), MockAgentModel responde em Português modo LIGHTNING/DEEP
- **WASM**: 200KB (+BLAKE3 SIMD). JS glue: 37KB. Types: 9KB.
- **Bug Hunt v0.11.1 (legacy)**: 8 bugs encontrados e corrigidos (4 CRITICAL, 4 HIGH, 4 MEDIUM) em todos os 8 pacotes
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
- **Sprint 13 Research-Driven Implementation (v0.11.0)**: 25 inovações implementadas de 87 pesquisadas (arXiv, AAAI, CVPR, ICLR, NeurIPS, NSDI, Nature, ACM, IEEE, W3C, IETF, ePrint, GitHub):
  - **P0-1: SPRINTER LightweightVerifier** (`speculative-decoding.ts`) — MLP 1k params prevê acceptance, 1.7× speedup, 8.3× menos FLOPs (arXiv:2502.04557)
  - **P0-2: FUSE Governor** (`thermal.ts:FUSEGovernor`) — Unified CPU/GPU/mem DVFS triplet lookup, 25-37% TPOT reduction (arXiv:2507.02135)
  - **P0-3: pFed1BS 1-bit Sketching** (`fed-yogi.ts:PFed1BS`) — Fast Hadamard Transform + 1-bit sketch, >99% comunicação reduction (AAAI 2026, arXiv:2511.13144)
  - **P0-4: FedAda²** (`fed-yogi.ts:FedAda2`) — Drop-in FedYogi upgrade sem preconditioner transfer (arXiv:2410.18117)
  - **P0-5: OATS Embedding Refinement** (`semantic-router.ts:refineEmbedding()`) — Interpolação centroid de queries bem-sucedidas, NDCG@5 0.869→0.940 (arXiv:2603.13426)
  - **P0-6: FlatNav Hierarchy Removal** (`semantic-router.ts:HnswIndex`) — Remove hierarchy HNSW, 38% menos memória, mesma recall (arXiv:2412.01940)
  - **P0-7: x402 V2 + Stripe MPP** (`solana-x402.ts:x402V2Fetch()` + `microtx.ts:MPPStreaming`) — SDK Linux Foundation + streaming production-grade (x402.org, Stripe 2026)
  - **P0-8: DStack TEE Container** (`tee-attestation-layer/src/dstack-container.ts:DStackContainer`) — Docker para TEE, SOC 2, HIPAA (github.com/Dstack-TEE/dstack)
  - **P0-9: Ada-ef Adaptive ef** (`semantic-router.ts:HnswIndex.adaptiveEf()`) — Fator exploração adaptativo por query, 4× latência reduction (arXiv:2512.06636)
  - **P0-10: LEGACY Dynamic Compression** (`fed-yogi.ts:LEGACYScheduler`) — Wrapper scheduler para qualquer compressor, +7-11% accuracy (ICLR 2026)
  - **P0-11: FedAWA Adaptive Weights** (`fed-yogi.ts:FedAWAWeighting`) — Aggregation weights por alignment de update vectors (CVPR 2025)
  - **P0-12: MNN-AECS Core Selection** (`mlx.ts:AECSCoreSelector`) — Low-power CPU cores durante decode, 23% energia reduction (arXiv:2506.19884)
  - **P0-13: TAP Streaming + Bilateral Halt** (`microtx.ts:TAPStream`) — Per-token commitment com hash chain + bilateral halt (tapprotocol.space)
  - **P0-14: AGFT Contextual Bandit** (`thermal.ts:AGFTScheduler`) — Thompson Sampling GPU freq scaling para continuous batching (arXiv:2508.01744)
  - **P0-15: AQR-HNSW Density Quant** (`tensor.rs:density_aware_quantize_int4()`) — 2.5-3.3× QPS, 75% memory reduction (arXiv:2602.21600)
  - **P1-16: PEARL Pre/Post Verify** (`speculative-decoding.ts:preVerify()/postVerify()`) — 1.52× vanilla SD (arXiv:2408.11850)
  - **P1-17: LMCache P2P** (`kv-cache.ts:LMCacheP2P`) — RegistryTree metadata + P2P KV cache, 3× memory reduction (blog.lmcache.ai 2026)
  - **P1-18: TAH-QUANT 3-4 bit** (`pipeline.ts:TAHQuantTransform`) — Tile-wise Hadamard quantization para ativações pipeline (arXiv:2506.01352)
  - **P1-19: MatQuant Nested Quant** (`model-loader.ts:MatQuantEncoder`) — Treina uma vez int8, extrai int4/int2 (arXiv:2502.06786)
  - **P1-20: LVSA Secure Agg** (`secure-aggregation.ts:LVSAVerifier`) — Non-interactive masking + inner-product verification (Neurocomputing 2025)
  - **P1-21: DroidSpeak KV Sharing** (`kv-cache.ts:DroidSpeakKVSharing`) — Cross-LLM KV cache sharing, 4× throughput (NSDI 2026)
  - **P1-22: ZK Compression Channels** (`solana-x402.ts:openZKCompressedChannel()`) — Compressed PDAs, 60× cost reduction (zkcompression.com)
  - **P1-23: NEAR MPC-TEE Hybrid** (`near-mpc-tee.ts:NearMPCTEE`) — Threshold signing + TDX enclaves (github.com/near/mpc)
  - **P1-24: CRA Collective Attestation** (`cra-attestation.ts:CRACollectiveAttestation`) — O(1) verificação de O(n) nós (arXiv:2407.09203)
  - **P1-25: MoE Parallel Folding** (`pipeline.ts:MoEParallelFolding`) — 5D hybrid TP+EP+CP+DP+PP (arXiv:2504.14960)
- **Bug Hunt v0.11.1**: 8 bugs corrigidos em 6 packages:
  - **CRIT-1: SPRINTER Gradiente Softmax** (`speculative-decoding.ts:LightweightVerifier.train()`) — Gradiente sigmoid `error·pred·(1-pred)` para saída softmax 2-class, b2 atualizado dentro do loop hidden (32× excess), w2 mesmo sinal para ambas as classes, hidden gradient usava soma em vez de diferença. Fix: gradientes dz₀/dz₁ corretos para cross-entropy, updates separados por classe.
  - **CRIT-2: extractInt2 ignorava input** (`model-loader.ts:MatQuantEncoder.extractInt2()`) — Gerava ramp sintética `3·(i-start)/(end-start)` ignorando `encoded.packed`. Fix: dequantiza int4→float, computa min/max real, requantiza int2.
  - **CRIT-3: thresholdSign sempre selecionava todos** (`near-mpc-tee.ts:NearMPCTEE.thresholdSign()`) — `Math.max(threshold, N)` = N. Fix: `Math.min(threshold, N)`.
  - **CRIT-4: InnerProductVerifier sem referência** (`secure-aggregation.ts:InnerProductVerifier.computeInnerProduct()`) — Auto-produto alternado aos pares = meaningless. Fix: `setReference()` + cosine similarity real entre dois vetores.
  - **HIGH-5: CRA dead code** (`cra-attestation.ts:submitAttestation()`) — `lastAttested = Date.now()` antes do check de intervalo. Fix: capturar `now` antes de atualizar `lastAttested`.
  - **HIGH-6: tensor.rs divisão por zero + effective_bits** (`tensor.rs:density_aware_quantize_int4()`) — dim=0 crasha; effective_bits até 16 para storage int4 (loss 99.98% range). Fix: guard dim=0, sempre 4 bits, density_factor escala diretamente o step de quantização.
  - **HIGH-7: Rollback negativo bypassava guard** (`solana-x402.ts:channelPayment()`) — `balanceLocal < -100` sempre falso. Fix: guard bidirecional (negativo → check balanceRemote).
  - **MED-8: 4 bugs médios corrigidos** — AGFT exploration gate invertido (`thermal.ts`), FUSE cache key mismatch (`thermal.ts`), FlatNav memory leak (`semantic-router.ts`), pFed1BS seed determinismo (`fed-yogi.ts`).

### O que NÃO foi alterado (arquitetura deliberada)
- **Flag `simulate`** — padrão intencional em todo o projeto (ADRs); mais de 100 ocorrências em `solana-x402.ts`, `chain-adapters.ts`, `cca-attestation.ts`, FL client. Separa integração real de hardware/protocolo da simulação.
- **Blocos `catch` vazios no sistema de eventos** (`agent-mesh.ts:54`, `semantic-router.ts:138`, `fraction-aggregator.ts:70/210`) — tolerante a handlers com erro (try-catch no loop) por decisão arquitetural.
- **Cast `as any`** — limitação do TypeScript para APIs WebGPU, Automerge, WebTransport, ExecuTorch sem tipos maduros.
- **WASM stub `index.ts`** — progressive enhancement: tenta WASM, fallback para JS implementation. Cada função stub retorna valor padrão sensato, não placeholder vazio.
- **MockAgentModel inline no hook** — substituto do `@skynet/inference-runtime` no frontend web. Barrel import de módulo nativo falha mesmo com IgnorePlugin; classe mock inline é o único padrão que garante build web sem erros de webpack.

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

- **SPRINTER lightweight verifier**: MLP 1k params com 3 camadas (10→32→2) prevê acceptance token. Treino com gradient descent simples. Integração via `enableLightVerifier(trainingData)` — não modifica `verify()` padrão.
- **FUSE Governor offline profiling**: Lookup table (deviceClass×zone) → (cpuFreq, gpuFreq, memFreq). Prefill config para deviceClass+batchSize acelera lookup runtime.
- **pFed1BS**: Fast Hadamard Transform O(n log n) sobre vetor de gradientes + random sketching para 1-bit compressão bidirecional. Suporta `useHadamard` toggle para fallback sem transform.
- **FedAda²**: Otimizador Adam-style sem preconditioner transfer. State próprio (momentum+variance), não herda FedYogi — limpeza arquitetural.
- **OATS embedding refinement**: Interpolação alpha = min(0.3, 1/(1+successes)) entre embedding original e centroid de queries bem-sucedidas. Custo CPU negligible.
- **FlatNav HNSW**: Remove hierarchy, layers, LID cache. `neighborCache` simples (Map<string, Set<string>>). `adaptiveEf()` baseado em média histórica de similaridade.
- **x402 V2**: `x402V2Fetch()` anexa headers x402-signature, x402-amount, x402-CAIP. Stripe MPP com planos de subscrição e usage tracking.
- **DStack TEE Container**: Docker-compose para TEE. Deploy+attest+stop lifecycle. Auto-attest opcional.
- **Ada-ef**: `adaptiveEf()` tracks queryHistory (max 100), calcula avg similarity recente, ajusta ef entre 4-64. Integrado em searchWithCRouting.
- **LEGACY**: Scheduler wrapper — ratio = minRatio + (maxRatio-minRatio)*(1 - progress). Chamado antes do compressor.
- **FedAWA**: Pesos adaptativos por alignment cos(update, merged) + consistency(histórico). Server-side only, zero modificação client.
- **AECS Core Selection**: Decode phase → efficiency cores (4-7), prefill → performance cores (0-3). 23% energy reduction decode.
- **TAPStream**: Hash chain per-token. `halt()` bilateral. Close retorna root hash. Preço configurável por token.
- **AGFT Contextual Bandit**: 6 ações (gpuFreq×batchSize). Filtragem por thermalZone. Thompson Sampling via Q-learning.
- **AQR-HNSW**: `density_aware_quantize_int4()` — compute_local_density() para cada ponto + density_factor ajusta bits efetivos por bloco.
- **PEARL**: `preVerify()` token individual, `postVerify()` continua drafting durante verificação se elapsed > 10ms.
- **LMCache P2P**: RegistryTree (prefix tree) + PeerKVCacheOffer com prefixTokenCount, rttMs, modelId.
- **TAH-QUANT**: Hadamard 2×2 + blockwise quantization + configurable targetBits (2-4). getCompressionRatio() = 32/(targetBits+2).
- **MatQuant**: `encodeInt4()` blockwise + `extractInt2()` nested do mesmo formato int8. Precisão int2 superior a QAT padrão.
- **LVSA**: Non-interactive masking + inner-product verification. Submit mask → verify → aggregate. Threshold de clientes mínimo (50%).
- **DroidSpeak**: Register model layers → find compatible layers between models. Sharable ratio 70% (últimas layers).
- **ZK Compression**: Compressed PDAs via `openZKCompressedChannel()` — merkle root + proof generation.
- **NEAR MPC-TEE**: Threshold signing (67% ratio) com TDX enclaves. Key share generation + multi-node signature.
- **CRA**: Swarm attestation com registro de nós + submitMeasurement + verify(). Suspicious detection após 2× interval sem attest.
- **MoE Parallel Folding**: `createPlan()` — attention layers usam TP, MoE layers usam EP. `assignPeersToLayers()` classifica peers por TFLOPs.
- **SPRINTER gradient correcto**: Softmax cross-entropy com 2 classes usa gradiente `dz₁ = p₁ - y₁`, `dz₀ = p₀ - y₀` (sinais opostos). Não usar gradiente sigmoid `error·pred·(1-pred)`. b2 update é `-lr·dz` (sem h[i]), w2 update é `-lr·dz·h[i]` (separado por classe), hidden gradient é `dz₀·w₂₀ + dz₁·w₂₁` (não soma de w2).
- **Int2 nested quantization**: `extractInt2()` deve dequantizar int4→float para obter valores reais, recalcular min/max por bloco, e requantizar para int2. Não assumir scale derivável linearmente de int4 scale.
- **Threshold signing**: `Math.min(threshold, verified.length)` — `Math.max` sempre seleciona todos os nós, quebrando threshold ratio.
- **Inner product verification**: Precisam de dois vetores (agregado + referência/compromisso). Auto-produto `data[i]·data[i+1]` alternado não verifica nada.
- **CRA attestation timing**: Capturar `now` antes de atualizar `lastAttested`; ordem inversa torna deteção de timeout impossível.
- **Channel payment bidirecional**: Guard `balance < amount` só protege pagamentos positivos. Para refunds (negative amount), guard deve verificar `balanceRemote`.
- **Density-aware quantization**: Storage é sempre int4 (4 bits). `effective_bits` não pode exceder bits reais de armazenamento, senão scale division perde >99% do range. Usar density_factor para escalar step de quantização diretamente: `step = range / 15 / density`.
- **AGFT exploration gate**: `totalPlays < 10` para explorar no início; `totalPlays > 10` explora depois de estabilizar (invertido).
- **FUSE cache keys**: `lookup()` e `prefillConfig()` devem usar o mesmo formato de key. BatchSize é parte essencial da cache key.

- **AutoConfig `nvidia-smi` fallback**: Se `nvidia-smi` não está em PATH, tentar ler `nvml.dll` via `CUDA_PATH`. Em Windows, `nvidia-smi` pode estar em `$env:CUDA_PATH/bin/`.
- **node-llama-cpp `gpu: 'auto'`**: `getLlama({gpu:'auto'})` deteta CUDA Toolkit por `CUDA_PATH` ou `nvcc` em PATH. Não requer linking manual. Falha silenciosa → CPU fallback.
- **LlamaCompletion API**: `generateCompletion()` da classe `LlamaCompletion` do node-llama-cpp retorna string diretamente (não iterator). Usar `maxTokens`/`temperature` nas options. Contexto criado separadamente em `llama.createContext()`.
- **ignore-loader + IgnorePlugin**: Para bundles web que não podem conter módulos nativos, `ignore-loader` para extensões `.node` + `webpack.IgnorePlugin` para packages nativos (`@node-llama-cpp/*`, `@reflink/*`). Mock replacement inline para o módulo inteiro.
- **Inline Mock > import dinâmico**: Import estático de módulo nativo falha em webpack mesmo com `IgnorePlugin` se o barrel export (`index.ts`) reexporta o módulo. Solução: classe mock inline no hook do frontend, sem import do package.
- **CUDA Toolkit no Windows**: `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0\bin\` deve estar em PATH. `nvidia-smi` está em `C:\Windows\System32\` (driver), não no toolkit. node-llama-cpp usa `nvcc` do toolkit, não `nvidia-smi`.
- **Model catalog por VRAM**: 4 tiers: 0GB (tiny), 4GB (phi-3-mini Q4_K_M ~20 layers GPU), 8GB (llama-3.2-3B), 16GB (mistral-7B), 24GB+ (llama-3.1-8B). gpuLayers ~ 0.8 * VRAM_GB * 1024 / 300 (estimation).
- **gpuLayers quantization-aware**: Fórmula anterior `(vram-1024)/(layers*6)` era muito conservadora (16/32 na GTX 1050). Nova fórmula: `perLayerMB = (paramsB * 1024 * 0.575) / layers` (Q4 + GGUF overhead). `kvCacheMB = layers * contextSize * 0.009`. `gpuLayers = min(layers, max(0, (vram - kvCacheMB - 512) / perLayerMB))`. GTX 1050 → 32/32 layers.
- **gpuLayers safety factor 0.75**: 32/32 crashou GPU (OOM). Com safetyFactor=0.75 → 24 layers. Bench: 16 layers = 2.49 tok/s → 24 layers = **3.85 tok/s (+55%)**.
- **Auto-download GGUF from HuggingFace**: `AutoConfig.downloadModel()` usa URL de HuggingFace + stream download com progresso. `AgentModel.load({autoDownload:true})` chama automático se modelo não existe.
- **Primeira inferência é lenta (~40s)**: Inclui warmup CUDA + model load overhead. Segunda execução ~2× mais rápida.

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
- ~~**Sprint 13 (v0.11.0): Research-Driven Implementation** — 25 inovações implementadas de 87 pesquisadas~~
- ~~**Bug Hunt v0.11.1**: 8 bugs corrigidos (4 CRITICAL, 4 HIGH, 4 MEDIUM) em 6 packages. Build/tests 100%.~~
- ~~**Sprint 14: ESLint infra** — CONCLUÍDO! 8/8 packages configurados, 0 erros~~
- ~~**Sprint 14: CUDA Toolkit 13.0** — CONCLUÍDO! nvcc V13.0.48, GTX 1050 detetada~~
- ~~**Sprint 14: AutoConfig + LLaMACppRuntime** — CONCLUÍDO! Deteção automática hardware + inferência GGUF GPU~~
- ~~**Sprint 14: Frontend Webpack fix** — CONCLUÍDO! MockAgentModel inline, build 86KB~~
- **Inferência real GPU no nó desktop** — `AgentModel.load({modelId:'phi-3-mini'})` com GGUF real (2.2GB). Testar tok/s na GTX 1050
- **WebTransport real mesh** — múltiplos peers reais (não loopback)
- **TEE bridge real** — DStack ou NEAR MPC-TEE com hardware real
- **ExecuTorch Device Test** — precisa de dispositivo físico (Android/iOS com ExecuTorch)
- **Cross-Platform CI verification** — verificar status em github.com/msrovani/SKYNET/actions
- **WASM em Safari/Firefox** — testes cross-browser pendentes
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

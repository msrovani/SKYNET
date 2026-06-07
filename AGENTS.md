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

## ADRs (15)
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

## Estado Atual (Sprint 1.5 — Integração)
- **Build 8/8 packages OK** via `pnpm build` (Turborepo v2.9.16)
- **pnpm test**: 14/14 tasks, **37 testes** passando (13 core-wasm-engine + 24 p2p-mesh-network)
- **WASM**: 502KB → 153KB via wasm-bindgen 0.2.122 (69% reduction). JS glue: 30KB. Types: 6KB.
- **wasm-bindgen-cli 0.2.122** baixado precompilado do GitHub (avoid MSVC linker). Local: `%TEMP%\wasm-bindgen\wasm-bindgen-0.2.122-x86_64-pc-windows-msvc\wasm-bindgen.exe`
- **build.cjs**: cargo build → wasm-bindgen (temp ASCII `%TEMP%\skynet-wasm-bindgen-out`) → copy to dist/ → tsc
- **stub/index.ts**: lazy WASM loading via `Function('return import("./core_wasm_engine.js")')()` com fallback TS puro. 18 funções exportadas.
- **p2p-mesh-network**: 24 testes de integração passando. Cobre: TransportManager (WebTransport + WebRTC fallback), WebRTCFallback, CrdtSync (Automerge v2 CRUD + snapshots), FailoverManager, RoleElection, Capability, InstinctEngine, ExperimentTracker, PeerDiscovery
- **WebTransport Hello World FUNCIONAL!** `@moq/web-transport` v0.1.2 (napi-rs) server + client bidirectional stream echo. Conexão QUIC em ~170ms, roundtrip ~15ms. 3 scripts: `echo-server.ts`, `echo-client.ts`, `run-echo.ts`. Executar: `pnpm example:echo`
- **Promise.withResolvers polyfill** necessário para Node.js v20 (nativo no v22+). Adicionado em todos os scripts echo.
- **Tensor sharding**: 13 testes (row/col shard, reconstruct, verify, edge cases). Rust `tensor.rs` + TS stub.
- **inference-runtime**: `ExecuTorchRuntime` reescrito com API ExecuTorch 1.2 — 5 backends, `getAvailableBackends()`, `recommendBackend()`, `estimateMemory()`, `loadFromBuffer()`, tipos `ExecuTorchTensor`. `ModelLoader` com streaming + progress callback. `KNOWN_MODELS` para Llama 3.2 1B/3B INT4.
- **Cross-Platform CI**: `.github/workflows/ci.yml` expandido com matrix `[ubuntu, macos, windows]` para `build-ts`, `build-wasm`, `test`. WASM build usa `actions-rust-lang/setup-rust-toolchain` + wasm-bindgen-cli precompilado.
- **Rust toolchain**: 1.96.0 (stable-x86_64-pc-windows-gnu), target `wasm32-unknown-unknown`
- **Automerge v2** funcional: `init<T>`, `change<T>`, `save<T>`, `load<T>`.
- **8 pacotes estáveis** com tsconfig, exports completos, sem referências circulares.

### Bugs Conhecidos
- **Automerge v2 Proxy rejeita `undefined`** — usar `null` ou omitir propriedade. Fix em `decompressSnapshot` e `updatePeer`.
- **desktop-node-agent build.cjs** tem loop recursivo (`tauri build` → `npm run build` → `build.cjs`). Não-bloqueante.
- **Accented Windows paths** quebram GNU linker. WASM build usa `%TEMP%\skynet-wasm-build` (ASCII-only). `fork()` works com paths acentuados (Node.js gerencia internamente); `spawn()` quebra com `shell:true`.
- **web-sys 0.3.99** lacks WebGPU bindings. WebGPU module stubbed.
- **@moq/web-transport v0.1.2** `Request.ok()` retorna "request already consumed" se usado após `request.url` em alguns cenários; ordem correcta: `url` antes de `ok()`.

### Lições Aprendidas
- `vi.stubGlobal()` + `vi.unstubAllGlobals()` > `vi.doMock()` para mockar globals como WebTransport/RTCPeerConnection
- Automerge v2 functional API: `change(doc, cb)` retorna novo doc; Proxy rejeita `undefined`
- `Function('return import("./path.js")')()` evita TypeScript module resolution errors para generated files
- Temp dir strategy resolves GNU linker issues with non-ASCII paths
- `@moq/web-transport` (napi-rs) fornece WebTransport server + client W3C-compatível em Node.js
- `node-forge` para geração de certificados auto-assinados em pure JS
- `Promise.withResolvers()` requer Node.js v22+; polyfill manual necessário no v20
- `fork()` com `execArgv: ['--import', 'tsx/esm']` funciona para subprocessos TS em Windows com paths acentuados (Node.js converte path internamente)
- `WebTransport.datagrams.readable` e `session.incomingBidirectionalStreams` usam APIs diferentes; alinhar server/client no mesmo canal

## Tarefas Pendentes
- ~~**WebTransport funcional entre 2 peers reais** — CONCLUÍDO! `pnpm example:echo` funcional~~
- **ExecuTorch Device Test** — precisa de dispositivo físico (Android/iOS com ExecuTorch)
- **Cross-Platform CI verification** — workflow escrito, precisa de push ao GitHub para validação
- **WASM em Safari/Firefox** — testes cross-browser pendentes
- **Inferência local Android** — milestone S1, depende de ExecuTorch device test

## Comandos
- `pnpm install` — instalar deps
- `pnpm build` — build todos os pacotes (corrigido: fallback stub se Rust ausente)
- `pnpm test` — testes
- `pnpm lint` — linting
- `pnpm exec turbo build` — build via Turborepo
- `pnpm --filter @skynet/p2p-mesh-network example:echo` — WebTransport echo demo
- `pnpm --filter @skynet/p2p-mesh-network example:setup` — gerar certificados

## Referências
- KNOWLEDGE_BASE.md — documentação completa do projeto
- SPRINT_0_PLANNING.md — planeamento arquitetural + 10 secções + 15 ADRs
- ANALYSIS_PC_NODES.md — análise PC como nós
- TODO.md — task list detalhada

## Visão Futura: "Atmosfera Cognitiva"
SKYNET como grelha de utilidade pública: sem núcleo central, self-healing, computação como lastro monetário (x402). IA atmosférica e ubíqua.

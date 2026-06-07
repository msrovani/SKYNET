# SKYNET DePIN — Task List

## Sprint 0: Planejamento ✅

- [x] Pesquisar WebTransport vs WebRTC (Baseline 2026)
- [x] Pesquisar WebGPU cross-platform support (Baseline 2026)
- [x] Pesquisar ExecuTorch performance benchmarks (1.0 GA)
- [x] Pesquisar ARM CCA confidential computing
- [x] Pesquisar Federated Learning algorithms (FedYogi, FedAdamW, Q-LocalAdam, FEDADAVR)
- [x] Pesquisar Thermal throttling mitigation strategies
- [x] Pesquisar Pipeline vs Tensor Parallelism para mobile
- [x] Pesquisar Solana/Base x402 protocol para microtransações
- [x] Sintetizar research em SPRINT_0_PLANNING.md
- [x] Definir arquitetura 7 pacotes
- [x] Definir plano de 6 sprints

## Sprint 1: Fundação ✅ (Semanas 1-4)

### 1.1 Monorepo Setup
- [x] Inicializar Turborepo com pnpm
- [x] Configurar `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`
- [x] Configurar CI (GitHub Actions)

### 1.2 core-wasm-engine
- [x] `Cargo.toml` com wasm-bindgen, wgpu, web-sys
- [x] `lib.rs`: WASM bindings (25 funções exportadas)
- [x] `webgpu.rs`: Contexto WebGPU (stubbed, web-sys lacks bindings)
- [x] `tensor.rs`: Sharding row/col, quantização INT4, reconstruct, verify
- [x] `thermal.rs`: Monitor térmico (getThermalHeadroom)
- [x] `capability.rs`: NodeCapability, score/tier computation
- [x] `evolution.rs`: Genetic algorithm (pop 20, crossover 70%, mutation 15%)
- [x] `autonomous.rs`: AutonomousOrchestrator, experiment tracking
- [x] `knowledge_graph.rs`: Directed graph + thermal cascade analysis
- [x] `context_prune.rs`: 95% compression for edge devices
- [x] `stub/index.ts`: TS stub replicando ALL WASM bindings + lazy WASM load
- [x] `stub/__tests__/sharding.test.ts`: 13 unit tests (vitest 1.6.1)
- [x] `build.cjs`: Compila via temp dir ASCII → wasm-bindgen → copy → tsc
- [x] WASM compila e otimiza: 502KB → 153KB (wasm-bindgen 0.2.122)

### 1.3 inference-runtime
- [x] `executorch.ts`: Binding para ExecuTorch 1.2 runtime (5 backends, tensor types, API completa)
- [x] `model-loader.ts`: Download streaming, progress callback, KNOWN_MODELS (Llama 3.2 1B/3B)
- [x] `onnx-runtime.ts`: Fallback ONNX Runtime Web
- [ ] Testes com Llama 3.2 1B INT4 em dispositivo real

### 1.4 p2p-mesh-network
- [x] `transport.ts`: TransportManager (WebTransport + Multipath QUIC + WebRTC fallback)
- [x] `webrtc-fallback.ts`: WebRTC DataChannel
- [x] `crdt-sync.ts`: Automerge v2 CRDT (functional API)
- [x] `failover.ts`: Heartbeat + circuit breaker + recovery
- [x] `discovery.ts`: Peer Discovery (mDNS, signalling)
- [x] `instinct.ts`: Instinct Engine (cross-node pattern promotion)
- [x] `autonomous.ts`: EvolvableParams mutation + ExperimentTracker
- [x] `election.ts`: Role election for mesh coordination
- [x] `capability.ts`: Node capability computation
- [x] 24 testes de integração: TransportManager, WebRTCFallback, CrdtSync, FailoverManager, RoleElection, Capability, InstinctEngine, ExperimentTracker, PeerDiscovery

### 1.5 desktop-node-agent
- [x] `lib.rs` + `main.rs`: Tauri v2 split
- [x] `gpu_detect.rs`: Deteção GPU, backends
- [x] `power_mgmt.rs`: Power profiles, idle detection
- [x] `node_service.rs`: Foreground service
- [x] `installer.rs`: Windows/Mac/Linux service installer
- [x] `auto_updater.rs`: Auto-update
- [x] `moss.rs`: MOSS circuit breaker + recovery

### 1.6 Outros Pacotes
- [x] `blockchain-client`: Solana x402, Base fallback, microtx
- [x] `tee-attestation-layer`: Remote Attestation, TEE bridge, Proof of Time
- [x] `fl-training-client`: FedYogi, Q-LocalAdam, FEDADAVR, client selection
- [x] `app-ui-orchestrator`: React Native + Next.js PWA (placeholder)

### 1.7 Milestone S1
- [x] pnpm build 8/8 pacotes OK
- [x] pnpm test 14/14 tasks successful (37 testes)
- [x] WASM compila nativamente (502KB → 153KB otimizado)
- [x] JS glue (30KB) + TypeScript types (6KB) gerados via wasm-bindgen
- [x] WebTransport Hello World scripts criados (echo server + client com @moq/web-transport)
- [x] WebTransport funcional entre 2 peers reais — QUIC connect ~170ms, echo roundtrip ~15ms
- [x] inference-runtime com API ExecuTorch 1.2 completa
- [x] Cross-Platform CI workflow (matrix ubuntu/macos/windows)
- [ ] Inferência local funcional num dispositivo Android (precisa hardware)

## Sprint 1.5: Integração ✅ (Concluído — excepto hardware-dependentes)

### 1.5.1 WASM JS Glue ✅
- [x] Download binary precompilado wasm-bindgen-cli 0.2.122 do GitHub
- [x] Gerar JS bindings (30KB) + TypeScript types (6KB) + WASM otimizado (153KB, -69%)
- [x] build.cjs: cargo build → wasm-bindgen → copy → tsc
- [x] stub/index.ts: lazy WASM loading com fallback TS puro, 18 funções exportadas

### 1.5.2 ExecuTorch Device Test ⏳ (precisa hardware)
- [x] `executorch.ts` reescrito com API ExecuTorch 1.2 (5 backends, tensor types, loadFromBuffer)
- [x] `model-loader.ts` com streaming, progress callback, KNOWN_MODELS
- [x] `recommendBackend()`, `estimateMemory()`, `getAvailableBackends()` exportados
- [ ] Integrar ExecuTorch Llama 3.2 1B INT4 num dispositivo real
- [ ] Medir performance (tok/s, latência, memória)

### 1.5.3 WebTransport Hello World ✅✅✅
- [x] 24 testes de integração p2p-mesh-network passando
- [x] `@moq/web-transport` (napi-rs) instalado como WebTransport server + client
- [x] scripts/echo-server.ts — servidor WebTransport echo (bidirectional streams)
- [x] scripts/echo-client.ts — cliente WebTransport (conecta, envia, recebe echo)
- [x] scripts/generate-cert.ts — geração de certificados com node-forge
- [x] scripts/run-echo.ts — orchestrator server + client (fork + --import tsx/esm)
- [x] Comandos: `pnpm example:setup`, `pnpm example:echo`
- [x] Conexão QUIC 0-RTT em ~170ms, roundtrip echo ~15ms
- [x] Promise.withResolvers polyfill para Node.js v20
- [x] fork() com execArgv: ['--import', 'tsx/esm'] para Windows paths acentuados

### 1.5.4 Cross-Platform ✅
- [x] CI workflow expandido: matrix `[ubuntu, macos, windows]` para build-ts, build-wasm, test
- [x] WASM build usa `actions-rust-lang/setup-rust-toolchain` + target wasm32
- [x] wasm-bindgen-cli precompilado baixado do GitHub (evita MSVC)
- [ ] Verificar build Linux/macOS CI (precisa push ao GitHub)
- [ ] Testar WASM em Safari/Firefox (precisa browsers)

## Sprint 2: Mesh Local — L1 (Semanas 5-8)

### 2.1 p2p-mesh-network (completo)
- [ ] Pipeline Parallelism: Particionamento de layers entre peers
- [ ] Segment Means compression para comunicação entre nós
- [ ] Distributed Speculative Decoding (mobile draft, PC verify)

### 2.2 core-wasm-engine (continuação)
- [ ] Sharded inference pipeline
- [ ] Checkpoint de ativações (para preempção abrupta)

### 2.3 Milestone S2
- [ ] 2+ dispositivos fazem inferência fragmentada em mesh WiFi

## Sprint 3: Mobile App + Thermal (Semanas 9-12)

### 3.1 app-ui-orchestrator
- [ ] React Native (Expo) com Foreground Service
- [ ] 3 modos: Tático, Fazenda, Passivo
- [ ] Next.js PWA para browser/Smart TV

### 3.2 Thermal Management
- [ ] Adaptive Parameter Scheduler (threads, batch size)
- [ ] Dynamic Shifting (model switching)
- [ ] PerformanceHintManager integration

### 3.3 Milestone S3
- [ ] App roda 30+ min com 77%+ retenção de throughput

## Sprint 4: Segurança e Blockchain (Semanas 13-16)

### 4.1 tee-attestation-layer
- [ ] `attestation.ts`: Remote Attestation (SGX simulation)
- [ ] `tee-bridge.ts`: Abstração SGX/SEV/CCA
- [ ] `proof-of-time.ts`: Proof of Inference Time measurement

### 4.2 blockchain-client
- [ ] `solana-x402.ts`: Integração com Solana x402 protocol
- [ ] `base-fallback.ts`: Base como fallback
- [ ] `microtx.ts`: Microtransações USDC

### 4.3 Milestone S4
- [ ] Pagamento funcional por inferência em testnet

## Sprint 5: Federated Learning (Semanas 17-20)

### 5.1 fl-training-client
- [ ] `fed-yogi.ts`: Implementação FedYogi
- [ ] `q-local-adam.ts`: Q-LocalAdam (8-bit optimizer states)
- [ ] `fedadavr.ts`: FEDADAVR para alta evasão
- [ ] `client-selection.ts`: Seleção heterogénea (bateria, Wi-Fi, thermal)

### 5.2 Milestone S5
- [ ] Treino federado funcional em 10+ dispositivos

## Sprint 6: Integração e Beta (Semanas 21-24)

### 6.1 Integração
- [ ] Integrar todos os 8 pacotes
- [ ] Testes de carga (100+ nós simulados)
- [ ] Testes de falha (preempção, desconexão, throttling)

### 6.2 Qualidade
- [ ] Auditoria de segurança
- [ ] Stress test 30+ min contínuos
- [ ] Otimização de bateria

### 6.3 Beta
- [ ] Beta fechado (20 empresas, 500 dispositivos)
- [ ] Dashboard de monitoramento
- [ ] Documentação API

---

## Backlog Técnico

- [ ] Suporte a iOS (CoreML via ExecuTorch)
- [ ] Suporte a Smart TVs (PWA + WebGPU)
- [ ] zk-SNARKs para agregação FL verificável
- [ ] Dynamic Shifting com shared-weight models
- [ ] ARM CCA nativo (quando hardware disponível)
- [ ] Multi-chain (Polygon, Arbitrum)
- [ ] Plugin system para modelos customizados
- [ ] LoRaWAN + acústica ultrassónica (ADR-015)
- [ ] Circadian-Aware Scheduling (ADR-014)

---

## Log de Conquistas

### Sprint 1 (Junho 2026)
- **Semana 1-2:** Monorepo setup, 8 pacotes TypeScript, SPRINT_0_PLANNING.md
- **Semana 2-3:** Bug fixes (Automerge v2, web3.js v1, turbo.json v2, tsconfig)
- **Semana 3-4:** Rust toolchain 1.96.0, WASM compilation (502KB), ~55 errors fixed
- **Semana 4:** Tensor sharding (13 tests), TS stub, build.cjs temp dir, desktop-node-agent Tauri v2 fix

### Sprint 1.5 (Julho 2026)
- **WASM JS Glue:** wasm-bindgen-cli 0.2.122 binary, JS glue (30KB) + types (6KB) + WASM otimizado (153KB)
- **p2p-mesh-network:** 24 testes de integração, 3 bugs corrigidos (connect state, CRDT init, Automerge undefined)
- **WebTransport Hello World FUNCIONAL:** @moq/web-transport (napi-rs) — QUIC connect ~170ms, echo roundtrip ~15ms, bidirectional streams, fork subprocesses
- **ExecuTorch 1.2 API:** 5 backends, tensor types, model loader streaming, KNOWN_MODELS (Llama 3.2 1B/3B)
- **Cross-Platform CI:** matrix ubuntu/macos/windows, Rust setup + WASM build pipeline
- **Build/Tests:** pnpm build 8/8 OK, pnpm test 14/14 OK (37 testes)
- **Promise.withResolvers polyfill** para Node.js v20 (@moq/web-transport requer v22)
- **Fixes Windows path com acentos:** `fork()` > `spawn(shell:true)`; Node.js gerencia paths internamente
- **@moq/web-transport bug:** `Request.ok()` consome request se `request.url` lido depois — ordem correcta: url antes de ok()

### Resultados Acumulados
- **8/8 packages build OK** via `pnpm build` (Turborepo v2.9.16)
- **37 testes** passando (13 core-wasm-engine sharding + 24 p2p-mesh-network integração)
- **14/14 tasks** successful em `pnpm test`
- **WASM**: 502KB → 153KB (wasm-bindgen optimization), JS glue 30KB, types 6KB
- **WebTransport**: Echo funcional — QUIC connect ~170ms, roundtrip ~15ms, bidirectional streams
- **ExecuTorch**: API completa com 5 backends, model loader, KNOWN_MODELS

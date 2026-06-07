# Changelog

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

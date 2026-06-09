# SKYNET Beta — Guia de Primeiros Passos

## Pré-requisitos

- Node.js ≥20, pnpm ≥9
- Rust toolchain 1.96+ (opcional — só para WASM build)
- Git

## Setup

```bash
git clone https://github.com/msrovani/SKYNET.git
cd SKYNET
pnpm install
pnpm build       # 8/8 packages
pnpm test        # 395 testes, 16/16 tasks
```

## Validação Rápida (5 minutos)

### 1. WebTransport P2P

```bash
# Terminal 1 — gera certificados (primeira vez)
pnpm --filter @skynet/p2p-mesh-network example:setup

# Terminal 2 — echo server + client
pnpm --filter @skynet/p2p-mesh-network example:echo
# Esperado: Connected in ~120ms, Echo received in ~3ms
```

### 2. Testes por pacote

```bash
pnpm --filter @skynet/core-wasm-engine test        # 41 tests
pnpm --filter @skynet/p2p-mesh-network test         # 167 tests
pnpm --filter @skynet/inference-runtime test        # 43 tests
pnpm --filter @skynet/blockchain-client test        # 47 tests
pnpm --filter @skynet/fl-training-client test       # 32 tests
pnpm --filter @skynet/tee-attestation-layer test    # 37 tests
pnpm --filter @skynet/app-ui-orchestrator test      # 7 tests
pnpm --filter @skynet/desktop-node-agent test       # 21 tests
```

### 3. App UI Web

```bash
pnpm --filter @skynet/app-ui-orchestrator build:web
# Esperado: Compiled successfully, 4/4 static pages
```

### 4. E2E Integration

```bash
pnpm --filter @skynet/desktop-node-agent test
# 21 tests incl. e2e-full-flow (AgentHost + SemanticRouter + TEE + Inference)
```

## O Que Explorar

| Área | Package | Ficheiros-chave |
|------|---------|-----------------|
| P2P Mesh | `p2p-mesh-network` | `transport.ts`, `semantic-router.ts`, `thermal.ts` |
| Inference | `inference-runtime` | `executorch.ts`, `onnx-runtime.ts`, `mlx.ts`, `speculative-decoding.ts` |
| Agentic Mesh | `desktop-node-agent` | `agent-host.ts`, `agent-model.ts`, `agent-payments.ts` |
| Blockchain | `blockchain-client` | `solana-x402.ts`, `chain-adapters.ts`, `state-channels.ts` |
| FL | `fl-training-client` | `fedyogi.ts`, `q-local-adam.ts`, `fedadavr.ts`, `client-selection.ts` |
| TEE | `tee-attestation-layer` | `tee-bridge.ts`, `sgx-attestation.ts`, `proof-of-time.ts` |
| App UI | `app-ui-orchestrator` | `useSkynet.ts`, `page.tsx` |

## Arquitetura Rápida

```
8 packages em monorepo Turborepo
├── core-wasm-engine      Rust→WASM (tensors, thermal, evolution)
├── p2p-mesh-network      Transport, CRDT, routing, scheduling
├── inference-runtime     ExecuTorch, ONNX, MLX adapters
├── blockchain-client     Solana x402, State Channels, Multi-chain
├── fl-training-client    FedYogi, Secure Aggregation
├── tee-attestation-layer SGX/SEV/CCA attestation
├── app-ui-orchestrator   React Native + Next.js PWA
└── desktop-node-agent    Tauri desktop node
```

## Limitações Conhecidas (Alpha)

- ExecuTorch device test requer dispositivo físico (Android/iOS)
- WASM core não compila em Safari/Firefox (WebGPU bindings faltam)
- WebTransport requer certificados auto-assinados (exemplo incluído)
- Rede P2P real entre múltiplas máquinas não testada (apenas localhost echo)
- Simulate mode ativo em blockchain, FL e TEE (falta integração real)

## Reporting Bugs

Issues em [github.com/msrovani/SKYNET/issues](https://github.com/msrovani/SKYNET/issues) com:
- Output de `pnpm test`
- Output de `pnpm build`
- Logs de erro

## Contribuir

PRs bem-vindos. Docs de contribuição: `CONTRIBUTING.md` (em breve).

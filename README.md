# SKYNET DePIN

**Inferência de IA distribuída. Computação ociosa global. Uma malha auto-evolutiva.**

[![CI](https://github.com/msrovani/SKYNET/actions/workflows/ci.yml/badge.svg)](https://github.com/msrovani/SKYNET/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.2.0-green.svg)](CHANGELOG.md)
[![Tests](https://img.shields.io/badge/tests-52%20passing-brightgreen.svg)]()

---

SKYNET agrega **computação ociosa** de smartphones, PCs, Smart TVs e browsers numa malha global de inferência de IA. Qualquer dispositivo com chip pode contribuir — e ganhar.

## O Problema

- **Datacenters estão no limite**: 70% da capacidade global está em dispositivos pessoais ociosos.
- **IA centralizada é frágil**: gargalos, censura, risco de falha única.
- **Custos proibitivos**: inferência em GPU cloud custa 10-100x mais que o necessário.

## A Solução

SKYNET é uma **DePIN super app** que orquestra dispositivos heterogéneos numa única máquina de inferência distribuída, com:

| Camada | Dispositivos | Capacidade |
|--------|-------------|------------|
| **L0** | Smartphones, IoT | 1-3B params, draft tokens |
| **L1** | PCs, Consolas | 7-13B params, verificação |
| **L2** | Workstations, Smart TVs | 13-70B params, sharding |
| **L3** | Datacenters (parceiros) | 70B+, scheduling global |

## Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                    SKYNET Mesh                           │
│                                                         │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐            │
│  │  Phone   │   │    PC    │   │  Smart TV│   ...       │
│  │ (L0)     │──▶│ (L1)     │──▶│ (L2)     │            │
│  │ draft    │   │ verify   │   │ shard    │            │
│  └──────────┘   └──────────┘   └──────────┘            │
│       │              │              │                   │
│       └──────────────┴──────────────┘                   │
│                      │                                  │
│               ┌──────┴──────┐                           │
│               │  WebTransport + QUIC │                  │
│               │  (Multipath, 0-RTT)  │                  │
│               └──────┬──────┘                           │
│                      │                                  │
│        ┌─────────────┼─────────────┐                    │
│        │  Automerge  │  FedYogi FL │  x402 Payments    │
│        │  CRDT Sync  │  MPC Secure │  (Solana + Base)  │
│        └─────────────┴─────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

## Stack

| Componente | Tecnologia |
|------------|-----------|
| Core | Rust → WASM (wgpu, WebGPU, INT4) |
| Transporte | WebTransport + Multipath QUIC, WebRTC fallback |
| Sincronização | Automerge CRDT v2 |
| Inferência | ExecuTorch 1.2 (5 backends) |
| FL | FedYogi + Secure Aggregation MPC |
| TEE | Intel SGX / AMD SEV → ARM CCA |
| Blockchain | Solana x402 + State Channels, Base fallback |
| Térmico | Adaptive Scheduler + Dynamic Shifting |
| App | React Native (Expo) + Next.js PWA + Tauri |

## Diferenciais

- **Speculative Decoding Distribuído**: mobile gera draft tokens, PC verifica — sem pipeline bubbles.
- **Semantic Affinity Routing**: cache semântico distribuído — a rede é a memória coletiva.
- **Circadian-Aware Scheduling**: cargas seguem o terminador terrestre (aproveitam noite/ociosidade).
- **Self-Healing via Evolução Genética**: parâmetros evoluem (pop 20, crossover 70%, mutação 15%).
- **Custo ~zero/sessão**: x402 micropagamentos off-chain via Solana State Channels.
- **80/20 Split**: 80% para o operador do nó, 20% para a rede — competitivo vs Vast.ai.

## Roadmap & Estado

```
Sprint 0 ████████████████████ 100%  Planeamento, ADRs
Sprint 1 ████████████████████ 100%  Fundação (WASM, WebTransport, ExecuTorch, 8 pacotes)
Sprint 2 ████████████████░░░░  80%  Mesh Local L1 (Pipeline, Segment Means ✓ | DSD pendente)
Sprint 3 ░░░░░░░░░░░░░░░░░░░░   0%  Mobile App + Thermal
Sprint 4 ░░░░░░░░░░░░░░░░░░░░   0%  Segurança + Blockchain
Sprint 5 ░░░░░░░░░░░░░░░░░░░░   0%  Federated Learning
Sprint 6 ░░░░░░░░░░░░░░░░░░░░   0%  Integração + Beta
```

### O que funciona HOJE (podes executar)

| Componente | Estado |
|-----------|--------|
| `pnpm install` + `pnpm build` | ✅ 8/8 packages |
| `pnpm test` | ✅ 52 testes passam |
| WebTransport echo demo (`pnpm example:echo`) | ✅ QUIC ~170ms, roundtrip ~15ms |
| Pipeline Parallelism (código + testes) | ✅ Layer partition por capacidade |
| Segment Means compression (código + testes) | ✅ Compressão lossy de ativações |
| WASM core (Rust → WebAssembly) | ✅ 153KB otimizado |

### O que NÃO funciona ainda (próximas sprints)

| Funcionalidade | Previsão |
|---------------|----------|
| **Inferência real num PC** | Sprint 3-4 |
| **App mobile/desktop funcional** | Sprint 3 |
| **Malha P2P entre múltiplos PCs** | Sprint 2-3 |
| **Distributed Speculative Decoding** | Sprint 2 (pendente) |
| **Blockchain (x402, State Channels)** | Sprint 4 |
| **Federated Learning em dispositivos** | Sprint 5 |
| **TEE Remote Attestation** | Sprint 4 |
| **Beta público instalável** | Sprint 6 (target) |

> **⚠️ SKYNET está em desenvolvimento ativo (Pre-Alpha).** Código funcional, testado e buildável — mas não instalável por utilizadores finais. Se és developer ou early adopter, contribui ou acompanha em [github.com/msrovani/SKYNET](https://github.com/msrovani/SKYNET).

## Quick Start

```bash
# Instalar dependências
pnpm install

# Build todos os pacotes
pnpm build

# Correr testes
pnpm test

# WebTransport echo demo (Hello World)
pnpm --filter @skynet/p2p-mesh-network example:setup
pnpm --filter @skynet/p2p-mesh-network example:echo
```

## Repositório

```
SKYNET/
├── packages/
│   ├── core-wasm-engine/        ← Rust→WASM (tensors, thermal, evolution)
│   ├── p2p-mesh-network/        ← Transporte P2P, CRDT, pipeline parallelism
│   ├── inference-runtime/       ← ExecuTorch, model loader
│   ├── tee-attestation-layer/   ← Remote attestation, Proof of Time
│   ├── blockchain-client/       ← Solana x402, State Channels
│   ├── fl-training-client/      ← FedYogi, Secure Aggregation
│   ├── app-ui-orchestrator/     ← React Native + Next.js PWA
│   └── desktop-node-agent/      ← Tauri (GPU, power, node service)
├── docs/                        ← ADRs, planning, analysis
├── CHANGELOG.md
└── README.md
```

## Apoiar

- **Código**: contribuições via PR — issues, features, testes.
- **Computação**: instala o nó SKYNET (em breve nos stores).
- **Parcerias**: datacenters L3, ISP para TURN/STUN descentralizado.

---

> *"SKYNET não é um projeto fechado. SKYNET é uma grelha de utilidade pública — sem núcleo, sem dono, auto-evolutiva."*

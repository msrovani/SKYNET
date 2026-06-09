# SKYNET Beta — Guia de Instalação Cross-Platform

## Pré-requisitos por Plataforma

### Todas as plataformas

| Ferramenta | Versão | Instalação |
|------------|--------|------------|
| Git | qualquer | [git-scm.com](https://git-scm.com/) — Windows/macOS/Linux |
| Node.js | ≥20.0.0 | Ver abaixo |
| pnpm | ≥9.0.0 | `npm install -g pnpm` (após Node.js) |
| Rust | 1.96+ | `rustup` — opcional, só para WASM build |

### Node.js — instalação recomendada (cross-platform)

Usar **version manager** em vez de installer direto — permite trocar de versão sem conflitos:

| Plataforma | Gestor | Comando |
|------------|--------|---------|
| **Windows** | [nvm-windows](https://github.com/coreybutler/nvm-windows) | `nvm install 20` |
| **macOS / Linux** | [fnm](https://github.com/Schniz/fnm) | `fnm install 20` |
| **macOS / Linux** | [nvm](https://github.com/nvm-sh/nvm) | `nvm install 20` |
| **Qualquer** | Download direto | [nodejs.org](https://nodejs.org/) ≥20 LTS |

### Rust — instalação (opcional, só para WASM)

```bash
# Todas as plataformas
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown
```

### Build tools por plataforma

| Plataforma | Pacotes necessários | Comando |
|------------|---------------------|---------|
| **Windows** | Visual Studio Build Tools (ou VS2022 com workload "Desktop development with C++") | [visualstudio.microsoft.com](https://visualstudio.microsoft.com/visual-cpp-build-tools/) |
| **macOS** | Xcode Command Line Tools | `xcode-select --install` |
| **Linux (Debian/Ubuntu)** | build-essential, pkg-config, libssl-dev | `sudo apt install build-essential pkg-config libssl-dev` |
| **Linux (Fedora/RHEL)** | gcc, pkg-config, openssl-devel | `sudo dnf install gcc pkg-config openssl-devel` |
| **Linux (Arch)** | base-devel, pkg-config, openssl | `sudo pacman -S base-devel pkg-config openssl` |

> ⚠ Rust e build tools **não são obrigatórios** — o `pnpm build` tem fallback automático para TypeScript stub se `cargo` não estiver disponível.

---

## Setup (todas as plataformas)

```bash
# 1. Clonar
git clone https://github.com/msrovani/SKYNET.git
cd SKYNET

# 2. Instalar dependências
pnpm install

# 3. Build (8/8 packages)
pnpm build

# 4. Testes (395 testes, 16/16 tasks)
pnpm test
```

### Troubleshooting de setup

| Problema | Causa | Solução |
|----------|-------|---------|
| `pnpm: command not found` | pnpm não instalado | `npm install -g pnpm` |
| `ERR_PNPM_OUTDATED_LOCKFILE` | lockfile desatualizado | `pnpm install --no-frozen-lockfile` |
| `No matching files in src/` (lint) | ESLint sem config local | Ignorar — não bloqueia build/test |
| WASM build falha | Rust/cargo não instalado | Ignorar — fallback para TypeScript stub |
| `Error: WebTransport not available` | Certificados não gerados | Correr `example:setup` primeiro |

---

## Validação Rápida (5 minutos)

### 1. WebTransport P2P

```bash
# Gerar certificados (primeira vez apenas)
pnpm --filter @skynet/p2p-mesh-network example:setup

# Echo server + client no mesmo processo
pnpm --filter @skynet/p2p-mesh-network example:echo
# Esperado: Connected in ~120ms, Echo received in ~3ms
```

### 2. Testes individuais por pacote

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

### 3. App UI Web (Next.js)

```bash
pnpm --filter @skynet/app-ui-orchestrator build:web
# Esperado: Compiled successfully, 4/4 static pages
# Output em: packages/app-ui-orchestrator/apps/web/out/
```

### 4. E2E Integration

```bash
pnpm --filter @skynet/desktop-node-agent test
# 21 tests — AgentHost + SemanticRouter + TEE + Inference + full pipeline
```

---

## WASM Build (opcional — só com Rust)

```bash
pnpm --filter @skynet/core-wasm-engine build
# Fallback automático para TypeScript stub se Rust não estiver disponível
```

### Windows — nota sobre paths acentuados

Se o teu username ou caminho do projeto contém acentos (ex: `C:\Users\João\Projects`), o linker GNU pode falhar. O build.cjs já contorna isto usando `%TEMP%\skynet-wasm-build` (ASCII-only). Se ainda assim falhar:

```powershell
# Forçar temp ASCII
$env:TEMP = "C:\temp"
pnpm --filter @skynet/core-wasm-engine build
```

### macOS — nota sobre Xcode

Se o WASM build falhar com `linker not found`, instala as Xcode CLI tools:

```bash
xcode-select --install
```

---

## Desktop Node (Tauri) — opcional

O `desktop-node-agent` é uma app desktop Tauri que corre como nó L1/L2. Para build nativo:

```bash
cd packages/desktop-node-agent
pnpm exec tauri build
```

Pré-requisitos por plataforma:

| Plataforma | Deps |
|------------|------|
| **Windows** | WebView2 (já vem no Windows 10+) |
| **macOS** | Xcode CLI tools |
| **Linux** | `sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf` (Debian/Ubuntu) |

---

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

## Arquitetura

```
8 packages em monorepo Turborepo
├── core-wasm-engine      Rust→WASM (tensors, thermal, evolution)
├── p2p-mesh-network      Transport, CRDT, routing, scheduling
├── inference-runtime     ExecuTorch, ONNX, MLX adapters
├── blockchain-client     Solana x402, State Channels, Multi-chain
├── fl-training-client    FedYogi, Secure Aggregation
├── tee-attestation-layer SGX/SEV/CCA attestation
├── app-ui-orchestrator   React Native + Next.js PWA
└── desktop-node-agent    Tauri desktop node (Win/Mac/Linux)
```

## Limitações Conhecidas (Alpha)

| Limitação | Plataforma | Nota |
|-----------|------------|------|
| WebGPU bindings | Safari/Firefox | WASM core falta APIs WebGPU — stub TypeScript funciona |
| ExecuTorch device test | Android/iOS | Requer dispositivo físico com ExecuTorch instalado |
| Certificados auto-assinados | Todas | WebTransport exemplo gera certificados via node-forge |
| Rede P2P multi-máquina | Todas | Apenas testado em localhost (echo) |
| Simulate mode | Todas | Blockchain, FL e TEE correm em modo simulado — sem rede real |

## Reporting Bugs

Issues em [github.com/msrovani/SKYNET/issues](https://github.com/msrovani/SKYNET/issues) com:
- Output de `pnpm test`
- Output de `pnpm build`
- Sistema operativo + versão
- Logs de erro

## Contribuir

PRs bem-vindos. Docs de contribuição: `CONTRIBUTING.md` (em breve).

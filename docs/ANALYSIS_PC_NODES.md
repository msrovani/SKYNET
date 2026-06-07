# Análise de Viabilidade: Inclusão de PC (Windows, Mac, Linux) como Nós

## 1. Resumo Executivo

**Viabilidade: ✅ ALTAMENTE VIÁVEL — IMPLEMENTAÇÃO IMEDIATA**

PCs desktop/laptop oferecem **10-100x mais capacidade computacional** que dispositivos móveis, com **custo energético marginal** e **disponibilidade 24/7**. A inclusão de PCs como nós L2 (Rede Global) é o multiplicador de força mais importante para a rede SKYNET.

---

## 2. Estado da Arte por Plataforma (2026)

### 2.1 Windows

| Tecnologia | Status | Backend GPU | Notas |
|-----------|--------|-------------|-------|
| ExecuTorch | ✅ Suportado (v1.2) | CUDA (experimental), XNNPACK | Windows native WIP (WSL funciona) |
| WebGPU (navegador) | ✅ Chrome 113+, Edge 113+ | Direct3D 12 | Universal |
| WebGPU (nativo wgpu) | ✅ Vulkan/DX12 | Vulkan, DX12 | Via rust `wgpu` crate |
| CUDA | ✅ Maduro | NVIDIA GPUs | Ecossistema AI mais maduro |
| DirectML | ✅ Windows-only | AMD, Intel, NVIDIA | Microsoft AI stack |
| ONNX Runtime | ✅ Completo | CUDA, DirectML, CPU | Produção |

**Força:** Maior base de utilizadores gamers (RTX GPUs), CUDA nativo.
**Fraqueza:** Windows native no ExecuTorch ainda WIP (WSL como fallback).

### 2.2 macOS

| Tecnologia | Status | Backend GPU | Notas |
|-----------|--------|-------------|-------|
| ExecuTorch | ✅ Suportado (v1.2) | CoreML, Metal (experimental) | Apple Silicon optimizado |
| WebGPU (navegador) | ✅ Safari 26+ | Metal | macOS Tahoe 26+ |
| WebGPU (nativo wgpu) | ✅ Metal | Metal | Performance nativa |
| MLX | ✅ Apple-only | Apple Silicon | Framework ML da Apple |

**Força:** Apple Silicon unificado (CPU+GPU+NPU), baixo consumo energético, MLX framework nativo.
**Fraqueza:** Sem NVIDIA CUDA, ecossistema AI menos diverso, hardware mais caro.

### 2.3 Linux

| Tecnologia | Status | Backend GPU | Notas |
|-----------|--------|-------------|-------|
| ExecuTorch | ✅ Suportado (v1.2) | CUDA, XNNPACK, Vulkan, OpenVINO | Suporte mais completo |
| WebGPU (navegador) | ⚠️ Chrome (flag), Firefox (em progresso) | Vulkan | Experimental |
| WebGPU (nativo wgpu) | ✅ Vulkan | Vulkan | Performance nativa total |
| ROCm | ✅ AMD-only | AMD GPUs | PyTorch nativo |
| CUDA | ✅ Maduro | NVIDIA GPUs | Produção |

**Força:** Suporte ExecuTorch mais completo, ROCm para AMD, flexibilidade total.
**Fraqueza:** WebGPU em browser requer flag, fragmentação de distros.

---

## 3. Análise de Capacidade por Classe de Dispositivo

### 3.1 Capacidade Computacional

| Classe | VRAM | Inferência (tok/s) | Modelos Comportáveis | Consumo | Ganho/mês (50% util) |
|--------|------|-------------------|---------------------|---------|---------------------|
| Smartphone (médio) | 4-8GB | 5-15 tok/s (1B) | <3B params INT4 | 5-15W | ~$5-15 |
| Smartphone (topo) | 8-12GB | 15-40 tok/s (1-3B) | <3B params INT4 | 10-20W | ~$10-30 |
| Laptop (integrado) | 8-16GB | 10-30 tok/s (1-3B) | <7B params INT4 | 15-35W | ~$15-40 |
| **PC mid-range (RTX 3060)** | **12GB** | **40-80 tok/s (7B)** | **<13B params INT4** | **150-200W** | **$50-130** |
| **PC high-end (RTX 4090)** | **24GB** | **150-300 tok/s (7-13B)** | **<70B params INT4** | **350-500W** | **$500-1,000** |
| **Workstation (RTX 5090)** | **32GB** | **200-400 tok/s (13-30B)** | **<70B params** | **400-600W** | **$600-1,200** |
| Servidor (A100/H100) | 80GB | 500+ tok/s (70B+) | Qualquer modelo | 400-700W | $3,000-5,000 |

> **Conclusão:** Um único PC high-end (RTX 4090) equivale a **10-20 smartphones topo de gama** em capacidade de inferência, com **custo de hardware 2-3x menor**.

### 3.2 Modelos de Monetização Existentes (Validação de Mercado)

| Plataforma | Modelo | Ganho RTX 4090/mês | Utilização |
|-----------|--------|-------------------|------------|
| **Vast.ai** | Marketplace GPU spot | $500-1,000 | 50-70% |
| **Salad** | Container workloads | $200-600 | 30-60% |
| **Aethir** | DePIN enterprise | $25k-40k/8-GPU nó | 95%+ |
| **Project Huginn** | DePIN GPU pool | €0.60-2.80/hora | Variável |
| **FAR Labs** | Inference network | Em beta | Em beta |
| **Titan Network** | DePIN content delivery | $50-200 | 4M devices |

> **Conclusão:** O mercado já valida que PCs podem gerar $500-1,000/mês por GPU high-end. A SKYNET precisa oferecer **melhor split (80% para o nó) + inferência de maior valor** para competir.

---

## 4. Análise de Prós e Contras

### ✅ Vantagens de Incluir PCs

| Vantagem | Impacto | Explicação |
|----------|---------|------------|
| **10-100x mais compute** | 🔴 Crítico | PC high-end processa modelos que smartphones nem carregam |
| **VRAM elevada (12-32GB)** | 🔴 Crítico | Permite modelos 7B-70B (vs 1-3B em mobile) |
| **Disponibilidade 24/7** | 🟡 Alto | PCs gamers ficam ligados mas idle 16-20h/dia |
| **Rede elétrica estável** | 🟡 Alto | Sem preocupação com bateria (vs mobile que desliga) |
| **Internet estável (Ethernet)** | 🟢 Médio | Menos latência, sem perda de conexão |
| **Arrefecimento ativo** | 🟢 Médio | Sem thermal throttling severo (vs mobile que perde 69%) |
| **CUDA ecosystem** | 🔴 Crítico | Acesso a bibliotecas maduras (TensorRT, vLLM, Triton) |
| **Já existe procura** | 🟡 Alto | Mercado DePIN GPU já validado ($500-1k/mês por GPU) |

### ❌ Desvantagens e Mitigações

| Desvantagem | Severidade | Mitigação |
|------------|-----------|-----------|
| **Consumo elétrico (150-600W)** | 🟡 Média | Pagamento proporcional ao trabalho vs electricidade; optimização dinâmica de frequência |
| **Concorrência com gaming** | 🟢 Baixa | Nos usam GPU quando o user não está a jogar (idle detection + task scheduling) |
| **Ruído (ventoinhas)** | 🟢 Baixa | Modo silencioso (limitar potência das 22h às 8h); aceite por gamers |
| **Setup mais complexo** | 🟢 Média | Instalador one-click (Tauri/Electron); deteção automática de hardware |
| **Windows sem ExecuTorch nativo** | 🟡 Média | WSL como ponte; ONNX Runtime como fallback; WebGPU via navegador |
| **CUDA lock-in (NVIDIA)** | 🟡 Média | Suporte a AMD via ROCm + Vulkan via WebGPU/wgpu como abstração universal |

---

## 5. Arquitetura Proposta para PCs

### 5.1 Hierarquia de 3 Níveis + PC Layer

```
┌──────────────────────────────────────────────────────────────┐
│  L0 — Nó Local (todos os dispositivos)                       │
│  Cache de inferência, pré-processamento, embeddings          │
│  Smartphone: WASM + ExecuTorch (XNNPACK/Vulkan)             │
│  PC: WASM + ExecuTorch (CUDA/Metal/XNNPACK)                 │
├──────────────────────────────────────────────────────────────┤
│  L1 — Mesh Local (LAN/P2P)                                   │
│  Fragmentação colaborativa entre dispositivos próximos       │
│  WebTransport + CRDT sync                                    │
│  PC atua como "nó coordenador" da mesh local (mais CPU/RAM) │
├──────────────────────────────────────────────────────────────┤
│  L2 — Rede Global (Internet)                                 │
│  PCs high-end como nós de inferência primários              │
│  Modelos 7B-70B (que não cabem em mobile)                   │
│  Smartphones como nós de pré-processamento/embedding         │
│  Pagamento via x402 (Solana) — split 80/20 (nó/rede)        │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Níveis de Participação para PCs

| Nível | Hardware Mínimo | Modelos | Ganho Estimado/mês | Disponibilidade |
|-------|----------------|---------|-------------------|----------------|
| **Tier 5** | Qualquer PC com CPU (sem GPU) | Embeddings, pré-processamento | $5-15 | Background |
| **Tier 4** | GPU 4-6GB (GTX 1650, RTX 3050) | Modelos <3B INT4 | $15-50 | 8-12h/dia |
| **Tier 3** | GPU 8-12GB (RTX 3060-4070) | Modelos <13B INT4 | $50-130 | 12-16h/dia |
| **Tier 2** | GPU 16-24GB (RTX 3090-4090) | Modelos <30B INT4 | $130-500 | 16-20h/dia |
| **Tier 1** | GPU 32GB+ (RTX 5090, A-series) | Modelos <70B INT4 | $500-1,200+ | 24h/dia |

### 5.3 Stack Tecnológica por SO

```
                    ┌─────────────────────────────┐
                    │     SKYNET Node Agent        │
                    │  (Tauri/Electron Desktop)    │
                    ├─────────────────────────────┤
                    │  WebGPU (wgpu/wasm)          │
                    │  → Vulkan | Metal | DX12     │
                    ├─────────────────────────────┤
                    │  ExecuTorch Runtime          │
                    │  → CUDA | Metal | XNNPACK    │
                    ├─────────────────────────────┤
                    │  ONNX Runtime (fallback)     │
                    │  → CUDA | DirectML | CPU     │
                    ├─────────────────────────────┤
                    │  WebTransport (QUIC)         │
                    └─────────────────────────────┘

  Windows:   DX12 + CUDA + DirectML + WSL (ExecuTorch)
  macOS:     Metal + CoreML + MLX
  Linux:     Vulkan + CUDA + ROCm + OpenVINO
```

---

## 6. Decisões Arquiteturais (ADRs Novas)

### ADR-007: PC Desktop como Nó L2 Primário

**Contexto:** PCs têm 10-100x mais capacidade que smartphones, com VRAM suficiente para modelos 7B-70B.

**Decisão:** PCs integram-se como nós L2 (Rede Global) com capacidade de inferência de modelos grandes. Smartphones mantêm-se como L0 (cache/preprocessing) e L1 (mesh local).

**Consequência:** A rede pode oferecer inferência de modelos que smartphones não conseguem executar (13B+), aumentando drasticamente o valor da rede para clientes empresariais.

### ADR-008: Aplicação Desktop Nativa (Tauri) vs Browser

**Contexto:** ExecuTorch native (CUDA/Metal) requer binário nativo, não funciona em browser. WebGPU via browser tem performance inferior.

**Decisão:** Aplicação desktop nativa com **Tauri** (Rust + WebView) para PCs. A PWA (browser) funciona como fallback com WebGPU apenas.

**Consequência:** Instalação one-click, acesso a CUDA/Metal nativo, foreground/background service, integração com sistema (idle detection, power management).

### ADR-009: Abstração de Backend GPU via wgpu + ExecuTorch

**Contexto:** CUDA (NVIDIA), ROCm (AMD), Metal (Apple), DirectML (Microsoft) — cada um requer stack diferente.

**Decisão:** Usar **wgpu** como abstração universal de GPU (Vulkan/Metal/DX12/WebGPU) para kernels de computação geral. ExecuTorch gerencia a inferência de modelos (com backend CUDA/Metal/XNNPACK). ONNX Runtime como fallback universal.

**Consequência:** Um único código base funciona em Windows, Mac, Linux. Performance próxima do nativo em cada plataforma (~5-15% overhead vs CUDA puro).

### ADR-010: Split 80/20 para PCs

**Contexto:** Concorrentes (Vast.ai, Salad) pagam 70-85% aos fornecedores. PCs consomem $50-100/mês de electricidade.

**Decisão:** Split **80% para o nó, 20% para a rede**. Pagamento por token inferido (não por hora), permitindo que nós com GPUs mais rápidas ganhem mais.

**Consequência:** PC high-end (RTX 4090) pode ganhar $500-1,000/mês bruto, $400-900 líquido após electricidade. Competitivo com Vast.ai/Salad.

---

## 7. Impacto na Arquitetura Existente

### 7.1 Novo Pacote: `desktop-node-agent`

```
skynet-monorepo/
└── packages/
    └── desktop-node-agent/       # NOVO
        ├── src-tauri/            # Rust (Tauri)
        │   ├── src/
        │   │   ├── main.rs       # Entry point, system tray
        │   │   ├── gpu_detect.rs # Deteção automática de GPU
        │   │   ├── power_mgmt.rs # Gestão de energia (idle detection)
        │   │   └── node_service.rs # Serviço foreground
        │   └── Cargo.toml
        ├── src/                  # TypeScript (frontend)
        │   ├── App.tsx
        │   ├── components/
        │   └── hooks/
        ├── package.json
        └── tauri.conf.json
```

### 7.2 Modificações nos Pacotes Existentes

| Pacote | Modificação |
|--------|-----------|
| `core-wasm-engine` | Adicionar `detect_gpu_backend()` — CUDA, Metal, Vulkan detection |
| `inference-runtime` | Adicionar modo Desktop: ExecuTorch CUDA backend, MLX (macOS), ONNX Runtime DirectML (Windows) |
| `p2p-mesh-network` | PC como relay/node coordinator da mesh local (mais largura de banda) |
| `blockchain-client` | Prioridade de tasks para PCs (maior capacidade = maior pagamento) |
| `fl-training-client` | PCs como "aggregator nodes" para treino federado (mais CPU/RAM para agregação) |
| `app-ui-orchestrator` | Adicionar apps/desktop (Tauri) |

---

## 8. Análise de Mercado e Concorrência

### 8.1 Concorrentes DePIN GPU

| Projeto | Foco | Dispositivos | Ganho Nó | Diferenciação SKYNET |
|---------|------|-------------|----------|---------------------|
| **Project Huginn** | Treino distribuído | PCs + mobile | €0.60-2.80/h | Inferência (não treino); mercado maior |
| **Aethir** | Enterprise GPU cloud | Servidores/PCs | $25k-40k/mês (8-GPU) | Foco em nós individuais, não clusters |
| **FAR Labs** | Inference network | PCs | Em beta | SKYNET já definiu stack técnica |
| **Titan Network** | Content delivery | PCs + mobile | $50-200/mês | Inferência AI (maior valor que CDN) |
| **Shaga** | Cloud gaming + datasets | PCs gaming | $0.10-0.50/h | AI inference > gaming data |
| **Salad** | Container workloads | PCs gaming | $50-200/mês | AI inference especializada (maior margem) |
| **Vast.ai** | GPU marketplace | PCs + servidores | $500-1k/mês (4090) | Split 80% (vs 70% Vast) + DePIN nativo |

### 8.2 Vantagem Competitiva SKYNET

1. **DePIN nativo** — Não é apenas marketplace, é uma rede física descentralizada com tokenomics, governança e provas criptográficas
2. **Split 80%** — Melhor que Vast.ai (~70%), muito melhor que cloud centralizada
3. **Inferência de alto valor** — Modelos empresariais pagam mais que rendering/gaming
4. **Multi-dispositivo** — PC + mobile + smart TV = pool único (concorrentes focam só PC)
5. **Federated Learning** — Diferencial único: usar PCs para treino federado empresarial
6. **TEE + Remote Attestation** — Segurança empresarial que concorrentes não oferecem

---

## 9. Riscos Específicos de PCs

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| **Custo elétrico supera ganho** | Média (depende da região) | Alto | Pagamento por token, não por hora; bloqueio geográfico para regiões com energia cara |
| **User desliga PC durante inferência** | Alta | Médio | Checkpoint frequente + timeout + penalidade no reliability score |
| **GPU mining competition** | Baixa (mining morreu em 2026) | Baixo | GPU mining não é rentável desde 2025 (ASICs dominam) |
| **Wear and tear da GPU** | Média | Médio | Limite de temperatura configurável (65°C, 75°C, 85°C); modo eco |
| **Concorrência de plataformas estabelecidas** | Alta | Médio | Diferenciação via DePIN + FL + TEE + split 80% |
| **Windows sem ExecuTorch CUDA nativo** | Média (temporário) | Médio | WSL como bridge; ONNX Runtime DirectML como fallback |

---

## 10. Conclusão e Recomendação

### 10.1 Viabilidade: ✅ CONFIRMADA

**A inclusão de PCs Windows, Mac e Linux como nós é não apenas viável, como ESTRATÉGICA para o sucesso da SKYNET.** Sem PCs, a rede fica limitada a modelos <3B parâmetros (o que cabe num smartphone). Com PCs, a rede suporta modelos 7B-70B, abrindo o mercado empresarial.

### 10.2 Prioridade de Implementação

1. **Imediata (Sprint 1-2):** `desktop-node-agent` (Tauri) com deteção de GPU, suporte CUDA/Metal/XNNPACK
2. **Curto prazo (Sprint 2-3):** Windows native ExecuTorch (WSL como bridge até suporte nativo)
3. **Médio prazo (Sprint 4-5):** ROCm (AMD), DirectML fallback, MLX (macOS)
4. **Longo prazo:** Instalador one-click com sistema tray, idle detection automático

### 10.3 Impacto nos Sprints

| Sprint | Alteração |
|--------|-----------|
| Sprint 1 | Adicionar `packages/desktop-node-agent` ao monorepo |
| Sprint 2 | Tauri app com ExecuTorch CUDA + Metal + XNNPACK |
| Sprint 3 | Idle detection, power management, foreground service |
| Sprint 4 | Remote Attestation para PCs (TEE + SGX/SEV) |
| Sprint 5 | PCs como aggregator nodes para Federated Learning |
| Sprint 6 | Instalador one-click + dashboard + beta integrado |

### 10.4 Projeção Financeira (PCs vs Mobile)

| Métrica | Apenas Mobile | Com PCs | Ganho |
|---------|--------------|---------|-------|
| Modelos suportados | <3B params | <70B params | **23x** |
| Receita por nó/mês | $5-30 | $50-1,200 | **10-40x** |
| Clientes empresariais | Limitados | Todos | **Mercado total** |
| Nós potenciais (2026) | 4B smartphones | 1.5B PCs + 200M gaming GPUs | **1.7B adicionais** |
| Custo por inferência | $0.001-0.01 | $0.0001-0.001 | **10x mais barato** |

---

## 11. Anexo: Benchmark de GPUs Desktop vs Mobile

| GPU | VRAM | FP16 TFLOPS | INT8 TOPS | Llama 3.2 1B (tok/s) | Llama 3.1 8B (tok/s) | Preço |
|-----|------|-------------|-----------|---------------------|---------------------|-------|
| **Snapdragon 8 Gen 3 (mobile)** | 8GB shared | 3.7 | 7.4 | 12-15 | N/A | $800 (telemóvel) |
| **Apple A17 Pro (mobile)** | 8GB shared | 4.0 | 8.0 | 15-20 | N/A | $1,000 (telemóvel) |
| **Apple M3 Max (laptop)** | 16-36GB unified | 18.0 | 36.0 | 30-50 | 5-10 | $3,500 |
| **RTX 3060 12GB** | 12GB GDDR6 | 12.7 | 25.4 | 40-60 | 8-15 | $300 |
| **RTX 4070 Super** | 12GB GDDR6X | 35.4 | 70.8 | 60-100 | 15-25 | $600 |
| **RTX 4090** | 24GB GDDR6X | 82.6 | 165.2 | 150-250 | 40-60 | $1,600 |
| **RTX 5090** | 32GB GDDR7 | 104.9 | 209.8 | 200-350 | 55-80 | $2,000 |
| **A100 80GB** | 80GB HBM2e | 78.0 | 312.0* | 300-500 | 80-120 | $15,000 |
| **H100 80GB** | 80GB HBM3 | 200.0 | 400.0* | 500-800 | 150-250 | $30,000 |

*INT8 TOPS com sparsity

> **Ratio Custo-Benefício:** RTX 4090 (custo $1.6k) oferece ~5x a capacidade de inferência de um smartphone topo de gama ($1k), com **custo 60% maior para 5x mais capacidade**. Em termos de **$/tok**, PC é 3x mais eficiente que mobile.

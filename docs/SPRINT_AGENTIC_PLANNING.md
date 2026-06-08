# SKYNET DePIN — Sprint Agente: Camada de Agentes Distribuídos

> **Estado:** Planeamento (Pré-Sprint 4)
> **Baseado em:** Pesquisa académica e industrial Maio 2026
> **Pré-requisitos:** Sprint 2 concluído (DSD, Pipeline, Checkpoints), Sprint 3 (Mobile + Thermal)

---

## 1. Research Findings Sintetizados

### 1.1 Symphony (2025-2026) — Framework Multi-Agente Descentralizado

**Fonte:** `arxiv.org/html/2508.20019` — GradientHQ

**Proposta:** Framework descentralizado onde LLMs ligeiros (7B) em GPUs consumer-grade colaboram através de três mecanismos:

1. **Ledger Distribuído de Capacidades** — regista ownership, contribuições, domínios de expertise de cada agente, indexado por endereço criptográfico DID-compliant
2. **Protocolo Beacon** — alocação dinâmica de tarefas: o planner emite um Beacon com requisitos da sub-tarefa; cada agente avalia o seu `capability vector` e devolve um `capability match score`; o agente com maior score é selecionado
3. **Multi-CoT Weighted Voting** — 3 Chain-of-Thought independentes são executadas por agentes diferentes; os resultados são agregados por weighted majority vote, ponderado pelo confidence score de cada CoT

**Resultados:**
- +15-42% accuracy em BBH (raciocínio complexo) vs AutoGen/CrewAI
- Overhead de orquestração <5%
- Robusto a 20% de falhas de nós
- Comunicação O(log N) gossip, O(L) beacon complexity

**Relevância para SKYNET:** O Beacon protocol é análogo ao nosso `PeerDiscovery` + `RoleElection`; o capability vector mapeia-se à nossa `NodeCapability`.

### 1.2 Federation of Agents (FoA) — 2025-2026

**Fonte:** `arxiv.org/pdf/2509.20175`

**Proposta:** Fabric de comunicação semantics-aware para federações de agentes em larga escala.

**Inovações:**
1. **Versioned Capability Vectors (VCVs)** — perfis legíveis por máquina que transformam capacidades, custos e constraints em embeddings semânticos pesquisáveis
2. **Índice HNSW Sharded** — matching sub-linear em O(log N) para descobrir o agente certo para cada tarefa
3. **Decomposição Colaborativa** — agentes compatíveis propõem decomposições; o orchestrator funde-as num DAG de consenso
4. **Smart Clustering** — agentes no mesmo subtask refinam em k rondas, depois votam consenso

**Resultados:** 13× improvement sobre single-model baselines em HealthBench.

**Relevância para SKYNET:** Os VCVs podem ser implementados como extensão de `capability.rs`. O HNSW sharded pode usar o `knowledge_graph.rs` como base.

### 1.3 AdaptOrch (2026) — Orquestração Adaptativa

**Fonte:** `arxiv.org/pdf/2602.16873`

**Tese central:** Quando os LLMs convergem em capacidade, a **topologia de orquestração** torna-se o fator dominante sobre a capacidade do modelo individual.

**Quatro topologias canónicas:**
| Topologia | Descrição | Quando usar |
|-----------|-----------|-------------|
| Paralela (τP) | Agentes independentes, resultados fundidos | Tarefas com baixo acoplamento |
| Sequencial (τS) | Agentes em cadeia, output de um é input do próximo | Raciocínio profundo, dependências fortes |
| Hierárquica (τH) | Arbiter agent sintetiza outputs de múltiplos | Disputas, decisões com conflito |
| Híbrida (τX) | Combinação das anteriores | 49.7% dos casos reais |

**Topology Routing Algorithm:** Analisa o DAG de dependências da tarefa (parallelism width, critical path depth, inter-subtask coupling) e seleciona a topologia ótima em O(|V|+|E|).

**Resultados:** 12-23% improvement sobre topologia fixa.

**Relevância para SKYNET:** O `PipelineManager` já faz partition de layers — podemos estendê-lo para escolher topologias de agentes.

### 1.4 ROMA (2026) — Recursive Open Meta-Agent

**Fonte:** `arxiv.org/pdf/2602.01848`

**Proposta:** Framework recursivo, domain-agnostic, com quatro papéis modulares:

| Papel | Função |
|-------|--------|
| Atomizer | Decide se uma tarefa é atómica ou decomponível |
| Planner | Decompõe em DAG de sub-tarefas MECE (Mutually Exclusive, Collectively Exhaustive) |
| Executor | Executa tarefas atómicas (pode ser paralelo) |
| Aggregator | Sintetiza, verifica e comprime outputs dos filhos |

**Diferencial:** A mesma estrutura recursiva aplica-se a todos os níveis da árvore de tarefas. Aggregators comprimem resultados intermédios antes de passar ao pai — controla o crescimento de contexto.

**Resultados:** +9.9% accuracy em SEAL-1 (raciocínio sobre evidências web conflituosas).

**Relevância para SKYNET:** O padrão Atomizer→Planner→Executor→Aggregator é ideal para o nosso modelo de "frações": cada fração é o output de um Executor, o Aggregator monta o resultado final.

### 1.5 GraSP (2026) — Graph-Structured Skill Compositions

**Fonte:** `arxiv.org/abs/2604.17870`

**Proposta:** Arquitetura de skill graph executável. Compila flat skill sets em DAGs tipados com arestas precondition-effect.

**Cinco operadores de reparação:**
- `INSERT`, `DELETE`, `REPLACE`, `REORDER`, `SPLIT`
- Falha só invalida descendentes topológicos — replanning reduzido de O(N) para O(dʰ)

**Resultados nos 4 benchmarks:** Melhor performance em todas as configurações, até +19 pontos reward sobre o baseline mais forte, -41% environment steps.

**Relevância para SKYNET:** O modelo de reparação localizada (locality-bounded repair) é análogo ao nosso `handlePeerFailure` no `PipelineManager` — podemos generalizá-lo para agentes.

### 1.6 AgentMesh Ecosystem (2026)

**Fontes múltiplas:**
- `github.com/kunalshah017/AgentMesh` — Mercado descentralizado de agentes com pagamentos P2P via x402 (USDC), overlay Yggdrasil encriptado, identidade ENS
- `github.com/execute008/agentmesh` — Protocolo de coordenação com `AgentRegistry.sol` (ERC-8004), WebSocket P2P com assinaturas EIP-191, escrow on-chain
- `github.com/Ggrryta/agent-mesh` — Mesh de agentes Claude Code: Semantic Handshake, Behavior Annotation, Knowledge Accumulation, Circuit Breaker

**Ideias-chave:**
- Agentes têm identidade on-chain (wallet) e registam-se num registry
- Descoberta via scanning de chain ou DHT
- Pagamento por tool call via x402
- Reputação on-chain para trust

**Relevância para SKYNET:** Valida que x402 + identidade on-chain são o padrão emergente. O nosso `blockchain-client` já suporta x402.

### 1.7 ABI-Core (2026)

**Fonte:** `github.com/Joselo-zn/abi-core`

**Proposta:** Framework open-source para sistemas multi-agente distribuídos, self-organizing, local-first.

**Arquitetura:**
- Semantic Layer (Weaviate) — descoberta de agentes por embedding similarity
- Ephemeral Agents em Docker — spawn, execute, self-destruct
- OPA (Open Policy Agent) — governança, validação, emergency shutdown
- Guardian Agent — security gate antes de qualquer execução

**Relevância para SKYNET:** O modelo de agentes efémeros (spin up → work → die) é interessante para nós L0 com recursos limitados. A camada de segurança OPA pode inspirar o `tee-attestation-layer`.

---

## 2. Soluções Almejadas

### 2.1 Visão Geral: SKYNET Agentic Mesh

```
┌──────────────────────────────────────────────────────────────────┐
│                    SKYNET Agentic Mesh                            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  User Request Layer                                       │   │
│  │  "cria um website para a minha padaria"                   │   │
│  │  "analisa este contrato" / "gera um dashboard de vendas"  │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                      │
│  ┌────────────────────────▼─────────────────────────────────┐   │
│  │  Orchestration Layer                                     │   │
│  │                                                          │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │   │
│  │  │ Triage   │  │ Planner  │  │ Router   │  │ Aggreg. │ │   │
│  │  │ (Urgente │  │ (DAG de  │  │ (Semânt. │  │ (Síntese│ │   │
│  │  │  ou não) │  │  sub-tar)│  │  HNSW)   │  │  final) │ │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                      │
│  ┌────────────────────────▼─────────────────────────────────┐   │
│  │  Agent Mesh (P2P WebTransport + QUIC)                     │   │
│  │                                                          │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │
│  │  │ Webdesign│ │ Content  │ │ Image    │ │ Deploy   │   │   │
│  │  │ (L1-PC)  │ │ (L0-Mob) │ │ (L1-PC)  │ │ (L2-WS)  │   │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Settlement Layer (x402 + State Channels)                  │   │
│  │  Cada sub-tarefa → micropagamento → 80% agente / 20% rede │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Fluxo Completo: Pedido Agentico → Frações → Resposta

**Fase 1 — Triage** (Orchestrator)
- Classifica o pedido: urgência, domínio, complexidade
- Decide se pode ser resolvido por 1 agente ou requer decomposição
- Passa ao Planner se for multi-passo

**Fase 2 — Planning** (Planner Agent)
- Decompõe o pedido num DAG de sub-tarefas
- Cada sub-tarefa tem: `{ id, description, domain, tools_needed, depends_on[] }`
- Usa o padrão MECE (ROMA): sub-tarefas mutuamente exclusivas, colectivamente exaustivas
- O Planner é ele próprio um agente — corre num L1+

**Fase 3 — Semantic Routing** (Semantic Router)
- Cada sub-tarefa é embedded num vector semântico
- Consulta o índice HNSW para os top-K agentes compatíveis
- Matching combina: `similarity(embedding_subtask, embedding_agent)` + `cost_score` + `latency_score`
- Aloca a sub-tarefa ao melhor agente disponível

**Fase 4 — Execução Distribuída** (Specialized Agents)
- Cada agente recebe a sub-tarefa + contexto das dependências já resolvidas
- Executa localmente: modelo + tools → produz uma **fração** da solução (HTML, JSON, imagem otimizada, URL)
- Comprime a fração (análogo a Segment Means) antes de transmitir
- Se o agente falha, o Router tenta o próximo melhor (circuit breaker style)

**Fase 5 — Aggregation** (Aggregator Agent)
- Recebe todas as frações
- Valida consistência (ex: classes CSS combinam entre frações?)
- Se detecta incoerência, pede refinamento ao(s) agente(s) relevante(s)
- Monta a resposta final e retorna ao user

**Fase 6 — Settlement** (x402)
- Cada execução de agente gera uma micro-transação
- Liquidada via State Channels na Solana (custo ≈ $0.001/sessão)

### 2.3 Modelo de Dados

```typescript
// === Agent Registry ===
interface AgentRegistration {
  agentId: string;          // DID-compliant
  nodeId: string;           // peerId do nó SKYNET
  modelId: string;          // "qwen-2.5-7b-int4", "llama-3.2-3b"
  tools: string[];          // ["html-renderer", "cdn-upload", ...]
  systemPrompt: string;     // "You are a webdesign expert..."
  capabilityEmbedding: Float32Array;  // vector semântico
  costPerTask: number;      // em $USD
  maxConcurrent: number;
  avgLatencyMs: number;
}

// === Task Decomposition (DAG) ===
interface SubTask {
  id: string;
  parentTaskId: string;
  description: string;
  domain: string;           // "webdesign", "content", "image", "deploy"
  requiredTools: string[];
  dependsOn: string[];      // IDs de sub-tarefas que devem completar primeiro
  inputContext: any;        // output das dependências
  status: 'pending' | 'assigned' | 'running' | 'completed' | 'failed';
}

// === Fraction (partial result) ===
interface AgentFraction {
  subTaskId: string;
  agentId: string;
  nodeId: string;
  artifact: {
    mimeType: string;       // "text/html", "application/json", "image/webp"
    data: Uint8Array;
    sizeBytes: number;
    checksum: string;       // hash do artifact
  };
  confidence: number;       // 0.0 - 1.0
  latencyMs: number;
  costUsd: number;
}

// === Final Result ===
interface AggregatedResult {
  requestId: string;
  fractions: AgentFraction[];
  finalArtifact: {
    mimeType: string;
    data: Uint8Array;
    urls?: string[];
  };
  totalCostUsd: number;
  totalLatencyMs: number;
  agentsUsed: string[];
}
```

### 2.4 Extensão do SKYNET Existente

| Pacote SKYNET | Extensão para Agentes | Impacto |
|---------------|----------------------|---------|
| `p2p-mesh-network` | `AgentMeshManager` — descoberta + roteamento semântico + DAG planner | Médio (novo módulo) |
| `p2p-mesh-network` | `SemanticRouter` — índice HNSW sobre embeddings de capacidades | Baixo (usa `knowledge_graph.rs`) |
| `p2p-mesh-network` | `FractionAggregator` — síntese de frações com validação de consistência | Médio |
| `core-wasm-engine` | `agent_runtime.rs` — runtime para carregar agentes (modelo + tools + system prompt) | Alto (novo módulo Rust) |
| `core-wasm-engine` | `capability.rs` → VCVs com embeddings semânticos | Baixo (extensão) |
| `blockchain-client` | `agent-payment` — pagamento por fração via x402 | Baixo (x402 já existe) |
| `inference-runtime` | `AgentModel` — modelo + tools adapter | Médio |
| `app-ui-orchestrator` | Modo "Agent Query" — input livre, stream de frações, preview | Alto (UI nova) |
| `desktop-node-agent` | `AgentHost` — spawn/stop de agent runtimes no nó | Alto |

### 2.5 Topologias de Orquestração (AdaptOrch)

```typescript
type OrchestrationTopology = 'parallel' | 'sequential' | 'hierarchical' | 'hybrid';

interface TopologyDecision {
  topology: OrchestrationTopology;
  dag: SubTask[][];  // cada array é um layer paralelo
  justification: string;
}
```

O **Topology Router** analisa o DAG de sub-tarefas e decide:

- **Parallel** (τP): sub-tarefas independentes → executam concorrentemente
- **Sequential** (τS): dependências em cadeia → uma após a outra
- **Hierarchical** (τH): outputs conflituantes → arbiter agent decide
- **Hybrid** (τX): misto → paralelo dentro de layers, sequencial entre layers

**Critérios de decisão:**
- `parallelismWidth` = max sub-tarefas por nível do DAG
- `criticalPathDepth` = profundidade do caminho crítico
- `interSubtaskCoupling` = similaridade entre outputs esperados

### 2.6 Efeito "Frações" — Porque funciona

O modelo de frações (cada agente → parte da solução) é uma generalização do que SKYNET já faz:

| SKYNET Hoje | SKYNET Agentic |
|-------------|----------------|
| Pipeline layer shards → forward pass | Sub-tarefas → agentes especializados |
| Segment Means comprime ativações entre stages | Fractions comprimem artefactos entre agentes |
| Token aggregator aceita/rejeita tokens | Fraction aggregator aceita/rejeita artefactos |
| Rejection sampling ajusta distribuição | Consistency validation ajusta frações |
| Speculative decoding: draft → verify | Executor → Aggregator: rascunho → validação |

A diferença é semântica: em vez de tokens, os fragmentos são **artefactos de domínio** (HTML, JSON, imagens, URLs). A infraestrutura de base (P2P mesh, routing, compressão, agregação) é a mesma.

### 2.7 Propriedades Não-Funcionais

| Propriedade | Mecanismo |
|-------------|-----------|
| **Tolerância a falhas** | Se um agente falha, o Router tenta o próximo melhor (já implementado no `PipelineManager.handlePeerFailure`) |
| **Latência** | Frações são streamed assim que disponíveis (paralelismo) — TTFB dominado pelo caminho crítico |
| **Custo** | x402 micropagamentos por fração — paga-se só pelo que se usa |
| **Privacidade** | Dados sensíveis podem ser processados localmente (L0/L1); só embeddings de capacidades são partilhados |
| **Escalabilidade** | O(log N) para descoberta semântica; O(L) para planeamento; horizontal scale adicionando agentes |
| **Consistência** | Aggregator valida coerência entre frações antes de montar resultado final |

---

## 3. Roadmap Proposto

### Sprint 4a — Fundação Agentica (2 semanas)

**Objetivo:** `SemanticRouter` + `AgentMeshManager` + testes

- [ ] Estender `NodeCapability` para suportar VCVs com embeddings semânticos
- [ ] Implementar `SemanticRouter` com índice HNSW (usando `knowledge_graph.rs`)
- [ ] Implementar `AgentMeshManager` no `p2p-mesh-network`: registo, descoberta, heartbeats
- [ ] Testes: 10+ (registry, semantic match, failover, routing)
- [ ] Bump v0.4.0 + tag

### Sprint 4b — Planner + Aggregator (2 semanas)

**Objetivo:** Task decomposition + fraction assembly

- [ ] Implementar `TaskPlanner` — decompõe prompts em DAGs de sub-tarefas
- [ ] Implementar `TopologyRouter` — escolhe topologia com base no DAG (AdaptOrch)
- [ ] Implementar `FractionAggregator` — síntese com validação de consistência
- [ ] Testes: 15+ (decomposition, topology decision, aggregation, consistency)
- [ ] Demo: "cria landing page" → frações HTML/CSS/JS montadas
- [ ] Bump v0.5.0 + tag

### Sprint 4c — Agent Runtime + Desktop (2 semanas)

**Objetivo:** Agentes correm em nós reais

- [ ] `agent_runtime.rs` no `core-wasm-engine` — ciclo de vida: load → init → execute → return → unload
- [ ] `AgentHost` no `desktop-node-agent` — spawn/stop agent runtimes, expõe tools locais
- [ ] Adapter no `inference-runtime` para AgentModel (model + tools adapter)
- [ ] 3 agent templates: webdesign, content-writer, image-optimizer
- [ ] Testes: 15+ (runtime lifecycle, tool injection, streaming fractions)
- [ ] Bump v0.6.0 + tag

### Sprint 4d — UI + Pagamento + Release (2 semanas)

**Objetivo:** Utilizador final consegue usar

- [ ] Modo "Agent Query" no `app-ui-orchestrator`: input livre, stream de frações, preview
- [ ] Agent payment via x402 no `blockchain-client`
- [ ] Reputation tracking (on-chain ou CRDT)
- [ ] Testes E2E: 10+
- [ ] Bump v0.7.0 + tag + demo público

---

## 4. ADRs Propostos

### ADR-016: Semantic Routing sobre HNSW > Routing por keyword

**Contexto:** Precisamos de rotear sub-tarefas a agentes compatíveis. Keyword matching é frágil.

**Decisão:** Usar embeddings semânticos + índice HNSW (Hierarchical Navigable Small World). Cada agente regista-se com um embedding do seu `systemPrompt + tools`. Sub-tarefas são embedded no mesmo espaço e匹配 por cosine similarity.

**Consequências:** + O(log N) para descoberta, + robusto a sinónimos, − requer modelo de embeddings (pode ser SBERT ou um LLM pequeno).

### ADR-017: Frações Imutáveis com Checksum

**Contexto:** Frações transitam entre agentes pela mesh. Precisamos de integridade.

**Decisão:** Cada fração leva um checksum (BLAKE3) do artefacto. O Aggregator verifica antes de montar. Se falha, pede retransmissão.

**Consequências:** + Integridade garantida, − overhead de 32 bytes por fração.

### ADR-018: Planner é um Agente (não um módulo fixo)

**Contexto:** Quem decompõe as tarefas? Um algoritmo fixo ou um LLM?

**Decisão:** O Planner é ele próprio um agente especializado na mesh. Corre num L1+ com system prompt de planning. Isto permite que o planner evolua (via `EvolutionEngine`) tal como qualquer outro agente.

**Consequências:** + Flexibilidade, + capacidade de aprender melhores decomposições, − latência adicional de 1 round-trip.

### ADR-019: Topologia Híbrida como Default (AdaptOrch)

**Contexto:** Que topologia de orquestração usar?

**Decisão:** Usar `τX` (hybrid) como default — executa em paralelo dentro de layers, sequencial entre layers. O `TopologyRouter` pode escolher outra topologia se o DAG o justificar (baixo acoplamento → τP, alto acoplamento → τS).

**Consequências:** + Performance comprovada (49.7% dos casos), − complexidade de implementação.

---

## 5. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Agentes produzem frações incoerentes | Média | Alto | Aggregator faz validação cruzada; se < 70% consistência, refina |
| Planner gera DAG ineficiente | Média | Médio | Planner evolui via `EvolutionEngine`; feedback loop de latência |
| Embeddings semânticos imprecisos | Baixa | Médio | Usar sentence-transformers otimizados; permitir fallback para keyword |
| Nó L0 sem capacidade para agente 7B+ | Alta | Baixo | L0 só corre agentes ligeiros (3B, tools-only); agentes pesados vão para L1+ |
| Latência de orquestração domina | Média | Alto | Cache de planos frequentes; parallel dispatch; streaming de frações |

---

## 6. Referências

1. **Symphony** — "A Decentralized Multi-Agent Framework for Scalable Collective Intelligence" (2025) — `arxiv.org/abs/2508.20019`
2. **Federation of Agents (FoA)** — "A Semantics-Aware Communication Fabric for Large-Scale Agentic AI" (2025) — `arxiv.org/abs/2509.20175`
3. **AdaptOrch** — "Task-Adaptive Multi-Agent Orchestration in the Era of LLM Performance Convergence" (2026) — `arxiv.org/abs/2602.16873`
4. **ROMA** — "Recursive Open Meta-Agent Framework for Long-Horizon Multi-Agent Systems" (2026) — `arxiv.org/abs/2602.01848`
5. **GraSP** — "Graph-Structured Skill Compositions for LLM Agents" (2026) — `arxiv.org/abs/2604.17870`
6. **AgentMesh (kunalshah017)** — Mercado descentralizado multi-agente com x402 — `github.com/kunalshah017/AgentMesh`
7. **AgentMesh (execute008)** — Protocolo de coordenação com AgentRegistry.sol (ERC-8004) — `github.com/execute008/agentmesh`
8. **ABI-Core** — Distributed self-organizing multi-agent system — `github.com/Joselo-zn/abi-core`
9. **Heurist Mesh** — Open network of modular AI agents — `github.com/heurist-network/heurist-agent-framework`
10. **Lyzr AgentMesh** — Multi-agent architecture for autonomous learning and collaboration — `lyzr.ai/lyzr-introduces-agentmesh-architecture/`

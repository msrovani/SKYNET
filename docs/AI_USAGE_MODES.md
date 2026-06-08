# SKYNET App — Modos de Uso de IA

> Revisão dos 3 modos originais (Tático/Fazenda/Passivo) → 4 modos baseados em **padrões de IA**
> Baseado em análise de 2025-2026: ChatGPT, Perplexity, Claude, edge AI frameworks

---

## Problema dos Modos Originais

Os modos **Tático**, **Fazenda** e **Passivo** descreviam **ações do utilizador** (como ele interage com o dispositivo). Isto é alheio ao propósito do SKYNET — que é **processar IA**. Um utilizador pode estar "passivo" mas a correr uma inferência profunda; ou "tático" mas a pedir algo simples.

**Novo paradigma:** modos baseados no **perfil de inferência** que o utilizador precisa:

| Dimensão | Variação |
|----------|----------|
| Latência | Instantânea (<100ms) vs Tolerante (segundos) vs Assíncrona (minutos) |
| Profundidade | Single-turn vs Multi-turn vs Multi-agente |
| Autonomia | Interativo vs Supervisionado vs Autónomo |
| Consumo | Mínimo vs Moderado vs Intensivo |
| Dados | Público vs Sensível vs Local obrigatório |

---

## Os 4 Modos de IA

### ⚡ Modo Relâmpago — Respostas Instantâneas

**Paradigma:** "Quero uma resposta agora."

**Comparável a:** ChatGPT modo rápido, Perplexity search, assistente de voz, autocomplete

**Comportamento do SKYNET:**

| Atributo | Valor |
|----------|-------|
| Latência alvo | <100ms (perceção de instantâneo) |
| Modelo | 3B-7B INT4, single forward pass |
| Speculative decoding | Desligado (1 token de cada vez) |
| Pipeline | 1 stage (nó mais próximo) |
| Routing | Distância mínima (mesh vizinho) |
| Agentes | 0 — single model, sem decomposição |
| Thermal | Ignorado (rajada curta) |
| Rede | WebTransport directo, 0-RTT |
| Custo | Micro-pagamento único (~$0.0001) |

**Quando usar:**
- Chat rápido ("o tempo em Lisboa?")
- Autocomplete de código
- Tradução instantânea
- Classificação de imagem
- Comandos de voz

**Modo na UI:** Input de texto + resposta em stream. Sem indicadores de "pesquisa profunda" — parecer instantâneo.

---

### 🔬 Modo Profundo — Raciocínio Extendido

**Paradigma:** "Preciso de uma análise cuidada."

**Comparável a:** ChatGPT Deep Research, Perplexity Deep Research, Claude Extended Thinking, Gemini Deep Research

**Comportamento do SKYNET:**

| Atributo | Valor |
|----------|-------|
| Latência alvo | 100ms-5s (streaming contínuo) |
| Modelo | 7B-13B INT4, speculative decoding com K=5-10 |
| Speculative decoding | Ativo: L0 draft, L1 verify, rejection sampling |
| Pipeline | Múltiplos stages (layers distribuídas entre L0-L2) |
| Segment Means | Ativo: compressão de ativações entre stages |
| Routing | Capacidade máxima (não distância) |
| Agentes | 0 — single model, mas com distributed pipeline |
| Thermal | Monitorizado: se zona warm+, reduz speculationLen |
| KV Cache | Alocada para contexto longo (4k-32k tokens) |
| Checkpoints | Ativados: se peer falha, recovery do checkpoint |
| Qualidade | Acceptance threshold = 0.95 (rejeita mais, maior qualidade) |

**Quando usar:**
- Análise de documentos longos
- Pesquisa com fontes
- Geração de código multi-ficheiro
- Raciocínio matemático/científico
- Tradução de textos complexos
- Qualquer tarefa que precise de precisão > velocidade

**Modo na UI:** Indicador de "pesquisa profunda" com progresso (1/5 tokens gerados...). Stream de tokens com highlight nas fontes.

---

### 🤖 Modo Agente — Autónomo Multi-Passo

**Paradigma:** "Faz isto por mim. Informa-me quando estiver pronto."

**Comparável a:** ChatGPT Operator, Claude Computer Use, Grok DeepSearch, AutoGen, CrewAI

**Comportamento do SKYNET:**

| Atributo | Valor |
|----------|-------|
| Latência alvo | 5s-minutos (assíncrono, notificação quando pronto) |
| Modelo | Múltiplos modelos (3B-70B) conforme a sub-tarefa |
| Decomposição | Planner → DAG de sub-tarefas (ROMA/Symphony) |
| Routing | Semântico (HNSW + embeddings de capacidades) |
| Agentes | Múltiplos: webdesign, content, research, code, deploy |
| Topologia | Híbrida (AdaptOrch τX): paralelo dentro de layers, sequencial entre layers |
| Frações | Cada agente → fração parcial; Aggregator monta resultado |
| Validação | Aggregator valida consistência entre frações |
| FL | Opcional: feedback do utilizador → fine-tuning do planner |
| Blockchain | Pagamento por agente (x402, múltiplas micro-tx) |
| Thermal | Gestão ativa: se um nó aquece, shift para outro |

**Quando usar:**
- "Cria um website para a minha empresa" (webdesign + content + deploy)
- "Analisa este contrato e sugere alterações" (research + legal + rewrite)
- "Monitoriza o preço do Bitcoin e avisa-me quando cair 5%" (agent always-on)
- "Gera um dashboard de vendas com dados do CRM" (data + viz + deploy)
- Qualquer tarefa com múltiplos passos que um humano delegaria a uma equipa

**Modo na UI:**
- Input de objectivo (não apenas prompt)
- Dashboard de progresso: "Planeando...", "Agente webdesign: a gerar layout...", "Content agent: a escrever texto..."
- Preview de frações em tempo real (HTML a aparecer, imagem a ser gerada)
- Aprovação humana opcional em pontos de decisão (modo Assist vs Auto)
- Botão "cancelar agente" — termina todas as sub-tarefas

#### Sub-modos de Autonomia (Agente)

| Nível | UX | Controlo |
|-------|-----|----------|
| **Watch** | Utilizador vê cada passo em tempo real | Aprova cada ação |
| **Assist** | Sistema sugere, utilizador confirma | Aprova pontos críticos |
| **Auto** | Sistema executa tudo, notifica no fim | Confiança total |

---

### 🌙 Modo Silêncio — Trabalho de Fundo

**Paradigma:** "Usa o meu dispositivo quando estiver parado."

**Comparável a:** Apple Intelligence background processing, federated learning, folding@home, SETI@home

**Comportamento do SKYNET:**

| Atributo | Valor |
|----------|-------|
| Latência alvo | Sem restrição (horas, dias) |
| Modelo | Qualquer, sem pressão de tempo |
| Ativação | Apenas quando: idle + bateria > 80% + a carregar + thermal safe |
| Thermal | Zona safe obrigatória; se sobe para warm, pausa |
| Prioridade | Mínima (cede CPU/GPU a apps do utilizador) |
| Trabalho típico | FL training, cache de embeddings, re-indexação HNSW, verificação de checkpoints |
| Rede | WebTransport + WebRTC, best-effort |
| Blockchain | Sem custo direto (staking passivo para recompensa) |
| Recompensa | Tokens SKYNET por hora de computação doada |

**Quando usar:**
- **Federated Learning:** treinar modelos enquanto o telefone carrega de noite
- **Content indexing:** construir cache semântica para respostas mais rápidas
- **Model serving:** manter modelo quente em RAM para outros nós
- **Verification:** validar integridade de shards na rede
- **Backup:** replicar checkpoints para resiliência da mesh

**Modo na UI:**
- Indicador "O seu dispositivo está a contribuir 🌙"
- Painel de estatísticas: "Hoje: 2h de computação doada, 0.5 SKYNET ganhos"
- Controlo: "Permitir modo Silêncio? [Sempre / Só a carregar / Nunca]"

---

## Matriz de Decisão: Qual Modo Usar?

| Se o utilizador diz... | Modo | Routing | Latência |
|------------------------|------|---------|----------|
| "Quanto é 2+2?" | ⚡ Relâmpago | L0/L1 vizinho | <100ms |
| "Traduz isto para inglês" | ⚡ Relâmpago | L0/L1 vizinho | <100ms |
| "Resume este PDF de 50 páginas" | 🔬 Profundo | L1+ com VRAM | 1-5s |
| "Explica a teoria da relatividade" | 🔬 Profundo | L1+ com capacidade | 500ms-3s |
| "Cria um website para a minha loja" | 🤖 Agente | Planner → Router → Multi-agente | 30s-5min |
| "Analisa este contrato jurídico" | 🤖 Agente | Agentes legal + research | 1-10min |
| "Monitoriza o mercado crypto" | 🤖 Agente (Auto) | Agente always-on | contínuo |
| (telefone a carregar de noite) | 🌙 Silêncio | FL training local | horas |
| (PC ligado mas sem uso) | 🌙 Silêncio | Model serving + verification | horas |

---

## Mapeamento para Stack SKYNET

| Modo | Pipeline | Spec Decode | Segment Means | Agentes | Thermal | Blockchain |
|------|----------|-------------|---------------|---------|---------|------------|
| ⚡ Relâmpago | 1 stage | Off | Off | 0 | Ignorado | 1 tx |
| 🔬 Profundo | Multi-stage | K=5-10 | On | 0 | Monitor | 1 tx |
| 🤖 Agente | DAG multi-agente | Opcional | On | 3-10+ | Ativo | N tx |
| 🌙 Silêncio | Single local | Off | Off | 0 | Safe-only | Staking |

---

## Conclusão

Estes 4 modos substituem os 3 originais (Tático/Fazenda/Passivo) porque:

1. **Descrevem o que a IA faz**, não como o utilizador age — alinhado com o propósito do SKYNET
2. **Mapeiam-se directamente a parâmetros técnicos** — speculative decoding on/off, K value, número de agentes, thermal policy
3. **Cobrem todo o espectro** — desde resposta instantânea até computação passiva noturna
4. **Seguem os padrões da indústria 2025-2026** — Quick/Deep/Agent/Ambient é a taxonomia emergente em ChatGPT, Perplexity, Claude e edge AI frameworks
5. **Permitem evolução futura** — cada modo pode ser refinado sem quebrar a taxonomia

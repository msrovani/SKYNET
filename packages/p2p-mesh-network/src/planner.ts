export interface SubTask {
  id: string;
  parentTaskId: string;
  description: string;
  domain: string;
  requiredTools: string[];
  dependsOn: string[];
  inputContext?: any;
  status: 'pending' | 'assigned' | 'running' | 'completed' | 'failed';
}

export interface DecompositionPlan {
  requestId: string;
  originalPrompt: string;
  subtasks: SubTask[];
  metadata: {
    complexity: 'simple' | 'medium' | 'complex';
    domain: string;
    estimatedSubTasks: number;
    criticalPathDepth: number;
  };
}

const DOMAIN_TEMPLATES: Record<string, {
  complexity: string;
  subtasks: Array<{
    description: string;
    domain: string;
    tools: string[];
    dependsOn: number[];
  }>;
}> = {
  webdesign: {
    complexity: 'complex',
    subtasks: [
      { description: 'Analisar requisitos do projeto', domain: 'planning', tools: [], dependsOn: [] },
      { description: 'Criar estrutura HTML semântica', domain: 'webdesign', tools: ['html-renderer'], dependsOn: [0] },
      { description: 'Desenvolver estilos CSS responsivos', domain: 'webdesign', tools: ['css-generator'], dependsOn: [1] },
      { description: 'Escrever conteúdo e copy', domain: 'content', tools: ['text-generator'], dependsOn: [0] },
      { description: 'otimizar imagens e assets', domain: 'image', tools: ['image-generator', 'upscaler'], dependsOn: [0] },
      { description: 'Integrar componentes e testar', domain: 'webdesign', tools: ['html-renderer', 'cdn-upload'], dependsOn: [2, 3, 4] },
      { description: 'Fazer deploy para produção', domain: 'deploy', tools: ['cdn-upload'], dependsOn: [5] },
    ],
  },
  content: {
    complexity: 'medium',
    subtasks: [
      { description: 'Pesquisar tópico e referências', domain: 'research', tools: [], dependsOn: [] },
      { description: 'Estruturar outline do artigo', domain: 'planning', tools: [], dependsOn: [0] },
      { description: 'Escrever rascunho completo', domain: 'content', tools: ['text-generator', 'markdown-formatter'], dependsOn: [1] },
      { description: 'Rever e editar conteúdo', domain: 'content', tools: ['grammar-checker'], dependsOn: [2] },
      { description: 'Formatar e exportar', domain: 'content', tools: ['markdown-formatter'], dependsOn: [3] },
    ],
  },
  image: {
    complexity: 'simple',
    subtasks: [
      { description: 'Interpretar descrição da imagem', domain: 'image', tools: [], dependsOn: [] },
      { description: 'Gerar imagem base', domain: 'image', tools: ['image-generator'], dependsOn: [0] },
      { description: 'Aplicar upscale e otimização', domain: 'image', tools: ['upscaler'], dependsOn: [1] },
      { description: 'Adicionar watermark se necessário', domain: 'image', tools: ['watermark'], dependsOn: [2] },
    ],
  },
  analysis: {
    complexity: 'complex',
    subtasks: [
      { description: 'Recolher dados e fontes', domain: 'research', tools: [], dependsOn: [] },
      { description: 'Analisar e extrair insights', domain: 'analysis', tools: ['text-generator'], dependsOn: [0] },
      { description: 'Criar visualização de dados', domain: 'webdesign', tools: ['html-renderer'], dependsOn: [1] },
      { description: 'Gerar relatório final', domain: 'content', tools: ['text-generator', 'markdown-formatter'], dependsOn: [1, 2] },
    ],
  },
};

export class TaskPlanner {
  private planCounter: number = 0;

  plan(prompt: string): DecompositionPlan {
    const domain = this.detectDomain(prompt);
    const template = DOMAIN_TEMPLATES[domain];
    const isSimple = !template || prompt.length < 30;

    if (isSimple) {
      return {
        requestId: `plan-${++this.planCounter}`,
        originalPrompt: prompt,
        subtasks: [{
          id: `st-${this.planCounter}-0`,
          parentTaskId: `plan-${this.planCounter}`,
          description: prompt,
          domain,
          requiredTools: this.inferTools(domain, prompt),
          dependsOn: [],
          status: 'pending',
        }],
        metadata: {
          complexity: 'simple',
          domain,
          estimatedSubTasks: 1,
          criticalPathDepth: 1,
        },
      };
    }

    const subtasks: SubTask[] = template.subtasks.map((t, i) => ({
      id: `st-${this.planCounter}-${i}`,
      parentTaskId: `plan-${this.planCounter}`,
      description: t.description,
      domain: t.domain,
      requiredTools: t.tools,
      dependsOn: t.dependsOn.map(d => `st-${this.planCounter}-${d}`),
      status: 'pending' as const,
    }));

    const criticalPathDepth = this.computeCriticalPathDepth(subtasks);

    return {
      requestId: `plan-${this.planCounter}`,
      originalPrompt: prompt,
      subtasks,
      metadata: {
        complexity: template.complexity as 'simple' | 'medium' | 'complex',
        domain,
        estimatedSubTasks: subtasks.length,
        criticalPathDepth,
      },
    };
  }

  private detectDomain(prompt: string): string {
    const lower = prompt.toLowerCase();
    if (/website|landing.page|web|html|css|site|frontend/i.test(lower)) return 'webdesign';
    if (/blog|article|content|write|copy|text|post|story/i.test(lower)) return 'content';
    if (/image|photo|picture|generate|art|design|visual/i.test(lower)) return 'image';
    if (/analys|research|report|data|insight|study|review/i.test(lower)) return 'analysis';
    return 'content';
  }

  private inferTools(domain: string, prompt: string): string[] {
    const tools: string[] = [];
    if (domain === 'webdesign') tools.push('html-renderer', 'css-generator');
    if (domain === 'content') tools.push('text-generator');
    if (domain === 'image') tools.push('image-generator');
    if (/deploy|upload|cdn/i.test(prompt)) tools.push('cdn-upload');
    return tools;
  }

  private computeCriticalPathDepth(subtasks: SubTask[]): number {
    const depths = new Map<string, number>();
    const byId = new Map(subtasks.map(s => [s.id, s]));
    let maxDepth = 0;

    const compute = (id: string): number => {
      if (depths.has(id)) return depths.get(id)!;
      const task = byId.get(id);
      if (!task || task.dependsOn.length === 0) {
        depths.set(id, 1);
        return 1;
      }
      const depth = 1 + Math.max(...task.dependsOn.map(compute));
      depths.set(id, depth);
      maxDepth = Math.max(maxDepth, depth);
      return depth;
    };

    for (const s of subtasks) compute(s.id);
    return maxDepth;
  }

  getSubTasksByLayer(plan: DecompositionPlan): SubTask[][] {
    const layers: SubTask[][] = [];
    const scheduled = new Set<string>();
    const remaining = new Set(plan.subtasks.map(s => s.id));

    while (remaining.size > 0) {
      const layer = plan.subtasks.filter(
        s => remaining.has(s.id) && s.dependsOn.every(d => scheduled.has(d)),
      );
      if (layer.length === 0) break;
      for (const s of layer) {
        scheduled.add(s.id);
        remaining.delete(s.id);
      }
      layers.push(layer);
    }

    return layers;
  }
}

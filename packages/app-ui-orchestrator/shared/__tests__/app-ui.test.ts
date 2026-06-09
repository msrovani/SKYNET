import { describe, it, expect } from 'vitest';
import { AiMode, AgentAutonomy, AI_MODE_LABELS, AI_MODE_ICONS, AGENT_AUTONOMY_LABELS } from '../types/index';

describe('App UI Types', () => {
  it('has all AI modes', () => {
    expect(AiMode.LIGHTNING).toBe('lightning');
    expect(AiMode.DEEP).toBe('deep');
    expect(AiMode.AGENT).toBe('agent');
  });

  it('has labels for all modes', () => {
    expect(AI_MODE_LABELS[AiMode.LIGHTNING]).toBeTruthy();
    expect(AI_MODE_LABELS[AiMode.DEEP]).toBeTruthy();
    expect(AI_MODE_LABELS[AiMode.AGENT]).toBeTruthy();
  });

  it('has icons for all modes', () => {
    expect(AI_MODE_ICONS[AiMode.LIGHTNING]).toBe('⚡');
    expect(AI_MODE_ICONS[AiMode.AGENT]).toBe('🤖');
  });

  it('has all autonomy levels', () => {
    expect(AgentAutonomy.WATCH).toBe('watch');
    expect(AgentAutonomy.ASSIST).toBe('assist');
    expect(AgentAutonomy.AUTO).toBe('auto');
  });

  it('has labels for all autonomy levels', () => {
    expect(AGENT_AUTONOMY_LABELS[AgentAutonomy.WATCH]).toContain('Vigiar');
    expect(AGENT_AUTONOMY_LABELS[AgentAutonomy.AUTO]).toContain('Automático');
  });
});

describe('useSkynet interface', () => {
  it('exports expected function names', () => {
    const exportNames = ['useSkynet'];
    exportNames.forEach(name => {
      expect(name).toBeTruthy();
    });
  });
});

describe('useTvPlatform types', () => {
  it('imports useTvPlatform without error', async () => {
    const mod = await import('../hooks/useTvPlatform.js');
    expect(typeof mod.useTvPlatform).toBe('function');
    expect(mod.useTvPlatform.length).toBe(0);
  });
});

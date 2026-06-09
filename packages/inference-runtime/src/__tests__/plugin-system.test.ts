import { describe, it, expect } from 'vitest';
import type { ModelPluginCard, PluginValidation } from '../plugin-types.js';

function makeCard(overrides: Partial<ModelPluginCard> & { id?: string }): ModelPluginCard {
  return {
    schema: {
      id: overrides.id ?? 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      author: { name: 'test-author' },
      description: 'A test model plugin',
      createdAt: '2026-07-08T00:00:00Z',
      updatedAt: '2026-07-08T00:00:00Z',
    },
    model: {
      architecture: 'llama',
      provider: 'executorch',
      runtime: 'executorch',
      quantization: 'int4',
      parameterCount: 1_000_000_000,
      contextLength: 2048,
      url: 'https://huggingface.co/test/model.pte',
      sha256: 'abc123',
    },
    requirements: {
      minMemoryMb: 512,
      backends: ['xnnpack'],
    },
    tags: ['llama', 'text-generation'],
    ...overrides,
  };
}

describe('PluginTypes - validation', () => {
  it('validates a well-formed card', async () => {
    const { validatePluginCard } = await import('../plugin-types.js');
    const result = validatePluginCard(makeCard({}));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects card with short id', async () => {
    const { validatePluginCard } = await import('../plugin-types.js');
    const result = validatePluginCard(makeCard({ id: 'x' }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('reports missing author name', async () => {
    const { validatePluginCard } = await import('../plugin-types.js');
    const card = makeCard({});
    card.schema.author.name = '';
    const result = validatePluginCard(card);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('author name is required');
  });

  it('warns about missing tags', async () => {
    const { validatePluginCard } = await import('../plugin-types.js');
    const card = makeCard({});
    card.tags = [];
    const result = validatePluginCard(card);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('PluginRegistry', () => {
  it('registers valid plugins', async () => {
    const { PluginRegistry } = await import('../plugin-registry.js');
    const reg = new PluginRegistry();
    const card = makeCard({ id: 'my-model' });
    const result = reg.register(card);
    expect(result.valid).toBe(true);
    expect(reg.count()).toBe(1);
  });

  it('rejects plugin with invalid schema', async () => {
    const { PluginRegistry } = await import('../plugin-registry.js');
    const reg = new PluginRegistry();
    const card = makeCard({ id: '' });
    const result = reg.register(card);
    expect(result.valid).toBe(false);
  });

  it('allows version upgrade', async () => {
    const { PluginRegistry } = await import('../plugin-registry.js');
    const reg = new PluginRegistry();
    const v1 = makeCard({ id: 'upgrade' });
    v1.schema.version = '1.0.0';
    const v2 = makeCard({ id: 'upgrade' });
    v2.schema.version = '2.0.0';
    expect(reg.register(v1).valid).toBe(true);
    expect(reg.register(v2).valid).toBe(true);
    expect(reg.count()).toBe(1);
  });

  it('rejects downgrade', async () => {
    const { PluginRegistry } = await import('../plugin-registry.js');
    const reg = new PluginRegistry();
    const v2 = makeCard({ id: 'downgrade' });
    v2.schema.version = '2.0.0';
    const v1 = makeCard({ id: 'downgrade' });
    v1.schema.version = '1.0.0';
    reg.register(v2);
    const result = reg.register(v1);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('<= existing');
  });

  it('removes plugins', async () => {
    const { PluginRegistry } = await import('../plugin-registry.js');
    const reg = new PluginRegistry();
    reg.register(makeCard({ id: 'remove-me' }));
    expect(reg.count()).toBe(1);
    expect(reg.remove('remove-me')).toBe(true);
    expect(reg.count()).toBe(0);
    expect(reg.remove('nonexistent')).toBe(false);
  });

  it('searches by id, name, author, tags', async () => {
    const { PluginRegistry } = await import('../plugin-registry.js');
    const reg = new PluginRegistry();
    reg.register(makeCard({ id: 'llama-v2', tags: ['llama', 'text'] }));
    reg.register(makeCard({ id: 'qwen-7b', tags: ['qwen', 'chat'] }));
    expect(reg.search('llama')).toHaveLength(1);
    expect(reg.search('qwen')).toHaveLength(1);
    expect(reg.search('text')).toHaveLength(1);
  });

  it('verifies checksum integrity', async () => {
    const { PluginRegistry } = await import('../plugin-registry.js');
    const reg = new PluginRegistry();
    const card = makeCard({ id: 'verify-me' });
    reg.register(card);
    expect(reg.verify('verify-me')).toBe(true);
  });

  it('emits events on register and remove', async () => {
    const { PluginRegistry } = await import('../plugin-registry.js');
    const reg = new PluginRegistry();
    const events: string[] = [];
    reg.onEvent(e => events.push(e.type));
    reg.register(makeCard({ id: 'eventful' }));
    reg.remove('eventful');
    expect(events).toContain('plugin-registered');
    expect(events).toContain('plugin-removed');
  });

  it('imports and exports manifest', async () => {
    const { PluginRegistry } = await import('../plugin-registry.js');
    const reg = new PluginRegistry();
    reg.register(makeCard({ id: 'manifest-test' }));
    const manifest = reg.exportManifest();
    expect(manifest.models).toHaveLength(1);
    expect(manifest.schema.description).toContain('1 plugins');

    const reg2 = new PluginRegistry();
    const result = reg2.importManifest(manifest);
    expect(result.imported).toBe(1);
    expect(result.failed).toBe(0);
  });
});

describe('PluginLoader', () => {
  it('detects loaded state', async () => {
    const { PluginLoader } = await import('../plugin-loader.js');
    const loader = new PluginLoader();
    expect(loader.isLoaded('nonexistent')).toBe(false);
    expect(loader.getCachedCount()).toBe(0);
  });

  it('unloads and clears cache', async () => {
    const { PluginLoader } = await import('../plugin-loader.js');
    const loader = new PluginLoader();
    loader.clearCache();
    expect(loader.getCachedCount()).toBe(0);
  });

  it('returns model loader instance', async () => {
    const { PluginLoader } = await import('../plugin-loader.js');
    const loader = new PluginLoader();
    expect(loader.getModelLoader()).toBeDefined();
  });
});

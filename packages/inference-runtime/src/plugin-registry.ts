import { computeSimpleChecksum, validatePluginCard } from './plugin-types.js';
import type { ModelPluginCard, PluginValidation, PluginEntry, PluginManifest } from './plugin-types.js';

export type RegistryEventType = 'plugin-registered' | 'plugin-removed' | 'plugin-verified' | 'manifest-imported';
export interface RegistryEvent {
  type: RegistryEventType;
  pluginId: string;
  version?: string;
  validation?: PluginValidation;
}
export type RegistryCallback = (event: RegistryEvent) => void;

const MAX_PLUGINS = 500;

export class PluginRegistry {
  private entries: Map<string, PluginEntry> = new Map();
  private callbacks: Set<RegistryCallback> = new Set();

  onEvent(cb: RegistryCallback): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  private emit(event: RegistryEvent): void {
    for (const cb of this.callbacks) cb(event);
  }

  register(card: ModelPluginCard): PluginValidation {
    const validation = validatePluginCard(card);
    if (!validation.valid) return validation;

    if (this.entries.size >= MAX_PLUGINS) {
      validation.errors.push('registry full (max 500 plugins)');
      validation.valid = false;
      return validation;
    }

    if (this.entries.has(card.schema.id)) {
      const existing = this.entries.get(card.schema.id)!;
      const cmp = this.compareVersions(card.schema.version, existing.card.schema.version);
      if (cmp <= 0) {
        validation.errors.push(`version ${card.schema.version} <= existing ${existing.card.schema.version}`);
        validation.valid = false;
        return validation;
      }
    }

    const serialized = JSON.stringify(card);
    const checksum = computeSimpleChecksum(serialized);

    this.entries.set(card.schema.id, {
      card,
      checksum,
      loadedAt: Date.now(),
      verified: false,
    });

    this.emit({ type: 'plugin-registered', pluginId: card.schema.id, version: card.schema.version, validation });
    return validation;
  }

  remove(pluginId: string): boolean {
    const removed = this.entries.delete(pluginId);
    if (removed) this.emit({ type: 'plugin-removed', pluginId });
    return removed;
  }

  verify(pluginId: string): boolean {
    const entry = this.entries.get(pluginId);
    if (!entry) return false;

    const serialized = JSON.stringify(entry.card);
    const computed = computeSimpleChecksum(serialized);
    entry.verified = computed === entry.checksum;
    this.emit({ type: 'plugin-verified', pluginId, version: entry.card.schema.version });
    return entry.verified;
  }

  get(pluginId: string): PluginEntry | undefined {
    return this.entries.get(pluginId);
  }

  list(): PluginEntry[] {
    return Array.from(this.entries.values());
  }

  search(query: string): PluginEntry[] {
    const lower = query.toLowerCase();
    return this.list().filter(e =>
      e.card.schema.id.toLowerCase().includes(lower) ||
      e.card.schema.name.toLowerCase().includes(lower) ||
      e.card.schema.author.name.toLowerCase().includes(lower) ||
      e.card.tags.some(t => t.toLowerCase().includes(lower))
    );
  }

  count(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  importManifest(manifest: PluginManifest): { imported: number; failed: number } {
    let imported = 0;
    let failed = 0;
    for (const card of manifest.models) {
      const result = this.register(card);
      if (result.valid) imported++;
      else failed++;
    }
    this.emit({ type: 'manifest-imported', pluginId: manifest.schema.id, version: manifest.schema.version });
    return { imported, failed };
  }

  exportManifest(): PluginManifest {
    const entries = this.list();
    return {
      schema: {
        id: '__manifest',
        name: 'Exported Plugin Manifest',
        version: '1.0.0',
        author: { name: 'skynet' },
        description: `Export of ${entries.length} plugins`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      checksum: '',
      models: entries.map(e => e.card),
      updatedAt: new Date().toISOString(),
    };
  }

  private compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] ?? 0;
      const nb = pb[i] ?? 0;
      if (na !== nb) return na - nb;
    }
    return 0;
  }
}

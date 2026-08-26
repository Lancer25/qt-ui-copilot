import { UiCapabilityCandidateSchema, UiCapabilitySchema, type UiCapability, type UiCapabilityCandidate } from '@qt-ui-copilot/contracts';

export interface CapabilityKit {
  id?: string;
  version: string;
  modules: readonly string[];
}

export interface UiCapabilitySource {
  readonly id?: string;
  list(): readonly UiCapability[];
  forKit?(kit: CapabilityKit): readonly UiCapability[];
}

export interface CapabilitySearchQuery {
  text?: string;
  limit?: number;
  kind?: UiCapability['kind'];
  tags?: readonly string[];
  kit?: CapabilityKit;
}

export function compareQtVersions(left: string, right: string): number {
  const parse = (version: string) => version.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left); const b = parse(right);
  for (let i = 0; i < Math.max(a.length, b.length, 3); i += 1) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  }
  return 0;
}

function sourcePriority(source: UiCapability['source']['type']): number {
  return ({ project: 4, local_library: 3, builtin: 2, remote: 1 })[source] ?? 0;
}

function compatible(capability: UiCapability, kit: CapabilityKit): boolean {
  if (compareQtVersions(kit.version, capability.qt.minVersion) < 0) return false;
  if (capability.qt.maxVersion && compareQtVersions(kit.version, capability.qt.maxVersion) > 0) return false;
  return capability.qt.modules.every((module) => kit.modules.includes(module));
}

function candidate(capability: UiCapability, query: CapabilitySearchQuery): UiCapabilityCandidate | undefined {
  if (query.kind && capability.kind !== query.kind) return undefined;
  const text = query.text?.trim().toLocaleLowerCase() ?? '';
  const searchable = [capability.displayName, capability.description, ...capability.tags].join(' ').toLocaleLowerCase();
  const reasons: string[] = [];
  let score = 0;
  if (text && searchable.includes(text)) { score += 50; reasons.push('text-exact'); }
  else if (text && text.split(/\s+/).some((term) => term && searchable.includes(term))) { score += 25; reasons.push('text-token'); }
  for (const tag of query.tags ?? []) if (capability.tags.includes(tag)) { score += 10; reasons.push(`tag:${tag}`); }
  if (query.text && score === 0) return undefined;
  return UiCapabilityCandidateSchema.parse({
    capabilityId: capability.id,
    displayName: capability.displayName,
    kind: capability.kind,
    description: capability.description,
    tags: capability.tags,
    dependencyStatus: 'ready',
    reasons,
  });
}

/** Deterministic, source-agnostic registry for Qt and project UI capabilities. */
export class UiCapabilityRegistry {
  private readonly capabilities = new Map<string, UiCapability>();
  private readonly sources: UiCapabilitySource[];

  public constructor(sources: readonly UiCapabilitySource[] = []) {
    this.sources = [];
    for (const source of sources) this.registerSource(source);
  }

  public registerSource(source: UiCapabilitySource): void {
    this.sources.push(source);
    for (const raw of source.list()) {
      const capability = UiCapabilitySchema.parse(raw);
      const previous = this.capabilities.get(capability.id);
      if (previous && JSON.stringify(previous) !== JSON.stringify(capability)) {
        throw new Error(`Conflicting UI capability id: ${capability.id}`);
      }
      this.capabilities.set(capability.id, capability);
    }
  }

  public get(id: string): UiCapability | undefined { return this.capabilities.get(id); }

  public list(): UiCapability[] {
    return [...this.capabilities.values()].sort((a, b) => sourcePriority(b.source.type) - sourcePriority(a.source.type) || a.id.localeCompare(b.id));
  }

  public listForKit(kit: CapabilityKit): UiCapability[] {
    return this.list().filter((capability) => compatible(capability, kit));
  }

  public search(query: CapabilitySearchQuery = {}): UiCapabilityCandidate[] {
    const capabilities = query.kit ? this.listForKit(query.kit) : this.list();
    return capabilities.map((capability) => candidate(capability, query)).filter((value): value is UiCapabilityCandidate => value !== undefined)
      .sort((a, b) => a.capabilityId.localeCompare(b.capabilityId)).slice(0, query.limit ?? 20);
  }
}

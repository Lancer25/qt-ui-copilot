import type { ComponentRecord } from '@qt-ui-copilot/contracts';

export interface ComponentQuery {
  text: string;
  limit?: number;
  requiredWidgets?: readonly string[];
  requiredLayouts?: readonly string[];
  qtVersion?: string;
  styleTags?: readonly string[];
  availableQssDependencies?: readonly string[];
  availableQrcDependencies?: readonly string[];
  availableCustomWidgets?: readonly string[];
}

export interface ComponentCandidate {
  componentId: string;
  component: ComponentRecord;
  score: number;
  reasons: readonly string[];
  missingDependencies: readonly string[];
}

export function compareVersions(left: string, right: string): number {
  const parse = (value: string): number[] => value.split('.').map((part) => Number.parseInt(part.replace(/\D.*$/, ''), 10) || 0);
  const a = parse(left); const b = parse(right);
  for (let index = 0; index < Math.max(a.length, b.length, 3); index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return 0;
}

export function isQtVersionCompatible(version: string | undefined, range: string | undefined): boolean {
  if (!version || !range) return true;
  const tokens = range.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 1 && /^\d/.test(tokens[0])) return compareVersions(version, tokens[0]) === 0;
  return tokens.every((token) => {
    const match = token.match(/^(>=|<=|>|<|=)?\s*(\d+(?:\.\d+){0,2})$/);
    if (!match) return true; // An unsupported future range must not disable offline search.
    const comparison = compareVersions(version, match[2]);
    switch (match[1] ?? '=') {
      case '>=': return comparison >= 0;
      case '<=': return comparison <= 0;
      case '>': return comparison > 0;
      case '<': return comparison < 0;
      default: return comparison === 0;
    }
  });
}

export function dependencyMessages(component: ComponentRecord, query: ComponentQuery): string[] {
  // Search may run before a target project is selected. In that case dependencies
  // are catalogue metadata, not failures. They become actionable once callers
  // provide the target availability sets (and insertion always checks them).
  const checkQss = query.availableQssDependencies !== undefined;
  const checkQrc = query.availableQrcDependencies !== undefined;
  const checkCustom = query.availableCustomWidgets !== undefined;
  const qss = new Set(query.availableQssDependencies ?? []);
  const qrc = new Set(query.availableQrcDependencies ?? []);
  const custom = new Set(query.availableCustomWidgets ?? []);
  return [
    ...(checkQss ? component.qssDependencies.filter((dependency) => !qss.has(dependency)).map((dependency) => `Missing QSS dependency ${dependency}`) : []),
    ...(checkQrc ? component.qrcDependencies.filter((dependency) => !qrc.has(dependency)).map((dependency) => `Missing QRC dependency ${dependency}`) : []),
    ...(checkCustom ? component.customWidgets.filter((dependency) => !custom.has(dependency.className)).map((dependency) => `Missing custom widget ${dependency.className}`) : []),
  ];
}

export function rankComponent(component: ComponentRecord, query: ComponentQuery, vectorScore = 0): ComponentCandidate | undefined {
  if (!isQtVersionCompatible(query.qtVersion, component.qtVersionRange)) return undefined;
  if ((query.requiredWidgets ?? []).some((widget) => !component.widgetClasses.includes(widget))) return undefined;
  if ((query.requiredLayouts ?? []).some((layout) => !component.layoutTypes.includes(layout))) return undefined;
  const queryText = query.text.toLocaleLowerCase();
  const searchable = [component.name, component.description, component.structureSummary, ...component.tags, ...component.widgetClasses, ...component.layoutTypes]
    .join(' ').toLocaleLowerCase();
  const reasons: string[] = [];
  let score = 0;
  if (queryText && searchable.includes(queryText)) { score += 50; reasons.push('text-exact'); }
  else if (queryText && queryText.split(/\s+/).filter(Boolean).some((term) => searchable.includes(term))) { score += 25; reasons.push('text-token'); }
  for (const widget of query.requiredWidgets ?? []) if (component.widgetClasses.includes(widget)) { score += 12; reasons.push(`widget:${widget}`); }
  for (const layout of query.requiredLayouts ?? []) if (component.layoutTypes.includes(layout)) { score += 10; reasons.push(`layout:${layout}`); }
  for (const tag of query.styleTags ?? []) if (component.tags.includes(tag)) { score += 5; reasons.push(`style:${tag}`); }
  if (vectorScore > 0) { score += Math.min(20, vectorScore * 20); reasons.push('vector'); }
  return { componentId: component.id, component, score, reasons, missingDependencies: dependencyMessages(component, query) };
}

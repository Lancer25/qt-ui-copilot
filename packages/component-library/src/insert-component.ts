import type { ComponentRecord, UiOperation } from '@qt-ui-copilot/contracts';
import type { ComponentSource } from '@qt-ui-copilot/ui-document';
import { parseUi, type ParsedUiDocument } from '@qt-ui-copilot/ui-document';

export interface ComponentInsertionOptions {
  parentLayout: string;
  objectPrefix: string;
  before?: string;
  /** Project-level QSS files or named style dependencies already available. */
  availableQssDependencies?: readonly string[];
  /** QRC files already registered by the target document/profile. */
  availableQrcDependencies?: readonly string[];
  /** Designer/plugin custom widgets known to be available in the target kit. */
  availableCustomWidgets?: readonly string[];
}

export interface PreparedComponentInsertion {
  /** Convenience alias for callers that only need the insertion operation. */
  operation: Extract<UiOperation, { op: 'insertComponent' }>;
  /** Include these to preserve the component's internal Qt connections/tabs. */
  operations: readonly UiOperation[];
  source: ComponentSource;
  missingDependencies: readonly string[];
  resolveComponent: (componentId: string, objectPrefix: string) => ComponentSource | undefined;
  /** Throws before any patch is generated when project dependencies are absent. */
  assertReady(): void;
}

function namedObjects(document: ParsedUiDocument): string[] {
  return [...document.index.widgetsByName.keys(), ...document.index.layoutsByName.keys()];
}

function fragmentDocument(fragment: string): ParsedUiDocument {
  const trimmed = fragment.trim();
  if (!/^<item(?:\s|>)/.test(trimmed)) throw new Error('Component UI fragment must be a complete <item> element');
  const openingEnd = trimmed.indexOf('>');
  const closingStart = trimmed.lastIndexOf('</item>');
  if (openingEnd < 0 || closingStart <= openingEnd) throw new Error('Component UI fragment has no item content');
  const inner = trimmed.slice(openingEnd + 1, closingStart);
  return parseUi(`<ui version="4.0"><class>ComponentFragment</class>${inner}</ui>`, 'component-fragment.ui');
}

function nextName(prefix: string, original: string, used: Set<string>): string {
  const safePrefix = prefix.replace(/[^A-Za-z0-9_]/g, '_').replace(/^_+|_+$/g, '') || 'component';
  const base = `${safePrefix}_${original}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}_${suffix++}`;
  used.add(candidate);
  return candidate;
}

function rewriteReferenceTokens(xml: string, renames: ReadonlyMap<string, string>): string {
  let rewritten = xml;
  for (const [from, to] of renames) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Object attributes and Qt's object-reference fields are intentionally
    // narrow. Visible strings and unrelated property values remain untouched.
    rewritten = rewritten.replace(new RegExp(`(\\bname\\s*=\\s*["'])${escaped}(["'])`, 'g'), `$1${to}$2`);
    for (const tag of ['cstring', 'tabstop', 'sender', 'receiver']) {
      rewritten = rewritten.replace(new RegExp(`(<${tag}>\\s*)${escaped}(\\s*</${tag}>)`, 'g'), `$1${to}$2`);
    }
  }
  return rewritten;
}

function dependencyReport(component: ComponentRecord, target: ParsedUiDocument, options: ComponentInsertionOptions): string[] {
  const targetQrc = new Set([...target.index.resources.map((resource) => resource.location), ...(options.availableQrcDependencies ?? [])]);
  const targetQss = new Set(options.availableQssDependencies ?? []);
  const targetCustom = new Set([
    ...target.index.customWidgets.map((widget) => widget.className),
    ...(options.availableCustomWidgets ?? []),
  ]);
  const missing = [
    ...component.qrcDependencies.filter((dependency) => !targetQrc.has(dependency)).map((dependency) => `Missing QRC dependency ${dependency}`),
    ...component.qssDependencies.filter((dependency) => !targetQss.has(dependency)).map((dependency) => `Missing QSS dependency ${dependency}`),
    ...component.customWidgets.filter((dependency) => !targetCustom.has(dependency.className)).map((dependency) => `Missing custom widget ${dependency.className}`),
  ];
  return [...new Set(missing)];
}

/**
 * Prepares a deterministic insertComponent resolver without mutating either
 * source document. Dependency failures are exposed for UI review and fail
 * closed when assertReady is used by the workflow.
 */
export function buildInsertComponentOperation(
  component: ComponentRecord,
  target: ParsedUiDocument,
  options: ComponentInsertionOptions,
): PreparedComponentInsertion {
  if (!target.index.layoutsByName.has(options.parentLayout)) throw new Error(`Unknown layout "${options.parentLayout}"`);
  const fragment = fragmentDocument(component.uiFragment);
  const usedNames = new Set(namedObjects(target));
  const renames = new Map<string, string>();
  for (const objectName of namedObjects(fragment)) {
    if (usedNames.has(objectName)) renames.set(objectName, nextName(options.objectPrefix, objectName, usedNames));
    else usedNames.add(objectName);
  }
  const itemXml = rewriteReferenceTokens(component.uiFragment, renames);
  const source: ComponentSource = {
    itemXml,
    objectNames: namedObjects(fragment).map((name) => renames.get(name) ?? name),
  };
  const operation: Extract<UiOperation, { op: 'insertComponent' }> = {
    op: 'insertComponent', componentId: component.id, parentLayout: options.parentLayout,
    objectPrefix: options.objectPrefix, ...(options.before ? { before: options.before } : {}),
  };
  const renamed = (name: string): string => renames.get(name) ?? name;
  const internalConnections = component.connections
    .filter((connection) => source.objectNames.includes(renamed(connection.sender)) && source.objectNames.includes(renamed(connection.receiver)))
    .map((connection): UiOperation => ({
      op: 'addExistingConnection', sender: renamed(connection.sender), signal: connection.signal,
      receiver: renamed(connection.receiver), slot: connection.slot,
    }));
  const fragmentTabs = fragment.index.tabStops.map(renamed);
  const tabOperation: UiOperation[] = fragmentTabs.length > 0
    ? [{ op: 'setTabOrder', order: [...target.index.tabStops, ...fragmentTabs.filter((tab) => !target.index.tabStops.includes(tab))] }]
    : [];
  const missingDependencies = dependencyReport(component, target, options);
  const assertReady = (): void => {
    if (missingDependencies.length > 0) throw new Error(missingDependencies.join('; '));
  };
  // Custom widgets are unsafe to insert even as a candidate: a missing plugin
  // changes generated UI semantics, so reject immediately with an actionable error.
  const customWidgetIssue = missingDependencies.find((issue) => issue.startsWith('Missing custom widget '));
  if (customWidgetIssue) throw new Error(customWidgetIssue);
  return {
    operation,
    operations: [operation, ...internalConnections, ...tabOperation],
    source,
    missingDependencies,
    resolveComponent: (componentId, _objectPrefix) => componentId === component.id ? source : undefined,
    assertReady,
  };
}

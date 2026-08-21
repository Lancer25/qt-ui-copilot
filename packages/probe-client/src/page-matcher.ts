import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { UiFingerprint } from '@qt-ui-copilot/ui-document';

export interface RuntimeWidgetTree {
  objectName: string;
  className: string;
  layoutClass?: string;
  text?: string;
  children: RuntimeWidgetTree[];
}

export interface PageScoreComponents {
  rootName: number;
  childNames: number;
  hierarchy: number;
  layouts: number;
  className: number;
  text: number;
}

export type PageMatchDecision =
  | { kind: 'auto'; score: number }
  | { kind: 'confirm'; score: number }
  | { kind: 'reject'; score: number };

export interface PageMatchResult {
  decision: PageMatchDecision;
  components: PageScoreComponents;
}

export interface PageBinding {
  uiFile: string;
  runtimeRootObjectName: string;
  confirmedAt: string;
}

/** A deliberately small on-disk binding store.  The task store can later own this file's location. */
export class PageBindingStore {
  constructor(private readonly filePath: string) {}

  get(uiFile: string): PageBinding | undefined {
    return this.load()[uiFile];
  }

  confirm(binding: PageBinding): void {
    const bindings = this.load();
    bindings[binding.uiFile] = binding;
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    writeFileSync(temporary, JSON.stringify(bindings, null, 2), 'utf8');
    renameSync(temporary, this.filePath);
  }

  private load(): Record<string, PageBinding> {
    if (!existsSync(this.filePath)) return {};
    const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`Invalid page bindings file: ${this.filePath}`);
    return parsed as Record<string, PageBinding>;
  }
}

const weights = {
  rootName: 0.35,
  childNames: 0.30,
  hierarchy: 0.15,
  layouts: 0.10,
  className: 0.05,
  text: 0.05,
} as const;

function descendants(root: RuntimeWidgetTree): RuntimeWidgetTree[] {
  return root.children.flatMap((child) => [child, ...descendants(child)]);
}

function setSimilarity(expected: readonly string[], actual: readonly string[]): number {
  const left = new Set(expected.filter(Boolean));
  const right = new Set(actual.filter(Boolean));
  if (left.size === 0 && right.size === 0) return 1;
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / new Set([...left, ...right]).size;
}

/** Prefix/suffix similarity keeps renamed generated roots eligible for human confirmation, never auto-binding. */
function nameSimilarity(expected: string, actual: string): number {
  if (!expected && !actual) return 1;
  if (!expected || !actual) return 0;
  if (expected === actual) return 1;
  let prefix = 0;
  while (prefix < expected.length && prefix < actual.length && expected[prefix] === actual[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < expected.length && suffix < actual.length && expected[expected.length - suffix - 1] === actual[actual.length - suffix - 1]) suffix += 1;
  return Math.max(prefix, suffix) / Math.max(expected.length, actual.length);
}

function expectedTexts(fingerprint: UiFingerprint): string[] {
  const extended = fingerprint as UiFingerprint & { texts?: string[] };
  return extended.texts ?? [];
}

function expectedHierarchy(fingerprint: UiFingerprint): string[] | undefined {
  const extended = fingerprint as UiFingerprint & { hierarchyPaths?: string[] };
  return extended.hierarchyPaths;
}

function runtimeHierarchy(root: RuntimeWidgetTree, parent = ''): string[] {
  const current = parent ? `${parent}/${root.objectName}` : root.objectName;
  return [current, ...root.children.flatMap((child) => runtimeHierarchy(child, current))];
}

/**
 * Scores static .ui evidence against a visible runtime tree with the weights fixed
 * in the approved design.  Only scores >= 0.90 bind automatically; 0.70–0.89
 * explicitly requires user confirmation.
 */
export function matchVisiblePage(fingerprint: UiFingerprint, runtime: RuntimeWidgetTree): PageMatchResult {
  const nodes = [runtime, ...descendants(runtime)];
  // Root identity is scored independently. Including it here would let a
  // changed/generated root name incorrectly depress the child-set evidence.
  const runtimeNames = descendants(runtime).map((node) => node.objectName);
  const runtimeLayouts = nodes.map((node) => node.layoutClass ?? '');
  const runtimeTexts = nodes.map((node) => node.text ?? '').filter(Boolean);
  const childNames = setSimilarity(fingerprint.widgetNames.filter((name) => name !== fingerprint.rootObjectName), runtimeNames);
  const hierarchy = expectedHierarchy(fingerprint)
    ? setSimilarity(expectedHierarchy(fingerprint)!, runtimeHierarchy(runtime))
    : childNames;
  const components: PageScoreComponents = {
    rootName: nameSimilarity(fingerprint.rootObjectName, runtime.objectName),
    childNames,
    hierarchy,
    layouts: setSimilarity(fingerprint.layoutClasses, runtimeLayouts),
    className: fingerprint.formClass === runtime.className || fingerprint.widgetClasses.includes(runtime.className) ? 1 : 0,
    text: expectedTexts(fingerprint).length === 0 ? 1 : setSimilarity(expectedTexts(fingerprint), runtimeTexts),
  };
  const score = Object.entries(weights).reduce((total, [key, weight]) => total + components[key as keyof PageScoreComponents] * weight, 0);
  const rounded = Math.round(score * 100) / 100;
  return {
    components,
    decision: rounded >= 0.90 ? { kind: 'auto', score: rounded } : rounded >= 0.70 ? { kind: 'confirm', score: rounded } : { kind: 'reject', score: rounded },
  };
}

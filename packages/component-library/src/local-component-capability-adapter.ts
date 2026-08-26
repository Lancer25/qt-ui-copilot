import path from 'node:path';
import {
  UiCapabilityCandidateSchema,
  UiCapabilitySchema,
  type ComponentRecord,
  type UiCapability,
  type UiCapabilityCandidate,
} from '@qt-ui-copilot/contracts';
import type { ComponentCandidate } from './search.js';

export interface LocalComponentCapabilityAdapterOptions {
  /** Project/library root used to make an absolute sourceUiFile safe for the capability contract. */
  projectRoot?: string;
  /** The compatibility floor for records which do not declare a Qt range. */
  defaultMinQtVersion?: string;
  adapterId?: string;
}

function versions(range: string | undefined, fallback: string): { minVersion: string; maxVersion?: string } {
  const found = [...(range ?? '').matchAll(/(?:\d+\.){1,2}\d+/g)].map((match) => match[0]);
  const min = found[0] ?? fallback;
  if (!range) return { minVersion: min };
  const exact = /^\s*(\d+(?:\.\d+){1,2})\s*$/.exec(range);
  if (exact) return { minVersion: exact[1], maxVersion: exact[1] };
  const upper = /(?:<|<=)\s*((?:\d+\.){1,2}\d+)/.exec(range)?.[1];
  return { minVersion: min, ...(upper ? { maxVersion: upper } : {}) };
}

function capabilityPath(sourceUiFile: string, projectRoot?: string): string {
  const normalized = sourceUiFile.replaceAll('\\', '/');
  if (!path.isAbsolute(sourceUiFile) && !/^[A-Za-z]:\//.test(normalized)) return normalized;
  if (projectRoot) {
    const relative = path.relative(path.resolve(projectRoot), path.resolve(sourceUiFile)).replaceAll('\\', '/');
    if (relative && !relative.startsWith('../') && relative !== '..' && !/^[A-Za-z]:\//.test(relative)) return relative;
  }
  // The capability contract deliberately forbids host absolute paths. Keep a
  // useful stable reference when records predate that contract.
  return path.basename(sourceUiFile);
}

function rootClass(record: ComponentRecord): string {
  const fromFragment = /<widget\s+class="([A-Za-z_][A-Za-z0-9_:]*)"/.exec(record.uiFragment)?.[1];
  return fromFragment ?? record.widgetClasses[0] ?? 'QWidget';
}

function promotedId(className: string): string {
  return `local.promoted.${className}`;
}

export class LocalComponentCapabilityAdapter {
  private readonly options: Required<Pick<LocalComponentCapabilityAdapterOptions, 'defaultMinQtVersion' | 'adapterId'>> & LocalComponentCapabilityAdapterOptions;

  public constructor(options: LocalComponentCapabilityAdapterOptions = {}) {
    this.options = {
      defaultMinQtVersion: options.defaultMinQtVersion ?? '5.9.6',
      adapterId: options.adapterId ?? 'local-component-library',
      ...options,
    };
  }

  public fromRecord(record: ComponentRecord): UiCapability {
    const qt = versions(record.qtVersionRange, this.options.defaultMinQtVersion);
    const customWidgetIds = record.customWidgets.map((widget) => promotedId(widget.className));
    const tags = [...new Set([
      ...record.tags,
      ...record.widgetClasses.map((className) => `widget:${className}`),
      ...record.layoutTypes.map((layout) => `layout:${layout}`),
    ])];
    return UiCapabilitySchema.parse({
      id: `local.ui_fragment.${record.id}`,
      kind: 'ui_fragment',
      displayName: record.name,
      description: [record.description, record.structureSummary, record.usageNotes].filter(Boolean).join(' '),
      tags,
      qt: { ...qt, modules: ['Widgets'], verifiedKitIds: [] },
      designer: { className: rootClass(record), container: true },
      dependencies: {
        qss: record.qssDependencies,
        qrc: record.qrcDependencies,
        fonts: [],
        promotedWidgets: customWidgetIds,
      },
      source: {
        type: 'local_library',
        path: capabilityPath(record.sourceUiFile, this.options.projectRoot),
        adapterId: this.options.adapterId,
      },
    });
  }

  public toCandidate(candidate: ComponentCandidate): UiCapabilityCandidate {
    const capability = this.fromRecord(candidate.component);
    return UiCapabilityCandidateSchema.parse({
      capabilityId: capability.id,
      displayName: capability.displayName,
      kind: capability.kind,
      description: capability.description,
      tags: capability.tags,
      dependencyStatus: candidate.missingDependencies.length === 0 ? 'ready' : 'degraded',
      reasons: [...candidate.reasons, ...candidate.missingDependencies],
    });
  }
}


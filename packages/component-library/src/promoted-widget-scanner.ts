import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { UiCapabilitySchema, type UiCapability } from '@qt-ui-copilot/contracts';
import { parseUi } from '@qt-ui-copilot/ui-document';

/** A deliberately small view of a project inventory accepted by the scanner. */
export interface PromotedWidgetProjectFile {
  absolutePath: string;
  relativePath?: string;
  kind?: string;
}

export interface PromotedWidgetScannerOptions {
  /** Workspace root used to validate and normalise paths. */
  projectRoot?: string;
  /** Qt version known for the project; the product floor is used otherwise. */
  qtVersion?: string;
  /** Optional kit IDs for which the declaration has been verified. */
  verifiedKitIds?: string[];
}

type ProjectFileInput = string | PromotedWidgetProjectFile;

function asPath(file: ProjectFileInput): string {
  return typeof file === 'string' ? file : file.absolutePath;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function normalisedRelative(root: string, file: string): string {
  return path.relative(root, file).replaceAll('\\', '/');
}

function declaredContainer(source: string, className: string): boolean {
  const block = source.match(new RegExp(`<customwidget\\b[\\s\\S]*?<class>\\s*${className.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*<\\/class>[\\s\\S]*?<\\/customwidget>`, 'i'))?.[0];
  return /<container>\s*1\s*<\/container>/i.test(block ?? '');
}

function headerCandidates(header: string, uiFile: string, projectRoot: string): string[] {
  const value = header.replaceAll('\\', '/');
  return [
    path.resolve(projectRoot, value),
    path.resolve(path.dirname(uiFile), value),
    path.resolve(projectRoot, value.replace(/^.*?:/, '')),
  ];
}

function safeHeaderPath(header: string | undefined, uiFile: string, projectRoot: string, knownFiles: Set<string>): string | undefined {
  if (!header) return undefined;
  for (const candidate of headerCandidates(header, uiFile, projectRoot)) {
    const absolute = path.resolve(candidate);
    if (!isInside(projectRoot, absolute)) continue;
    if (knownFiles.has(absolute) || existsSync(absolute)) return normalisedRelative(projectRoot, absolute);
  }
  return undefined;
}

function capabilityFor(
  className: string,
  extendsClass: string | undefined,
  header: string | undefined,
  container: boolean,
  uiFile: string,
  options: Required<Pick<PromotedWidgetScannerOptions, 'projectRoot' | 'qtVersion' | 'verifiedKitIds'>>,
): UiCapability {
  return UiCapabilitySchema.parse({
    id: `project.promoted.${className}`,
    kind: 'promoted_widget',
    displayName: className,
    description: `项目已声明的 Promoted Widget：${className}`,
    tags: ['project', 'promoted_widget', className, ...(extendsClass ? [`extends:${extendsClass}`] : [])],
    qt: { minVersion: options.qtVersion, modules: ['Widgets'], verifiedKitIds: options.verifiedKitIds },
    designer: {
      className,
      ...(extendsClass ? { baseClass: extendsClass } : {}),
      ...(header ? { header } : {}),
      container,
    },
    dependencies: { qss: [], qrc: [], fonts: [], promotedWidgets: [] },
    source: { type: 'project', path: normalisedRelative(options.projectRoot, uiFile), adapterId: 'project-promoted-widget-scanner' },
  });
}

/**
 * Scan only declarations already present in .ui files.  The scanner never
 * guesses class names by parsing arbitrary C++; a declared header must also
 * exist in the project inventory (or on disk) before a capability is emitted.
 */
export function scanPromotedWidgets(projectFiles: readonly ProjectFileInput[], options: PromotedWidgetScannerOptions = {}): UiCapability[] {
  const files = projectFiles.map(asPath).map((file) => path.resolve(file));
  const projectRoot = path.resolve(options.projectRoot ?? commonRoot(files));
  const knownFiles = new Set(files.filter((file) => isInside(projectRoot, file)));
  const configured = {
    projectRoot,
    qtVersion: options.qtVersion ?? '5.9.6',
    verifiedKitIds: [...(options.verifiedKitIds ?? [])].sort(),
  };
  const capabilities = new Map<string, UiCapability>();

  for (const uiFile of files.filter((file) => path.extname(file).toLowerCase() === '.ui').sort()) {
    if (!isInside(projectRoot, uiFile) || !existsSync(uiFile)) continue;
    let source: string;
    try { source = readFileSync(uiFile, 'utf8'); parseUi(source, uiFile); } catch { continue; }
    for (const declaration of parseUi(source, uiFile).index.customWidgets) {
      const header = safeHeaderPath(declaration.header, uiFile, projectRoot, knownFiles);
      // A Promoted Widget without a usable header cannot be instantiated by
      // the project and should not be offered as a ready capability.
      if (declaration.header && !header) continue;
      const capability = capabilityFor(declaration.className, declaration.extends, header, declaredContainer(source, declaration.className), uiFile, configured);
      capabilities.set(capability.id, capability);
    }
  }
  return [...capabilities.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function commonRoot(files: readonly string[]): string {
  if (files.length === 0) return process.cwd();
  const first = path.parse(files[0]).root;
  const segments = files.map((file) => path.dirname(file).split(path.sep));
  const shared: string[] = [];
  for (let index = 0; index < Math.min(...segments.map((items) => items.length)); index += 1) {
    if (segments.every((items) => items[index].toLowerCase() === segments[0][index].toLowerCase())) shared.push(segments[0][index]);
    else break;
  }
  return shared.length ? path.join(...shared) : first;
}


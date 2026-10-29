import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  QtBinaryComponentMappingSchema,
  QtBinaryDiscoveryItemSchema,
  type QtBinaryComponentMapping,
  type QtBinaryDiscoveryItem,
} from '@qt-ui-copilot/contracts';

export interface QtBinarySourceDiscoveryInput {
  sourceId: string;
  rootDir: string;
  discovery: 'manifest' | 'scan' | 'hybrid';
  limit?: number;
}

const MAX_FILES = 2_048;
const MAX_COMPONENTS = 2_048;
const MAX_DEPTH = 16;
const MAX_HEADER_BYTES = 1_000_000;
const SKIPPED_DIRECTORIES = new Set(['.git', '.svn', 'node_modules', 'build', 'dist', '.qt-ui-copilot']);
const HEADER_EXTENSIONS = new Set(['.h', '.hpp', '.hh', '.hxx']);
const SOURCE_EXTENSIONS = new Set(['.cpp', '.cc', '.cxx']);
const SUPPORTED_EXTENSIONS = new Set([...HEADER_EXTENSIONS, ...SOURCE_EXTENSIONS, '.dll', '.lib', '.qss', '.qrc']);

const normalised = (value: string): string => value.replaceAll('\\', '/');
const safeComponentId = (value: string): string => value.replace(/[^A-Za-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 128) || 'component';
const discoveryIdentity = (headerPath: string, className: string): string => `${normalised(headerPath).toLowerCase()}::${className.toLowerCase()}`;
const automaticComponentId = (headerPath: string, className: string): string => safeComponentId(`${normalised(headerPath)}-${className}`);

function rootRelative(root: string, candidate: string): string {
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Component path escapes source root: ${candidate}`);
  return normalised(relative);
}

async function walk(root: string, relative = '', depth = 0, files: string[] = []): Promise<string[]> {
  if (depth > MAX_DEPTH) return files;
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (files.length >= MAX_FILES || entry.isSymbolicLink()) continue;
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) await walk(root, next, depth + 1, files);
    } else if (entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(rootRelative(root, next));
    }
  }
  return files;
}

function sameStem(left: string, right: string): boolean {
  return path.basename(left, path.extname(left)).toLocaleLowerCase() === path.basename(right, path.extname(right)).toLocaleLowerCase();
}

function firstSameStem(files: string[], header: string, extension: string): string | undefined {
  return files.find((file) => path.extname(file).toLowerCase() === extension && sameStem(file, header));
}

function sourceFilesFor(files: string[], header: string): string[] {
  return files.filter((file) => SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase()) && sameStem(file, header)).slice(0, 256);
}

function binaryAssociation(files: string[], header: string, extension: '.dll' | '.lib'): { path?: string; kind: 'same_stem' | 'single_library' | 'ambiguous' | 'missing' } {
  const exact = firstSameStem(files, header, extension);
  if (exact) return { path: exact, kind: 'same_stem' };
  const candidates = files.filter((file) => path.extname(file).toLowerCase() === extension);
  if (candidates.length === 1) return { path: candidates[0], kind: 'single_library' };
  return { kind: candidates.length ? 'ambiguous' : 'missing' };
}

function firstSameStemOrPrefix(files: string[], header: string, extension: string): string | undefined {
  const exact = firstSameStem(files, header, extension);
  if (exact) return exact;
  const headerStem = path.basename(header, path.extname(header)).toLowerCase();
  return files.find((file) => path.extname(file).toLowerCase() === extension && path.basename(file, path.extname(file)).toLowerCase() === headerStem.replace(/card$/i, ''));
}

async function headerText(root: string, relative: string): Promise<string> {
  const absolute = path.join(root, relative);
  const metadata = await lstat(absolute);
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error(`Header is not a regular file: ${relative}`);
  if (metadata.size > MAX_HEADER_BYTES) throw new Error(`Header exceeds ${MAX_HEADER_BYTES} bytes: ${relative}`);
  return readFile(absolute, 'utf8');
}

async function hashComponentFiles(root: string, relativePaths: string[]): Promise<string> {
  const hash = createHash('sha256');
  for (const relative of relativePaths.filter(Boolean).sort()) {
    const absolute = path.join(root, relative);
    const metadata = await lstat(absolute);
    if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error(`Component asset is not a regular file: ${relative}`);
    hash.update(relative);
    hash.update(await readFile(absolute));
  }
  return hash.digest('hex');
}

async function regularFile(root: string, relative: string): Promise<void> {
  // Resolve through rootRelative before touching the filesystem. This rejects
  // traversal and absolute paths supplied by a third-party manifest.
  const safeRelative = rootRelative(root, relative);
  const metadata = await lstat(path.join(root, safeRelative));
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error(`Component manifest asset is not a regular file: ${relative}`);
}

function pendingReason(mapping: QtBinaryComponentMapping): string {
  const missing = [
    mapping.qtMajor === undefined ? 'Qt 主版本' : undefined,
    !mapping.compilerAbi ? '编译器 ABI' : undefined,
    !mapping.architecture ? '架构' : undefined,
    !mapping.approved ? '用户确认' : undefined,
  ].filter((value): value is string => Boolean(value));
  return missing.length ? `需补充 ${missing.join('、')} 后才能使用` : '需完成兼容性校验后才能使用';
}

async function manifestDiscoveries(root: string, sourceId: string, limit: number, graph: Map<string, HeaderCandidate>): Promise<QtBinaryDiscoveryItem[]> {
  const manifestRelative = 'component-library.json';
  const manifestPath = path.join(root, manifestRelative);
  let manifestStats;
  try {
    manifestStats = await lstat(manifestPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  if (manifestStats.isSymbolicLink() || !manifestStats.isFile()) throw new Error(`Component manifest is not a regular file: ${manifestRelative}`);
  if (manifestStats.size > MAX_HEADER_BYTES) throw new Error(`Component manifest exceeds ${MAX_HEADER_BYTES} bytes`);
  const raw = JSON.parse(await readFile(manifestPath, 'utf8')) as { components?: unknown };
  if (!Array.isArray(raw.components)) throw new Error('component-library.json must contain a components array');
  const results: QtBinaryDiscoveryItem[] = [];
  for (const entry of raw.components.slice(0, limit)) {
    const mapping = QtBinaryComponentMappingSchema.parse(entry);
    const referencedFiles = [
      mapping.headerPath,
      ...(mapping.sourcePaths ?? []),
      mapping.dllPath,
      mapping.libPath,
      mapping.qssPath,
      mapping.qrcPath,
      ...mapping.runtimeDllPaths,
    ].filter((value): value is string => Boolean(value));
    for (const relative of referencedFiles) await regularFile(root, relative);
    const source = await headerText(root, mapping.headerPath);
    const headerCandidate = candidatesFromHeader(source).find((candidate) => candidate.className === mapping.className);
    if (!headerCandidate) throw new Error(`Component manifest class does not match a conservative Qt widget declaration: ${mapping.className}`);
    const inferredQtBaseClass = resolveQtBase(mapping.className, graph);
    results.push(QtBinaryDiscoveryItemSchema.parse({
      sourceId,
      componentId: mapping.componentId,
      className: mapping.className,
      baseClass: mapping.baseClass,
      ...(headerCandidate.directBaseClass ? { directBaseClass: headerCandidate.directBaseClass } : {}),
      ...(inferredQtBaseClass ? { inferredQtBaseClass } : {}),
      headerPath: rootRelative(root, mapping.headerPath),
      integration: mapping.integration ?? ((mapping.sourcePaths?.length ?? 0) > 0 ? 'source' : mapping.dllPath || mapping.libPath ? 'binary' : 'header_only'),
      sourcePaths: (mapping.sourcePaths ?? []).map((relative) => rootRelative(root, relative)),
      ...(mapping.dllPath ? { dllPath: rootRelative(root, mapping.dllPath) } : {}),
      ...(mapping.libPath ? { libPath: rootRelative(root, mapping.libPath) } : {}),
      ...(mapping.qssPath ? { qssPath: rootRelative(root, mapping.qssPath) } : {}),
      ...(mapping.qrcPath ? { qrcPath: rootRelative(root, mapping.qrcPath) } : {}),
      hasQObject: headerCandidate.hasQObject,
      properties: headerCandidate.properties,
      ...(headerCandidate.exportMacro ? { exportMacro: headerCandidate.exportMacro } : {}),
      contentHash: await hashComponentFiles(root, referencedFiles.map((relative) => rootRelative(root, relative))),
      // A scanner/manifest cannot establish that a binary matches the active
      // Kit. Only service-side ABI gating may promote this to ready.
      status: 'needs_mapping',
      reason: pendingReason(mapping),
    }));
  }
  return results;
}

interface HeaderCandidate {
  className: string;
  directBaseClass?: string;
  hasQObject: boolean;
  properties: string[];
  exportMacro?: string;
}

function platformVisibleSource(source: string, platform = process.platform): string {
  const lines = source.split(/\r?\n/); const active: boolean[] = [true]; const known: boolean[] = [false];
  const isWindows = platform === 'win32'; const isLinux = platform === 'linux';
  const result: string[] = [];
  for (const line of lines) {
    const directive = line.trim();
    const match = /^#\s*(ifdef|ifndef)\s+(__linux__|linux|_WIN32|WIN32)\b/.exec(directive);
    if (match) {
      const symbolActive = /linux/.test(match[2]) ? isLinux : isWindows;
      const condition = match[1] === 'ifndef' ? !symbolActive : symbolActive;
      active.push(active.at(-1)! && condition); known.push(true); continue;
    }
    if (/^#\s*(?:if|ifdef|ifndef)\b/.test(directive)) { active.push(active.at(-1)!); known.push(false); continue; }
    if (/^#\s*else\b/.test(directive)) { if (known.at(-1)) { const parent = active.length > 1 ? active[active.length - 2]! : true; active[active.length - 1] = parent && !active.at(-1)!; } continue; }
    if (/^#\s*endif\b/.test(directive) && active.length > 1) { active.pop(); known.pop(); continue; }
    if (active.at(-1)) result.push(line);
  }
  return result.join('\n');
}

function candidatesFromHeader(source: string): HeaderCandidate[] {
  source = platformVisibleSource(source);
  const candidates: HeaderCandidate[] = [];
  // This intentionally captures any public base. A later graph pass decides
  // whether it reaches a Qt visual base; direct inheritance is not required.
  const matcher = /^\s*class\s+(?:(?<exportMacro>[A-Z][A-Z0-9_]{2,})\s+)?(?<className>[A-Za-z_]\w*)\s*:\s*(?<bases>[^\{]+)\{/gm;
  for (const match of source.matchAll(matcher)) {
    const localClassName = match.groups?.className;
    const directBaseClass = match.groups?.bases?.match(/\bpublic\s+(?:class\s+|struct\s+)?(?<base>(?:::)?[A-Za-z_]\w*(?:::[A-Za-z_]\w*)?)/)?.groups?.base?.replace(/^::/, '');
    if (!localClassName) continue;
    const prefix = source.slice(0, match.index ?? 0);
    const namespaceMatches = [...prefix.matchAll(/\bnamespace\s+([A-Za-z_]\w*)\s*\{/g)];
    const namespaceMatch = namespaceMatches.at(-1);
    const namespaceBody = namespaceMatch ? prefix.slice((namespaceMatch.index ?? 0) + namespaceMatch[0].length) : '';
    const namespaceOpen = namespaceMatch && ([...namespaceBody].filter((value) => value === '{').length + 1 > [...namespaceBody].filter((value) => value === '}').length);
    const className = namespaceOpen ? `${namespaceMatch![1]}::${localClassName}` : localClassName;
    const bodyEnd = source.indexOf('};', (match.index ?? 0) + match[0].length);
    const body = source.slice((match.index ?? 0) + match[0].length, bodyEnd === -1 ? Math.min(source.length, (match.index ?? 0) + 32_000) : bodyEnd);
    const properties = [...body.matchAll(/\bQ_PROPERTY\s*\(\s*[^\s)]+\s+([A-Za-z_]\w*)/g)].map((property) => property[1]).filter((value, index, values) => values.indexOf(value) === index).slice(0, 128);
    candidates.push({ className, ...(directBaseClass ? { directBaseClass } : {}), hasQObject: /\bQ_OBJECT\b/.test(body), properties, ...(match.groups?.exportMacro ? { exportMacro: match.groups.exportMacro } : {}) });
  }
  return candidates;
}

const knownQtBases: Record<string, 'QWidget' | 'QDialog' | 'QMainWindow'> = {
  QWidget: 'QWidget', QDialog: 'QDialog', QMainWindow: 'QMainWindow',
  QFrame: 'QWidget', QLabel: 'QWidget', QLineEdit: 'QWidget', QComboBox: 'QWidget', QFontComboBox: 'QWidget',
  QAbstractButton: 'QWidget', QPushButton: 'QWidget', QToolButton: 'QWidget', QCheckBox: 'QWidget', QRadioButton: 'QWidget', QCommandLinkButton: 'QWidget',
  QAbstractItemView: 'QWidget', QListView: 'QWidget', QTableView: 'QWidget', QTreeView: 'QWidget', QColumnView: 'QWidget', QHeaderView: 'QWidget',
  QListWidget: 'QWidget', QTableWidget: 'QWidget', QTreeWidget: 'QWidget', QUndoView: 'QWidget',
  QAbstractSlider: 'QWidget', QSlider: 'QWidget', QScrollBar: 'QWidget', QDial: 'QWidget',
  QAbstractSpinBox: 'QWidget', QSpinBox: 'QWidget', QDoubleSpinBox: 'QWidget', QDateTimeEdit: 'QWidget', QDateEdit: 'QWidget', QTimeEdit: 'QWidget',
  QAbstractScrollArea: 'QWidget', QScrollArea: 'QWidget', QTextEdit: 'QWidget', QTextBrowser: 'QWidget', QPlainTextEdit: 'QWidget', QMdiArea: 'QWidget',
  QTabWidget: 'QWidget', QStackedWidget: 'QWidget', QToolBox: 'QWidget', QGroupBox: 'QWidget', QSplitter: 'QWidget', QDockWidget: 'QWidget',
  QCalendarWidget: 'QWidget', QDialogButtonBox: 'QWidget', QKeySequenceEdit: 'QWidget', QLCDNumber: 'QWidget', QProgressBar: 'QWidget', QSizeGrip: 'QWidget', QStatusBar: 'QWidget',
  QGraphicsView: 'QWidget', QOpenGLWidget: 'QWidget', QMenu: 'QWidget', QMenuBar: 'QWidget', QToolBar: 'QWidget', QWizard: 'QWidget', QWizardPage: 'QWidget',
};

function resolveQtBase(className: string, graph: Map<string, HeaderCandidate>, seen = new Set<string>()): 'QWidget' | 'QDialog' | 'QMainWindow' | undefined {
  const localName = className.split('::').at(-1) ?? className;
  if (knownQtBases[localName]) return knownQtBases[localName];
  if (seen.has(localName)) return undefined;
  seen.add(localName);
  const candidate = graph.get(localName);
  return candidate?.directBaseClass ? resolveQtBase(candidate.directBaseClass, graph, seen) : undefined;
}

/**
 * Safe, lexical discovery only. It deliberately does not inspect DLL exports
 * or load a third-party binary. ABI/Qt-version data can only be supplied by a
 * manifest or user mapping, so discovered records always need confirmation.
 */
export class QtBinarySourceAdapter {
  async discover(input: QtBinarySourceDiscoveryInput): Promise<QtBinaryDiscoveryItem[]> {
    const root = path.resolve(input.rootDir);
    const rootStats = await lstat(root);
    if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) throw new Error(`Qt binary component source is not a directory or is a symbolic link: ${root}`);
    const files = await walk(root);
    const headers = files.filter((file) => HEADER_EXTENSIONS.has(path.extname(file).toLowerCase()));
    const limit = Math.min(Math.max(input.limit ?? MAX_COMPONENTS, 1), MAX_COMPONENTS);
    const discoveredHeaders = new Map<string, HeaderCandidate[]>();
    const graph = new Map<string, HeaderCandidate>();
    for (const headerPath of headers) {
      const candidates = candidatesFromHeader(await headerText(root, headerPath));
      discoveredHeaders.set(headerPath, candidates);
      for (const candidate of candidates) { graph.set(candidate.className, candidate); graph.set(candidate.className.split('::').at(-1)!, candidate); }
    }
    const discoveries: QtBinaryDiscoveryItem[] = [];

    // A manifest is intentionally not trusted as executable proof. Service
    // integration validates its mappings later; scanner only exposes a safe
    // declaration for user mapping/ABI verification.
    if (input.discovery !== 'scan') discoveries.push(...await manifestDiscoveries(root, input.sourceId, limit, graph));
    if (input.discovery === 'manifest') return discoveries;
    const declaredIdentities = new Set(discoveries.map((item) => discoveryIdentity(item.headerPath, item.className)));

    for (const headerPath of headers) {
      if (discoveries.length >= limit) break;
      for (const candidate of discoveredHeaders.get(headerPath) ?? []) {
        if (discoveries.length >= limit) break;
        const inferredQtBaseClass = resolveQtBase(candidate.className, graph);
        if (!inferredQtBaseClass && !candidate.hasQObject) continue;
        const identity = discoveryIdentity(headerPath, candidate.className);
        if (declaredIdentities.has(identity)) continue;
        const componentId = automaticComponentId(headerPath, candidate.className);
        const sourcePaths = sourceFilesFor(files, headerPath);
        const dll = binaryAssociation(files, headerPath, '.dll');
        const lib = binaryAssociation(files, headerPath, '.lib');
        const dllPath = dll.path;
        const libPath = lib.path;
        const qssPath = firstSameStemOrPrefix(files, headerPath, '.qss');
        const qrcPath = firstSameStemOrPrefix(files, headerPath, '.qrc');
        const contentHash = await hashComponentFiles(root, [headerPath, ...sourcePaths, dllPath, libPath, qssPath, qrcPath].filter((value): value is string => Boolean(value)));
        discoveries.push(QtBinaryDiscoveryItemSchema.parse({
          sourceId: input.sourceId,
          componentId,
          className: candidate.className,
          baseClass: inferredQtBaseClass ?? candidate.directBaseClass ?? '未知基类',
          ...(candidate.directBaseClass ? { directBaseClass: candidate.directBaseClass } : {}),
          ...(inferredQtBaseClass ? { inferredQtBaseClass } : {}),
          headerPath,
          integration: sourcePaths.length ? 'source' : dllPath || libPath ? 'binary' : 'header_only',
          sourcePaths,
          ...(dllPath ? { dllPath } : {}),
          ...(libPath ? { libPath } : {}),
          dllAssociation: dll.kind,
          libAssociation: lib.kind,
          ...(qssPath ? { qssPath } : {}),
          ...(qrcPath ? { qrcPath } : {}),
          hasQObject: candidate.hasQObject,
          properties: candidate.properties,
          ...(candidate.exportMacro ? { exportMacro: candidate.exportMacro } : {}),
          contentHash,
          status: 'needs_mapping',
          reason: '需补充 Qt 版本、编译器 ABI、架构并确认映射后才能使用',
        }));
        declaredIdentities.add(identity);
      }
    }
    return discoveries;
  }
}

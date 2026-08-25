import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';

export type WorkspaceFileKind = 'ui' | 'qss' | 'qrc' | 'source' | 'header' | 'cmake' | 'font' | 'plugin' | 'other';

export interface WorkspaceFile {
  absolutePath: string;
  relativePath: string;
  kind: WorkspaceFileKind;
  size: number;
  modifiedAt: number;
  contentHash: string;
}

export interface WorkspaceSummary {
  id: string;
  rootDir: string;
  name: string;
  fileCount: number;
  lastOpenedAt: number;
  createdAt: number;
  updatedAt: number;
  files: WorkspaceFile[];
}

export interface WorkspaceScanOptions {
  /** Additional directory or relative-path patterns to ignore. */
  ignorePatterns?: string[];
}

const ignoredDirectories = new Set(['.git', '.svn', 'node_modules', 'build']);
const sourceExtensions = new Set(['.c', '.cc', '.cpp', '.cxx', '.mm']);
const headerExtensions = new Set(['.h', '.hh', '.hpp', '.hxx']);
const cmakeExtensions = new Set(['.cmake', '.pri', '.pro', '.qmake']);
const fontExtensions = new Set(['.ttf', '.otf', '.woff', '.woff2']);
const pluginExtensions = new Set(['.dll', '.so', '.dylib']);
const textExtensions = new Set(['.md', '.txt', '.xml', '.ini', '.conf', '.config', '.json', '.toml', '.yaml', '.yml', '.gitignore']);

const normalizeRoot = (rootDir: string): string => resolve(rootDir);
const normalizeRelative = (value: string): string => value.split(sep).join('/');
const hashContent = (content: Buffer): string => createHash('sha256').update(content).digest('hex');

const globToRegExp = (pattern: string): RegExp => {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*') {
      if (pattern[index + 1] === '*') { source += '.*'; index += 1; }
      else source += '[^/]*';
    } else if (character === '?') source += '[^/]';
    else source += /[\\^$+?.()|{}\[\]]/.test(character) ? `\\${character}` : character;
  }
  return new RegExp(`^${source}(?:/|$)`);
};

const matchesIgnore = (relativePath: string, patterns: string[]): boolean => {
  const normalized = normalizeRelative(relativePath).replace(/\/$/, '');
  const segments = normalized.split('/');
  if (segments.some((segment) => ignoredDirectories.has(segment))) return true;
  if (normalized.startsWith('.qt-ui-copilot/build/') || normalized === '.qt-ui-copilot/build') return true;
  return patterns.some((pattern) => {
    const candidate = normalizeRelative(pattern).replace(/^\.\//, '').replace(/\/$/, '');
    if (!candidate) return false;
    if (!candidate.includes('*') && (normalized === candidate || normalized.startsWith(`${candidate}/`))) return true;
    return globToRegExp(candidate).test(normalized);
  });
};

const kindForPath = (filePath: string): WorkspaceFileKind | undefined => {
  const lower = basename(filePath).toLowerCase();
  const extension = lower.includes('.') ? lower.slice(lower.lastIndexOf('.')) : '';
  if (extension === '.ui') return 'ui';
  if (extension === '.qss') return 'qss';
  if (extension === '.qrc') return 'qrc';
  if (sourceExtensions.has(extension)) return 'source';
  if (headerExtensions.has(extension)) return 'header';
  if (cmakeExtensions.has(extension) || lower === 'cmakelists.txt') return 'cmake';
  if (fontExtensions.has(extension)) return 'font';
  if (pluginExtensions.has(extension)) return 'plugin';
  if (textExtensions.has(extension)) return 'other';
  return undefined;
};

export class WorkspaceService {
  private readonly workspaces = new Map<string, { rootDir: string; options: WorkspaceScanOptions }>();

  async open(rootDir: string, options: WorkspaceScanOptions = {}): Promise<WorkspaceSummary> {
    const normalizedRoot = normalizeRoot(rootDir);
    const stats = await lstat(normalizedRoot);
    if (!stats.isDirectory()) throw new Error(`Workspace root is not a directory: ${normalizedRoot}`);
    const id = `workspace-${createHash('sha256').update(normalizedRoot.toLowerCase()).digest('hex').slice(0, 16)}`;
    this.workspaces.set(id, { rootDir: normalizedRoot, options: { ignorePatterns: [...(options.ignorePatterns ?? [])] } });
    const now = Date.now();
    const files = await this.listFiles(id);
    return { id, name: basename(normalizedRoot), rootDir: normalizedRoot, fileCount: files.length, lastOpenedAt: now, createdAt: now, updatedAt: now, files };
  }

  async listFiles(workspaceId: string): Promise<WorkspaceFile[]> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new Error(`Unknown workspace: ${workspaceId}`);
    return this.scanRoot(workspace.rootDir, workspace.options);
  }

  getRoot(workspaceId: string): string {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new Error(`Unknown workspace: ${workspaceId}`);
    return workspace.rootDir;
  }

  private async scanRoot(rootDir: string, options: WorkspaceScanOptions): Promise<WorkspaceFile[]> {
    const files: WorkspaceFile[] = [];
    const visit = async (directory: string): Promise<void> => {
      const entries = await readdir(directory, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        const absolutePath = join(directory, entry.name);
        const relativePath = normalizeRelative(relative(rootDir, absolutePath));
        if (matchesIgnore(relativePath, options.ignorePatterns ?? [])) continue;
        if (entry.isDirectory()) { await visit(absolutePath); continue; }
        if (!entry.isFile()) continue;
        const kind = kindForPath(absolutePath);
        if (!kind) continue;
        const fileStats = await lstat(absolutePath);
        const content = await readFile(absolutePath);
        files.push({ absolutePath, relativePath, kind, size: fileStats.size, modifiedAt: fileStats.mtimeMs, contentHash: hashContent(content) });
      }
    };
    await visit(rootDir);
    files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    return files;
  }
}

/** Kept as a stable helper for watcher tests and integrations that only need a one-off scan. */
export async function scanWorkspace(rootDir: string, options?: WorkspaceScanOptions): Promise<WorkspaceFile[]> {
  const service = new WorkspaceService();
  const workspace = await service.open(rootDir, options);
  return workspace.files;
}

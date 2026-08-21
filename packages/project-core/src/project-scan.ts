import { lstatSync, readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

const MAX_FILE_SIZE = 16 * 1024 * 1024;
const DEFAULT_IGNORED_DIRECTORIES = new Set(['.git', '.qt-ui-copilot', 'node_modules', 'build', 'out']);
const FONT_EXTENSIONS = new Set(['.ttf', '.ttc', '.otf', '.woff', '.woff2']);
const EXECUTABLE_EXTENSIONS = new Set(['.exe', '.com', '.bat', '.cmd', '.appimage']);

export interface ProjectInventory {
  rootDir: string;
  uiFiles: string[];
  qrcFiles: string[];
  qssFiles: string[];
  fontFiles: string[];
  cmakePresetFiles: string[];
  qmakeProjectFiles: string[];
  executableCandidates: string[];
}

export interface ProjectScanOptions {
  buildDirectories?: string[];
}

const isWithin = (root: string, candidate: string): boolean => {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

const isIgnoredDirectory = (name: string, ignored: Set<string>): boolean => ignored.has(name) || name.startsWith('cmake-build-');

export const scanProject = (rootDir: string, options: ProjectScanOptions = {}): ProjectInventory => {
  const root = path.resolve(rootDir);
  const realRoot = realpathSync(root);
  const ignored = new Set([...DEFAULT_IGNORED_DIRECTORIES, ...(options.buildDirectories ?? []).map((directory) => path.basename(directory))]);
  const inventory: ProjectInventory = {
    rootDir: root,
    uiFiles: [], qrcFiles: [], qssFiles: [], fontFiles: [], cmakePresetFiles: [], qmakeProjectFiles: [], executableCandidates: [],
  };

  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      let stats;
      try { stats = lstatSync(candidate); } catch { continue; }
      if (stats.isSymbolicLink()) continue;
      if (stats.isDirectory()) {
        if (!isIgnoredDirectory(entry.name, ignored)) visit(candidate);
        continue;
      }
      if (!stats.isFile() || stats.size > MAX_FILE_SIZE) continue;
      let realCandidate: string;
      try { realCandidate = realpathSync(candidate); } catch { continue; }
      if (!isWithin(realRoot, realCandidate)) continue;

      const extension = path.extname(entry.name).toLowerCase();
      if (extension === '.ui') inventory.uiFiles.push(candidate);
      else if (extension === '.qrc') inventory.qrcFiles.push(candidate);
      else if (extension === '.qss') inventory.qssFiles.push(candidate);
      else if (FONT_EXTENSIONS.has(extension)) inventory.fontFiles.push(candidate);
      else if (entry.name === 'CMakePresets.json' || entry.name === 'CMakeUserPresets.json') inventory.cmakePresetFiles.push(candidate);
      else if (extension === '.pro') inventory.qmakeProjectFiles.push(candidate);
      else if (EXECUTABLE_EXTENSIONS.has(extension) || (process.platform !== 'win32' && (statSync(candidate).mode & 0o111) !== 0)) inventory.executableCandidates.push(candidate);
    }
  };

  visit(root);
  for (const files of [inventory.uiFiles, inventory.qrcFiles, inventory.qssFiles, inventory.fontFiles, inventory.cmakePresetFiles, inventory.qmakeProjectFiles, inventory.executableCandidates]) files.sort();
  return inventory;
};

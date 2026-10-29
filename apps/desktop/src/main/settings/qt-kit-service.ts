import { existsSync, readdirSync } from 'node:fs';
import { join, normalize } from 'node:path';

export interface QtKit {
  id: string;
  displayName: string;
  version: string;
  qtMajor: 5 | 6;
  rootDir: string;
  binDirectory: string;
  uic: string;
  rcc: string;
  qmake?: string;
  cmakePrefixPath?: string;
  compilerAbi?: string;
  architecture?: string;
}

export interface QtToolHealth { name: 'uic' | 'rcc' | 'qmake' | 'cmake'; ok: boolean; path: string; version?: string; message?: string; }
export interface QtKitHealth { ok: boolean; checkedAt: number; tools: QtToolHealth[]; previewHost: { ok: boolean; cacheKey?: string; message?: string }; }

export interface QtKitFs {
  exists(path: string): boolean;
  directories(path: string): string[];
}

export interface QtKitRunner { (command: { executable: string; args: string[] }): Promise<{ exitCode: number; stdout: string; stderr: string }>; }

const defaultFs: QtKitFs = {
  exists: existsSync,
  directories: (path) => {
    try { return readdirSync(path, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => join(path, entry.name)); } catch { return []; }
  },
};

const executable = (bin: string, name: string): string => normalize(join(bin, process.platform === 'win32' ? `${name}.exe` : name));
const versionFrom = (text: string): string | undefined => text.match(/(\d+\.\d+(?:\.\d+)?)/)?.[1];

export class QtKitService {
  constructor(private readonly options: { roots: string[]; fileSystem?: QtKitFs; run?: QtKitRunner }) {}

  async scan(): Promise<QtKit[]> {
    const fs = this.options.fileSystem ?? defaultFs;
    const kits: QtKit[] = [];
    for (const root of this.options.roots) {
      const candidates = fs.directories(root).flatMap((versionDir) => fs.directories(versionDir).map((abiDir) => ({ versionDir, abiDir })));
      for (const candidate of candidates) {
        const version = candidate.versionDir.split(/[\\/]/).at(-1) ?? '';
        const major = Number(version.split('.')[0]);
        const binDirectory = join(candidate.abiDir, 'bin');
        if ((major !== 5 && major !== 6) || !fs.exists(executable(binDirectory, 'uic')) || !fs.exists(executable(binDirectory, 'rcc'))) continue;
        const id = `qt-${version}-${candidate.abiDir.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()}`;
        const compilerAbi = candidate.abiDir.split(/[\\/]/).at(-1) ?? '';
        const qmake = executable(binDirectory, 'qmake');
        const architecture = /(?:arm64|aarch64)/i.test(compilerAbi) ? 'arm64'
          : /(?:x86_64|amd64|_64$)/i.test(compilerAbi) ? 'x86_64'
            : /(?:x86|_32$)/i.test(compilerAbi) ? 'x86' : undefined;
        kits.push({
          id, displayName: `Qt ${version}`, version, qtMajor: major as 5 | 6,
          rootDir: candidate.abiDir, binDirectory,
          uic: executable(binDirectory, 'uic'), rcc: executable(binDirectory, 'rcc'),
          cmakePrefixPath: candidate.abiDir, compilerAbi,
          ...(fs.exists(qmake) ? { qmake } : {}),
          ...(architecture ? { architecture } : {}),
        });
      }
    }
    return kits;
  }

  async check(kit: QtKit): Promise<QtKitHealth> {
    const run = this.options.run ?? (async ({ executable, args }) => {
      const { execFile } = await import('node:child_process');
      return new Promise((resolve) => execFile(executable, args, { windowsHide: true }, (error, stdout, stderr) => resolve({ exitCode: error ? 1 : 0, stdout: String(stdout), stderr: String(stderr) })));
    });
    const checks = await Promise.all((['uic', 'rcc', 'qmake'] as const).filter((name) => Boolean(kit[name])).map(async (name) => {
      const path = kit[name]!;
      const result = await run({ executable: path, args: ['--version'] });
      const version = versionFrom(`${result.stdout}\n${result.stderr}`);
      return { name, ok: result.exitCode === 0, path, ...(version ? { version } : {}), ...(result.exitCode === 0 ? {} : { message: result.stderr || result.stdout || `exit code ${result.exitCode}` }) } satisfies QtToolHealth;
    }));
    const ok = checks.length >= 2 && checks.every((tool) => tool.ok);
    return { ok, checkedAt: Date.now(), tools: checks, previewHost: { ok, ...(ok ? { cacheKey: `${kit.version}|${kit.compilerAbi ?? 'unknown'}|${kit.architecture ?? process.arch}|${process.platform}` } : { message: 'PreviewHost requires healthy uic and rcc tools' }) } };
  }
}

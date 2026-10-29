import { existsSync } from 'node:fs';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectProfile } from '@qt-ui-copilot/contracts';
import { runProcess, type ProcessResult } from '@qt-ui-copilot/project-core';

export type QtBuildBackend = 'qmake' | 'msbuild' | 'auto';
export type QtBuildStage = 'detecting' | 'configuring' | 'compiling' | 'completed';
export interface QtBuildProgress { stage: QtBuildStage; command: string; detail?: string; }
export interface QtBuildInput {
  projectRoot: string;
  stagedRoot: string;
  backend: QtBuildBackend;
  qt: ProjectProfile['qt'];
  buildDirectory: string;
  signal?: AbortSignal;
  onProgress?: (event: QtBuildProgress) => void;
}
export interface QtBuildOutput { executable: string; buildDirectory: string; backend: 'qmake' | 'msbuild'; }
export type QtBuildRunner = (command: { executable: string; args: readonly string[]; cwd?: string; environment?: NodeJS.ProcessEnv; timeoutMs?: number; windowsVerbatimArguments?: boolean }) => Promise<ProcessResult>;

type QtTools = ProjectProfile['qt'] & { qmake?: string; msbuild?: string; make?: string; compilerAbi?: string };

const commandText = (executable: string, args: readonly string[]) => [executable, ...args].map((part) => /\s/.test(part) ? `"${part}"` : part).join(' ');
const abortError = () => Object.assign(new Error('Build cancelled'), { name: 'AbortError' });
const ensureNotAborted = (signal?: AbortSignal) => { if (signal?.aborted) throw abortError(); };

async function findFiles(root: string, extensions: readonly string[]): Promise<string[]> {
  if (!existsSync(root)) return [];
  const result: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === '.qt-ui-copilot' || entry.name === 'node_modules') continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (extensions.includes(path.extname(entry.name).toLowerCase())) result.push(absolute);
    }
  };
  await visit(root);
  return result.sort();
}

async function findExecutable(root: string): Promise<string | undefined> {
  const files = await findFiles(root, ['.exe']);
  return files.find((file) => !/qmake|jom|nmake|cmake|msbuild/i.test(path.basename(file))) ?? files[0];
}

export class QtBuildService {
  private readonly runner: QtBuildRunner;
  constructor(runner: QtBuildRunner = runProcess) { this.runner = runner; }

  async detectBackend(input: Pick<QtBuildInput, 'projectRoot' | 'stagedRoot' | 'backend'>): Promise<'qmake' | 'msbuild'> {
    if (input.backend !== 'auto') return input.backend;
    const roots = [input.stagedRoot, input.projectRoot];
    const [pro, visual] = await Promise.all([
      Promise.all(roots.map((root) => findFiles(root, ['.pro']))).then((items) => items.flat()),
      Promise.all(roots.map((root) => findFiles(root, ['.sln', '.vcxproj']))).then((items) => items.flat()),
    ]);
    const hasQmake = pro.length > 0;
    const hasMsbuild = visual.length > 0;
    if (hasQmake === hasMsbuild) throw new Error(hasQmake ? 'Build backend is ambiguous: both QMake and MSBuild projects were found' : 'Unable to detect build backend: no .pro, .sln, or .vcxproj file found');
    return hasQmake ? 'qmake' : 'msbuild';
  }

  async build(input: QtBuildInput): Promise<QtBuildOutput> {
    ensureNotAborted(input.signal);
    input.onProgress?.({ stage: 'detecting', command: 'detect backend' });
    const backend = await this.detectBackend(input);
    const buildDirectory = path.resolve(input.projectRoot, input.buildDirectory);
    await mkdir(buildDirectory, { recursive: true });
    const tools = input.qt as QtTools;
    const environment = await this.resolveBuildEnvironment(tools);
    const run = async (stage: QtBuildStage, executable: string, args: readonly string[], detail?: string) => {
      ensureNotAborted(input.signal);
      input.onProgress?.({ stage, command: commandText(executable, args), detail });
      const result = await this.runner({ executable, args, cwd: buildDirectory, environment, timeoutMs: 180_000 });
      if (result.timedOut || result.exitCode !== 0) {
        const output = (result.stderr || result.stdout || '').trim();
        throw new Error(`${stage} failed (${result.exitCode ?? 'timeout'}): ${output || commandText(executable, args)}`);
      }
      return result;
    };

    if (backend === 'qmake') {
      const pro = (await findFiles(input.stagedRoot, ['.pro']))[0] ?? (await findFiles(input.projectRoot, ['.pro']))[0];
      if (!pro) throw new Error('QMake project file (.pro) was not found');
      const qmake = tools.qmake || path.join(tools.binDirectory ?? '', process.platform === 'win32' ? 'qmake.exe' : 'qmake');
      if (!qmake || (!existsSync(qmake) && !tools.qmake)) throw new Error(`QMake executable was not found: ${qmake}`);
      await run('configuring', qmake, [pro]);
      const make = tools.make || await this.findMake(tools.binDirectory);
      await run('compiling', make, [], 'QMake generated build files');
    } else {
      let project = (await findFiles(input.stagedRoot, ['.sln', '.vcxproj']))[0] ?? (await findFiles(input.projectRoot, ['.sln', '.vcxproj']))[0];
      if (!project) {
        const pro = (await findFiles(input.stagedRoot, ['.pro']))[0] ?? (await findFiles(input.projectRoot, ['.pro']))[0];
        if (!pro) throw new Error('MSBuild project file (.sln or .vcxproj) was not found');
        const qmake = tools.qmake || path.join(tools.binDirectory ?? '', process.platform === 'win32' ? 'qmake.exe' : 'qmake');
        if (!qmake || (!existsSync(qmake) && !tools.qmake)) throw new Error(`QMake executable was not found for MSBuild project conversion: ${qmake}`);
        await run('configuring', qmake, ['-tp', 'vc', pro]);
        project = (await findFiles(input.stagedRoot, ['.sln', '.vcxproj']))[0] ?? (await findFiles(input.projectRoot, ['.sln', '.vcxproj']))[0];
        if (!project) throw new Error('QMake did not generate a Visual Studio project for MSBuild');
      }
      const msbuild = tools.msbuild || 'msbuild';
      await run('configuring', msbuild, [project, '/t:Restore', '/p:Configuration=Debug']);
      await run('compiling', msbuild, [project, '/m', '/p:Configuration=Debug', `/p:OutDir=${path.resolve(buildDirectory)}${path.sep}`]);
    }
    const executable = await findExecutable(buildDirectory);
    if (!executable) throw new Error(`Build completed but no executable was found in ${buildDirectory}`);
    input.onProgress?.({ stage: 'completed', command: executable, detail: `backend=${backend}` });
    return { executable, buildDirectory, backend };
  }

  private async findMake(binDirectory?: string): Promise<string> {
    const names = process.platform === 'win32' ? ['jom.exe', 'nmake.exe'] : ['make'];
    const absoluteCandidates = binDirectory ? [
      ...names.map((name) => path.join(binDirectory, name)),
      ...(process.platform === 'win32' ? [
        path.resolve(binDirectory, '..', '..', '..', 'Tools', 'QtCreator', 'bin', 'jom.exe'),
        path.resolve(binDirectory, '..', '..', '..', 'Tools', 'QtCreator', 'bin', 'jom', 'jom.exe'),
      ] : []),
    ] : [];
    const found = absoluteCandidates.find(existsSync);
    if (found) return found;
    // Let spawn resolve a developer-command-prompt installation from PATH.
    return names[0]!;
  }

  private async resolveBuildEnvironment(tools: QtTools): Promise<NodeJS.ProcessEnv | undefined> {
    if (process.platform !== 'win32' || !tools.compilerAbi?.toLowerCase().includes('msvc')) return undefined;
    const vswhere = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe';
    if (!existsSync(vswhere)) throw new Error('Visual Studio Build Tools was not found (vswhere.exe is missing)');
    const installation = await this.runner({ executable: vswhere, args: ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], timeoutMs: 30_000 });
    const installRoot = installation.stdout.trim().split(/\r?\n/).at(-1);
    if (installation.exitCode !== 0 || !installRoot) throw new Error('Visual Studio C++ Build Tools was not found');
    const vcvars = path.join(installRoot, 'VC', 'Auxiliary', 'Build', tools.compilerAbi.includes('64') ? 'vcvars64.bat' : 'vcvars32.bat');
    if (!existsSync(vcvars)) throw new Error(`MSVC environment script was not found: ${vcvars}`);
    const configured = await this.runner({ executable: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', `call "${vcvars}" >nul && set`], windowsVerbatimArguments: true, timeoutMs: 30_000 });
    if (configured.exitCode !== 0) throw new Error(`Unable to initialize the MSVC build environment: ${(configured.stderr || configured.stdout).trim()}`);
    const environment: NodeJS.ProcessEnv = { ...process.env };
    for (const line of configured.stdout.split(/\r?\n/)) {
      const separator = line.indexOf('=');
      if (separator > 0) environment[line.slice(0, separator)] = line.slice(separator + 1);
    }
    return environment;
  }
}

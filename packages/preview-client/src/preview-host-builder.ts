import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

export interface QtKit {
  qtVersion: string;
  compilerAbi: string;
  architecture: string;
  buildType: 'Debug' | 'Release';
  operatingSystem: string;
  cmakeExecutable: string;
  cmakePrefixPath: string;
  cmakeGenerator?: string;
  sourceDirectory: string;
  cacheDirectory: string;
  componentFactory?: string;
  componentSources?: string[];
  componentHeaders?: string[];
  componentIncludeDirs?: string[];
}

export function previewHostCacheKey(kit: QtKit, sourceFingerprint = 'source-unknown'): string {
  return createHash('sha256').update(JSON.stringify({
    qtVersion: kit.qtVersion,
    compilerAbi: kit.compilerAbi,
    architecture: kit.architecture,
    buildType: kit.buildType,
    operatingSystem: kit.operatingSystem,
    cmakeGenerator: kit.cmakeGenerator,
    sourceFingerprint,
    // CMake records the absolute source path in its cache and refuses to
    // reconfigure a build directory against a different one, so two installs
    // that ship byte-identical hosts must never share a build directory.
    sourceDirectory: kit.sourceDirectory,
    componentFactory: kit.componentFactory,
    componentSources: kit.componentSources,
    componentHeaders: kit.componentHeaders,
    componentIncludeDirs: kit.componentIncludeDirs,
  })).digest('hex').slice(0, 24);
}

/** Hashes the build inputs so a changed host can never reuse a stale binary. */
export async function previewHostSourceFingerprint(sourceDirectory: string): Promise<string> {
  const files = ['CMakeLists.txt'];
  const sourceRoot = path.join(sourceDirectory, 'src');
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push(path.relative(sourceDirectory, absolute).replaceAll('\\', '/'));
    }
  };
  await visit(sourceRoot);
  const hash = createHash('sha256');
  for (const relativePath of files.sort()) {
    hash.update(relativePath); hash.update('\0');
    hash.update(await readFile(path.join(sourceDirectory, relativePath))); hash.update('\0');
  }
  return hash.digest('hex');
}

function executableName(): string { return process.platform === 'win32' ? 'qt-ui-preview-host.exe' : 'qt-ui-preview-host'; }

async function execute(executable: string, args: string[], cwd: string, environment?: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { cwd, env: environment, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let errorOutput = ''; let standardOutput = '';
    child.stdout.on('data', (data: Buffer) => { standardOutput += data.toString('utf8'); });
    child.stderr.on('data', (data: Buffer) => { errorOutput += data.toString('utf8'); });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`PreviewHost build failed (${code}): ${(errorOutput || standardOutput).trim()}`)));
  });
}

/** Builds a binary per Kit. No cross-version PreviewHost artifact is ever reused. */
export class PreviewHostBuilder {
  async ensureBuilt(kit: QtKit): Promise<string> {
    const environment = await this.resolveMsvcEnvironment(kit.compilerAbi);
    if (process.platform === 'win32' && kit.compilerAbi.toLowerCase().includes('msvc') && !environment) {
      throw new Error(`PreviewHost 无法初始化 ${kit.compilerAbi} 的 MSVC 编译环境。请安装对应 Visual C++ Build Tools，或在 Qt Kit 中绑定可用的 MSVC 工具链。`);
    }
    const configuredGenerator = kit.cmakeGenerator;
    const generator = environment && (!configuredGenerator || /^Visual Studio\b/i.test(configuredGenerator)) ? 'NMake Makefiles' : configuredGenerator;
    const effectiveKit: QtKit = { ...kit, ...(generator ? { cmakeGenerator: generator } : {}) };
    const sourceFingerprint = await this.buildFingerprint(effectiveKit);
    const cacheKey = previewHostCacheKey(effectiveKit, sourceFingerprint);
    const requestedDirectory = path.join(effectiveKit.cacheDirectory, `preview-host-${cacheKey}`);
    // Visual Studio's AUTOGEN creates several nested .tlog paths.  Keep the
    // native build root short even when a project itself lives in a long temp
    // or monorepo path, otherwise a valid Qt kit produces a misleading build
    // failure on Windows.
    const buildDirectory = process.platform === 'win32' && requestedDirectory.length > 96
      ? path.join(tmpdir(), 'quic-preview', cacheKey)
      : requestedDirectory;
    const binary = path.join(buildDirectory, effectiveKit.buildType, executableName());
    try { await access(binary); return binary; } catch { /* configure below */ }
    await mkdir(buildDirectory, { recursive: true });
    const major = effectiveKit.qtVersion.split('.')[0];
    if (major !== '5' && major !== '6') throw new Error(`Unsupported Qt version for preview: ${effectiveKit.qtVersion}`);
    await execute(effectiveKit.cmakeExecutable, [
      '-S', effectiveKit.sourceDirectory, '-B', buildDirectory,
      ...(effectiveKit.cmakeGenerator ? ['-G', effectiveKit.cmakeGenerator] : []),
      `-DQT_MAJOR_VERSION=${major}`,
      `-DCMAKE_PREFIX_PATH=${effectiveKit.cmakePrefixPath}`,
      `-DCMAKE_BUILD_TYPE=${effectiveKit.buildType}`,
      ...(effectiveKit.componentFactory ? [`-DQT_UI_PREVIEW_COMPONENT_FACTORY=${effectiveKit.componentFactory}`] : []),
      ...(effectiveKit.componentSources?.length ? [`-DQT_UI_PREVIEW_COMPONENT_SOURCES=${effectiveKit.componentSources.join(';')}`] : []),
      ...(effectiveKit.componentHeaders?.length ? [`-DQT_UI_PREVIEW_COMPONENT_HEADERS=${effectiveKit.componentHeaders.join(';')}`] : []),
      ...(effectiveKit.componentIncludeDirs?.length ? [`-DQT_UI_PREVIEW_COMPONENT_INCLUDE_DIRS=${effectiveKit.componentIncludeDirs.join(';')}`] : []),
    ], buildDirectory, environment);
    await execute(effectiveKit.cmakeExecutable, ['--build', buildDirectory, '--config', effectiveKit.buildType, '--target', 'qt-ui-preview-host'], buildDirectory, environment);
    const alternatives = [binary, path.join(buildDirectory, executableName())];
    for (const candidate of alternatives) {
      try { await stat(candidate); return candidate; } catch { /* next */ }
    }
    throw new Error(`PreviewHost build completed but binary was not found in ${buildDirectory}`);
  }

  private async buildFingerprint(kit: QtKit): Promise<string> {
    const hostFingerprint = await previewHostSourceFingerprint(kit.sourceDirectory);
    const externalFiles = [kit.componentFactory, ...(kit.componentSources ?? []), ...(kit.componentHeaders ?? [])].filter((value): value is string => Boolean(value)).sort();
    if (!externalFiles.length) return hostFingerprint;
    const hash = createHash('sha256').update(hostFingerprint).update('\0');
    for (const file of externalFiles) {
      hash.update(file).update('\0');
      hash.update(await readFile(file)).update('\0');
    }
    return hash.digest('hex');
  }

  private async resolveMsvcEnvironment(compilerAbi: string): Promise<NodeJS.ProcessEnv | undefined> {
    if (process.platform !== 'win32' || !compilerAbi.toLowerCase().includes('msvc')) return undefined;
    const architecture = compilerAbi.includes('64') ? 'x64' : 'x86';
    const legacyVcvars = compilerAbi.includes('2015') ? [
      path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Microsoft Visual Studio 14.0', 'VC', 'vcvarsall.bat'),
      ...(process.env.VS140COMNTOOLS ? [path.join(process.env.VS140COMNTOOLS, '..', '..', 'VC', 'vcvarsall.bat')] : []),
    ] : [];
    const vswhere = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe';
    const legacy = legacyVcvars.find((candidate) => candidate && existsSync(candidate));
    let vcvars: string | undefined = legacy;
    let vcvarsArgs: string[] = legacy ? [architecture] : [];
    if (!vcvars && existsSync(vswhere)) {
      const installRoot = await new Promise<string | undefined>((resolve) => {
        const child = spawn(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
        let output = ''; child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); });
        child.once('error', () => resolve(undefined)); child.once('close', (code) => resolve(code === 0 ? output.trim().split(/\r?\n/).at(-1) : undefined));
      });
      if (installRoot) {
        const candidate = path.join(installRoot, 'VC', 'Auxiliary', 'Build', architecture === 'x64' ? 'vcvars64.bat' : 'vcvars32.bat');
        if (existsSync(candidate)) vcvars = candidate;
      }
    }
    if (!vcvars) return undefined;
    return new Promise<NodeJS.ProcessEnv | undefined>((resolve) => {
      const child = spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `call "${vcvars}" ${vcvarsArgs.join(' ')} >nul && set`], { windowsHide: true, windowsVerbatimArguments: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = ''; child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); });
      child.once('error', () => resolve(undefined)); child.once('close', (code) => {
        if (code !== 0) return resolve(undefined);
        const environment: NodeJS.ProcessEnv = { ...process.env };
        for (const line of output.split(/\r?\n/)) { const separator = line.indexOf('='); if (separator > 0) environment[line.slice(0, separator)] = line.slice(separator + 1); }
        resolve(environment);
      });
    });
  }
}

import { createHash } from 'node:crypto';
import { access, mkdir, stat } from 'node:fs/promises';
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
}

export function previewHostCacheKey(kit: QtKit): string {
  return createHash('sha256').update(JSON.stringify({
    qtVersion: kit.qtVersion,
    compilerAbi: kit.compilerAbi,
    architecture: kit.architecture,
    buildType: kit.buildType,
    operatingSystem: kit.operatingSystem,
  })).digest('hex').slice(0, 24);
}

function executableName(): string { return process.platform === 'win32' ? 'qt-ui-preview-host.exe' : 'qt-ui-preview-host'; }

async function execute(executable: string, args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
    const cacheKey = previewHostCacheKey(kit);
    const requestedDirectory = path.join(kit.cacheDirectory, `preview-host-${cacheKey}`);
    // Visual Studio's AUTOGEN creates several nested .tlog paths.  Keep the
    // native build root short even when a project itself lives in a long temp
    // or monorepo path, otherwise a valid Qt kit produces a misleading build
    // failure on Windows.
    const buildDirectory = process.platform === 'win32' && requestedDirectory.length > 96
      ? path.join(tmpdir(), 'quic-preview', cacheKey)
      : requestedDirectory;
    const binary = path.join(buildDirectory, kit.buildType, executableName());
    try { await access(binary); return binary; } catch { /* configure below */ }
    await mkdir(buildDirectory, { recursive: true });
    const major = kit.qtVersion.split('.')[0];
    if (major !== '5' && major !== '6') throw new Error(`Unsupported Qt version for preview: ${kit.qtVersion}`);
    await execute(kit.cmakeExecutable, [
      '-S', kit.sourceDirectory, '-B', buildDirectory,
      ...(kit.cmakeGenerator ? ['-G', kit.cmakeGenerator] : []),
      `-DQT_MAJOR_VERSION=${major}`,
      `-DCMAKE_PREFIX_PATH=${kit.cmakePrefixPath}`,
      `-DCMAKE_BUILD_TYPE=${kit.buildType}`,
    ], buildDirectory);
    await execute(kit.cmakeExecutable, ['--build', buildDirectory, '--config', kit.buildType, '--target', 'qt-ui-preview-host'], buildDirectory);
    const alternatives = [binary, path.join(buildDirectory, executableName())];
    for (const candidate of alternatives) {
      try { await stat(candidate); return candidate; } catch { /* next */ }
    }
    throw new Error(`PreviewHost build completed but binary was not found in ${buildDirectory}`);
  }
}

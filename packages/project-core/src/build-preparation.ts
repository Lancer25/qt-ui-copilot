import { existsSync } from 'node:fs';
import path from 'node:path';
import type { ProjectProfile } from '@qt-ui-copilot/contracts';
import { runProcess, type ProcessResult, type ProcessRunner } from './process-runner.js';

export interface BuildPreparationResult {
  configured: boolean;
  buildDirectory?: string;
  configureResult?: ProcessResult;
}

/**
 * Finds the build directory from a normal CMake --build/-B argv list. This
 * intentionally does not parse shell strings: project commands are always
 * stored and executed as argv.
 */
export function inferBuildDirectory(args: readonly string[], rootDir: string): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const candidate = arg === '--build' || arg === '-B'
      ? args[index + 1]
      : arg.startsWith('--build=') ? arg.slice('--build='.length)
        : arg.startsWith('-B') && arg.length > 2 ? arg.slice(2) : undefined;
    if (candidate && !candidate.startsWith('-')) {
      return path.normalize(path.isAbsolute(candidate) ? candidate : path.resolve(rootDir, candidate));
    }
  }
  return undefined;
}

/** Runs a configured CMake/qmake configure command only when its inferred
 * build directory does not exist. A missing configure command remains valid
 * for projects that provide an already-configured build tree. */
export async function prepareBuild(profile: ProjectProfile, runner: ProcessRunner = runProcess): Promise<BuildPreparationResult> {
  const buildDirectory = inferBuildDirectory(profile.build.command.args, profile.rootDir);
  const needsConfigure = Boolean(profile.build.configure && (!buildDirectory || !existsSync(buildDirectory)));
  if (!needsConfigure || !profile.build.configure) return { configured: false, buildDirectory };
  const configureResult = await runner({
    executable: profile.build.configure.executable,
    args: profile.build.configure.args,
    cwd: profile.rootDir,
    timeoutMs: 120_000,
  });
  return { configured: true, buildDirectory, configureResult };
}

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ProjectProfile } from '@qt-ui-copilot/contracts';
import { runProcess, type ProcessResult, type ProcessRunner } from './process-runner.js';

export interface QtMajorMinor { major: number; minor: number; }

export interface ToolReport {
  executable: string;
  result: ProcessResult;
  version?: QtMajorMinor;
}

export interface ToolchainReport {
  configuredVersion: QtMajorMinor;
  uic: ToolReport;
  rcc: ToolReport;
  compatible: boolean;
}

export interface ValidationResult extends ProcessResult {
  outputPath: string;
  valid: boolean;
}

export function parseQtMajorMinor(output: string): QtMajorMinor | undefined {
  const match = /(?:version\s+)?(\d+)\.(\d+)(?:\.\d+)?/i.exec(output);
  return match ? { major: Number(match[1]), minor: Number(match[2]) } : undefined;
}

function configuredVersion(version: string): QtMajorMinor {
  const parsed = parseQtMajorMinor(version);
  if (!parsed) throw new Error(`Configured Qt version "${version}" has no major/minor version`);
  return parsed;
}

function isContained(rootDir: string, candidate: string): boolean {
  const root = path.resolve(rootDir);
  const target = path.resolve(candidate);
  return target === root || target.startsWith(`${root}${path.sep}`);
}

export async function probeQtToolchain(profile: ProjectProfile, runner: ProcessRunner = runProcess): Promise<ToolchainReport> {
  const expected = configuredVersion(profile.qt.version);
  const [uicResult, rccResult] = await Promise.all([
    runner({ executable: profile.qt.uic, args: ['--version'] }),
    runner({ executable: profile.qt.rcc, args: ['--version'] }),
  ]);
  const uic: ToolReport = { executable: profile.qt.uic, result: uicResult, version: parseQtMajorMinor(`${uicResult.stdout}\n${uicResult.stderr}`) };
  const rcc: ToolReport = { executable: profile.qt.rcc, result: rccResult, version: parseQtMajorMinor(`${rccResult.stdout}\n${rccResult.stderr}`) };
  const compatible = [uic, rcc].every((tool) => tool.result.exitCode === 0 && !tool.result.timedOut
    && tool.version?.major === expected.major && tool.version?.minor === expected.minor);
  return { configuredVersion: expected, uic, rcc, compatible };
}

/** Validates a project-owned .ui file with the exact uic declared by that project. */
export async function validateUiWithUic(profile: ProjectProfile, uiPath: string, runner: ProcessRunner = runProcess): Promise<ValidationResult> {
  if (!isContained(profile.rootDir, uiPath)) throw new Error(`UI validation target escapes project root: ${uiPath}`);
  const validationDirectory = await mkdtemp(path.join(tmpdir(), 'qt-ui-copilot-uic-'));
  const outputPath = path.join(validationDirectory, 'ui_validation.h');
  try {
    const result = await runner({
      executable: profile.qt.uic,
      args: ['-o', outputPath, path.resolve(uiPath)],
      cwd: profile.rootDir,
    });
    return { ...result, outputPath, valid: result.exitCode === 0 && !result.timedOut };
  } finally {
    // uic output is only a validation artifact. Do not leave generated headers
    // in the source tree or a path that a build can accidentally pick up.
    await rm(validationDirectory, { recursive: true, force: true });
  }
}

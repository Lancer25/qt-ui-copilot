import { spawn } from 'node:child_process';

export interface ProcessCommand {
  executable: string;
  args: readonly string[];
  cwd?: string;
  environment?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  windowsVerbatimArguments?: boolean;
}

export interface ProcessResult {
  executable: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

export type ProcessRunner = (command: ProcessCommand) => Promise<ProcessResult>;

/** Executes argv directly. This module never accepts, constructs, or enables shell strings. */
export const runProcess: ProcessRunner = (command) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command.executable, [...command.args], {
      cwd: command.cwd,
      env: command.environment,
      shell: false,
      windowsHide: true,
      windowsVerbatimArguments: command.windowsVerbatimArguments,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, command.timeoutMs ?? 30_000);
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr?.on('data', (chunk: string) => { stderr += chunk; });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (exitCode) => {
      clearTimeout(timeout);
      resolve({ executable: command.executable, args: [...command.args], stdout, stderr, exitCode, timedOut });
    });
  });
};

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
export type WorkspaceGitDecoration = 'git_modified' | 'git_untracked';
export class WorkspaceDecorationService {
  async git(rootDir: string): Promise<Map<string, WorkspaceGitDecoration>> {
    const result = new Map<string, WorkspaceGitDecoration>();
    try { const output = (await execFileAsync('git', ['-C', rootDir, 'status', '--porcelain=v1', '-z'], { windowsHide: true, maxBuffer: 2_000_000 })).stdout; const entries = output.split('\0').filter(Boolean); for (const entry of entries) { const status = entry.slice(0, 2); const path = entry.slice(3).replaceAll('\\', '/'); result.set(path, status === '??' ? 'git_untracked' : 'git_modified'); } } catch { /* not a git repository or git is unavailable */ }
    return result;
  }
}

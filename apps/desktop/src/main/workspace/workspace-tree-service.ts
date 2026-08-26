import { readdir, stat } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import type { WorkspaceTreeNode, WorkspaceTreeSnapshot } from '@qt-ui-copilot/contracts';
import type { WorkspaceService, WorkspaceFileKind } from './workspace-service';

export class WorkspaceTreeService {
  constructor(private readonly workspace: WorkspaceService) {}
  async build(workspaceId: string, options: { showInternal?: boolean } = {}): Promise<WorkspaceTreeSnapshot> {
    const rootDir = this.workspace.getRoot(workspaceId); const files = await this.workspace.listFiles(workspaceId); const fileMap = new Map(files.map((file) => [file.relativePath.replaceAll('\\', '/'), file]));
    const build = async (directory: string, relDir: string): Promise<WorkspaceTreeNode[]> => { const entries = await readdir(directory, { withFileTypes: true }); const nodes: WorkspaceTreeNode[] = []; for (const entry of entries) { const rel = `${relDir ? `${relDir}/` : ''}${entry.name}`; if (!options.showInternal && (rel === '.git' || rel.startsWith('.git/') || rel.startsWith('.qt-ui-copilot/candidates/') || rel.startsWith('.qt-ui-copilot/preview-cache/') || rel.startsWith('.qt-ui-copilot/tasks/') || rel === '.qt-ui-copilot/project.json')) continue; const absolute = join(directory, entry.name); if (entry.isDirectory()) nodes.push({ id: `${workspaceId}:${rel}`, workspaceId, name: entry.name, relativePath: rel, kind: 'directory', children: await build(absolute, rel), decorations: [] }); else if (entry.isFile() && fileMap.has(rel)) { const file = fileMap.get(rel)!; nodes.push({ id: `${workspaceId}:${rel}`, workspaceId, name: entry.name, relativePath: rel, kind: 'file', fileKind: file.kind as WorkspaceFileKind, size: file.size, modifiedAt: file.modifiedAt, decorations: [] }); } } return nodes.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1)); };
    const info = await stat(rootDir); return { workspaceId, root: { id: workspaceId, workspaceId, name: basename(rootDir), relativePath: '.', kind: 'directory', children: await build(rootDir, ''), decorations: [] }, generatedAt: info.mtimeMs || Date.now() };
  }
}

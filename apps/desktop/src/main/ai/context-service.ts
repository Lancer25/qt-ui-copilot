import { readFile } from 'node:fs/promises';
import type { WorkspaceFile } from '../workspace/workspace-service';

export type ContextMode = 'focused_ui' | 'whole_project';
export interface FocusedContext { mode: 'focused_ui'; uiFile: string; uiContent: string; relatedFiles: Array<{ path: string; kind: string; content?: string }>; componentCandidates: unknown[]; }
export interface WholeProjectContext { mode: 'whole_project'; query: string; files: Array<{ path: string; kind: string; excerpt: string }>; }
export interface FileReadRequest { id: string; path: string; reason: string; approved: boolean; }

export class ContextService {
  private readonly pendingReads = new Map<string, FileReadRequest>();
  constructor(private readonly read: (path: string) => Promise<string> = (path) => readFile(path, 'utf8')) {}

  async buildFocusedUiContext(uiFile: WorkspaceFile, files: WorkspaceFile[], componentCandidates: unknown[] = []): Promise<FocusedContext> {
    const uiContent = await this.read(uiFile.absolutePath);
    const base = uiFile.relativePath.replace(/[^/\\]+$/, '').replace(/[\\]$/, '');
    const related = files.filter((file) => file.kind === 'qss' || file.kind === 'qrc' || file.relativePath.startsWith(base)).slice(0, 12);
    return { mode: 'focused_ui', uiFile: uiFile.relativePath, uiContent, relatedFiles: await Promise.all(related.map(async (file) => ({ path: file.relativePath, kind: file.kind, content: file.kind === 'qss' || file.kind === 'qrc' ? await this.read(file.absolutePath) : undefined }))), componentCandidates };
  }

  async searchWholeProject(query: string, files: WorkspaceFile[], limit = 20): Promise<WholeProjectContext> {
    const needle = query.trim().toLowerCase(); const matches: WholeProjectContext['files'] = [];
    for (const file of files.filter((item) => ['source', 'header', 'cmake', 'qss', 'qrc', 'ui', 'other'].includes(item.kind))) {
      if (matches.length >= limit) break;
      const content = await this.read(file.absolutePath); const index = content.toLowerCase().indexOf(needle); if (needle && index < 0 && !file.relativePath.toLowerCase().includes(needle)) continue;
      const start = Math.max(0, index < 0 ? 0 : index - 160); matches.push({ path: file.relativePath, kind: file.kind, excerpt: content.slice(start, start + 420) });
    }
    return { mode: 'whole_project', query, files: matches };
  }

  requestRelatedFileRead(path: string, reason: string): FileReadRequest { const request = { id: `read-${Date.now()}-${Math.random().toString(16).slice(2)}`, path, reason, approved: false }; this.pendingReads.set(request.id, request); return request; }
  approveFileRead(id: string): FileReadRequest { const request = this.pendingReads.get(id); if (!request) throw new Error('Unknown file read request'); request.approved = true; return request; }
  async readApprovedFile(requestId: string): Promise<string> { const request = this.pendingReads.get(requestId); if (!request?.approved) throw new Error('File read requires user approval'); return this.read(request.path); }
}

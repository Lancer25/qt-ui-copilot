import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import type { UiOperation } from '@qt-ui-copilot/contracts';

export interface RevisionValidation { xml: boolean; semantic: boolean; uic: boolean; preview: boolean; findings: Array<{ severity: 'info' | 'warning' | 'error'; code: string; message: string }>; validatedAt: number; }
export interface RevisionServiceDependencies { apply(source: string, operations: UiOperation[], filePath: string): string; validate(candidate: string, filePath: string): Promise<RevisionValidation>; }
export interface RevisionResult { id: string; uiFile: string; conversationId: string; operations: UiOperation[]; beforeHash: string; afterHash: string; validation: RevisionValidation; }
const hash = (source: string): string => createHash('sha256').update(source).digest('hex');

export class RevisionService {
  private readonly history = new Map<string, { before: string; after: string; position: 0 | 1 }>();
  constructor(private readonly dependencies: RevisionServiceDependencies) {}
  async apply(uiFile: string, operations: UiOperation[], conversationId: string): Promise<RevisionResult> {
    const before = await readFile(uiFile, 'utf8'); const candidate = this.dependencies.apply(before, operations, uiFile); const validation = await this.dependencies.validate(candidate, uiFile);
    if (!validation.xml || !validation.semantic || !validation.uic || !validation.preview || validation.findings.some((finding) => finding.severity === 'error')) throw new Error('Revision validation failed; source file was not changed');
    await writeFile(uiFile, candidate, 'utf8'); this.history.set(uiFile, { before, after: candidate, position: 1 }); return { id: randomUUID(), uiFile, conversationId, operations, beforeHash: hash(before), afterHash: hash(candidate), validation };
  }
  async undo(uiFile: string): Promise<void> { const entry = this.history.get(uiFile); if (!entry) throw new Error('No revision to undo'); const current = await readFile(uiFile, 'utf8'); if (entry.position === 1 && hash(current) !== hash(entry.after)) throw new Error('External change detected; rebase before undo'); await writeFile(uiFile, entry.before, 'utf8'); entry.position = 0; }
  async redo(uiFile: string): Promise<void> { const entry = this.history.get(uiFile); if (!entry) throw new Error('No revision to redo'); const current = await readFile(uiFile, 'utf8'); if (entry.position === 0 && hash(current) !== hash(entry.before)) throw new Error('External change detected; rebase before redo'); await writeFile(uiFile, entry.after, 'utf8'); entry.position = 1; }
  async rebaseAfterExternalChange(uiFile: string): Promise<void> { const entry = this.history.get(uiFile); if (!entry) throw new Error('No revision to rebase'); const current = await readFile(uiFile, 'utf8'); entry.before = current; entry.position = 0; }
}

import type {
  ConversationRecord,
  ConversationMessage,
  PreviewProfile,
  UiEditorSession,
  UiRevision,
  WorkspaceSummary,
} from '@qt-ui-copilot/contracts';
import {
  ConversationRecordSchema,
  PreviewProfileSchema,
  UiEditorSessionSchema,
  UiRevisionSchema,
  WorkspaceSummarySchema,
} from '@qt-ui-copilot/contracts';
import { z } from 'zod';
import type { Database } from './database.js';

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.string(), z.number().finite(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(z.string(), JsonValueSchema),
]));
const PreferencesSchema = z.record(z.string(), JsonValueSchema);
export type V3Preferences = z.infer<typeof PreferencesSchema>;

const encoded = (value: unknown): string => JSON.stringify(JsonValueSchema.parse(value));
const decoded = (value: string): unknown => JsonValueSchema.parse(JSON.parse(value));
const asBoolean = (value: number): boolean => value === 1;

export class V3Repository {
  public constructor(private readonly database: Database) {}

  public saveWorkspace(input: WorkspaceSummary): WorkspaceSummary {
    const record = WorkspaceSummarySchema.parse(input);
    this.database.prepare(`
      INSERT INTO v3_workspaces (id, name, root_dir, file_count, last_opened_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, root_dir = excluded.root_dir,
        file_count = excluded.file_count, last_opened_at = excluded.last_opened_at, updated_at = excluded.updated_at
    `).run(record.id, record.name, record.rootDir, record.fileCount, record.lastOpenedAt, record.createdAt, record.updatedAt);
    return record;
  }

  public upsertWorkspace(input: WorkspaceSummary): WorkspaceSummary { return this.saveWorkspace(input); }

  public getWorkspace(id: string): WorkspaceSummary | undefined {
    const row = this.database.prepare('SELECT id, name, root_dir, file_count, last_opened_at, created_at, updated_at FROM v3_workspaces WHERE id = ?').get(id) as {
      id: string; name: string; root_dir: string; file_count: number; last_opened_at: number; created_at: number; updated_at: number;
    } | undefined;
    return row && WorkspaceSummarySchema.parse({ id: row.id, name: row.name, rootDir: row.root_dir, fileCount: row.file_count, lastOpenedAt: row.last_opened_at, createdAt: row.created_at, updatedAt: row.updated_at });
  }

  public getWorkspaceByRoot(rootDir: string): WorkspaceSummary | undefined {
    const row = this.database.prepare('SELECT id FROM v3_workspaces WHERE root_dir = ?').get(rootDir) as { id: string } | undefined;
    return row ? this.getWorkspace(row.id) : undefined;
  }

  public listWorkspaces(): WorkspaceSummary[] {
    const rows = this.database.prepare('SELECT id, name, root_dir, file_count, last_opened_at, created_at, updated_at FROM v3_workspaces ORDER BY last_opened_at DESC, id').all() as Array<{
      id: string; name: string; root_dir: string; file_count: number; last_opened_at: number; created_at: number; updated_at: number;
    }>;
    return rows.map((row) => WorkspaceSummarySchema.parse({ id: row.id, name: row.name, rootDir: row.root_dir, fileCount: row.file_count, lastOpenedAt: row.last_opened_at, createdAt: row.created_at, updatedAt: row.updated_at }));
  }

  public deleteWorkspace(id: string): void { this.database.prepare('DELETE FROM v3_workspaces WHERE id = ?').run(id); }

  public saveEditorSession(input: UiEditorSession): UiEditorSession {
    const record = UiEditorSessionSchema.parse(input);
    this.database.prepare(`
      INSERT INTO v3_editor_sessions (id, workspace_id, file_path, preview_json, conversation_id, dirty, baseline_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET workspace_id = excluded.workspace_id, file_path = excluded.file_path,
        preview_json = excluded.preview_json, conversation_id = excluded.conversation_id, dirty = excluded.dirty,
        baseline_hash = excluded.baseline_hash, updated_at = excluded.updated_at
    `).run(record.id, record.workspaceId ?? null, record.filePath, encoded(record.preview), record.conversationId, record.dirty ? 1 : 0, record.baselineHash ?? null, record.createdAt, record.updatedAt);
    return record;
  }

  public getEditorSession(idOrFilePath: string, workspaceId?: string): UiEditorSession | undefined {
    const row = workspaceId
      ? this.database.prepare('SELECT id, workspace_id, file_path, preview_json, conversation_id, dirty, baseline_hash, created_at, updated_at FROM v3_editor_sessions WHERE workspace_id = ? AND file_path = ?').get(workspaceId, idOrFilePath)
      : this.database.prepare('SELECT id, workspace_id, file_path, preview_json, conversation_id, dirty, baseline_hash, created_at, updated_at FROM v3_editor_sessions WHERE id = ?').get(idOrFilePath);
    const typed = row as { id: string; workspace_id: string | null; file_path: string; preview_json: string; conversation_id: string; dirty: number; baseline_hash: string | null; created_at: number; updated_at: number } | undefined;
    return typed && UiEditorSessionSchema.parse({ id: typed.id, ...(typed.workspace_id ? { workspaceId: typed.workspace_id } : {}), filePath: typed.file_path, preview: PreviewProfileSchema.parse(decoded(typed.preview_json)), conversationId: typed.conversation_id, dirty: asBoolean(typed.dirty), ...(typed.baseline_hash ? { baselineHash: typed.baseline_hash } : {}), createdAt: typed.created_at, updatedAt: typed.updated_at });
  }

  public listEditorSessions(workspaceId?: string): UiEditorSession[] {
    const rows = workspaceId
      ? this.database.prepare('SELECT id, workspace_id, file_path, preview_json, conversation_id, dirty, baseline_hash, created_at, updated_at FROM v3_editor_sessions WHERE workspace_id = ? ORDER BY updated_at DESC, id').all(workspaceId)
      : this.database.prepare('SELECT id, workspace_id, file_path, preview_json, conversation_id, dirty, baseline_hash, created_at, updated_at FROM v3_editor_sessions ORDER BY updated_at DESC, id').all();
    return (rows as Array<{ id: string; workspace_id: string | null; file_path: string; preview_json: string; conversation_id: string; dirty: number; baseline_hash: string | null; created_at: number; updated_at: number }>).map((row) => UiEditorSessionSchema.parse({ id: row.id, ...(row.workspace_id ? { workspaceId: row.workspace_id } : {}), filePath: row.file_path, preview: PreviewProfileSchema.parse(decoded(row.preview_json)), conversationId: row.conversation_id, dirty: asBoolean(row.dirty), ...(row.baseline_hash ? { baselineHash: row.baseline_hash } : {}), createdAt: row.created_at, updatedAt: row.updated_at }));
  }

  public deleteEditorSession(id: string): void { this.database.prepare('DELETE FROM v3_editor_sessions WHERE id = ?').run(id); }

  public saveConversation(input: ConversationRecord): ConversationRecord {
    const record = ConversationRecordSchema.parse(input);
    this.database.prepare(`
      INSERT INTO v3_conversations (id, ui_file, context_mode, apply_mode, title, messages_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET ui_file = excluded.ui_file, context_mode = excluded.context_mode,
        apply_mode = excluded.apply_mode, title = excluded.title, messages_json = excluded.messages_json, updated_at = excluded.updated_at
    `).run(record.id, record.uiFile, record.contextMode, record.applyMode, record.title ?? null, encoded(record.messages), record.createdAt, record.updatedAt);
    return record;
  }

  public getConversation(id: string): ConversationRecord | undefined {
    const row = this.database.prepare('SELECT id, ui_file, context_mode, apply_mode, title, messages_json, created_at, updated_at FROM v3_conversations WHERE id = ?').get(id) as { id: string; ui_file: string; context_mode: string; apply_mode: string; title: string | null; messages_json: string; created_at: number; updated_at: number } | undefined;
    return row && ConversationRecordSchema.parse({ id: row.id, uiFile: row.ui_file, contextMode: row.context_mode, applyMode: row.apply_mode, ...(row.title ? { title: row.title } : {}), messages: decoded(row.messages_json), createdAt: row.created_at, updatedAt: row.updated_at });
  }

  public listConversations(uiFile?: string): ConversationRecord[] {
    const rows = uiFile
      ? this.database.prepare('SELECT id, ui_file, context_mode, apply_mode, title, messages_json, created_at, updated_at FROM v3_conversations WHERE ui_file = ? ORDER BY updated_at DESC, id').all(uiFile)
      : this.database.prepare('SELECT id, ui_file, context_mode, apply_mode, title, messages_json, created_at, updated_at FROM v3_conversations ORDER BY updated_at DESC, id').all();
    return (rows as Array<{ id: string; ui_file: string; context_mode: string; apply_mode: string; title: string | null; messages_json: string; created_at: number; updated_at: number }>).map((row) => ConversationRecordSchema.parse({ id: row.id, uiFile: row.ui_file, contextMode: row.context_mode, applyMode: row.apply_mode, ...(row.title ? { title: row.title } : {}), messages: decoded(row.messages_json), createdAt: row.created_at, updatedAt: row.updated_at }));
  }

  public appendConversationMessage(id: string, message: ConversationMessage): ConversationRecord {
    const conversation = this.getConversation(id);
    if (!conversation) throw new Error(`Conversation not found: ${id}`);
    const parsedMessage = z.object({ id: z.string().min(1), role: z.enum(['user', 'assistant', 'system', 'tool']), content: z.string(), createdAt: z.number().finite() }).strict().parse(message);
    return this.saveConversation({ ...conversation, messages: [...conversation.messages, parsedMessage], updatedAt: Date.now() });
  }

  public deleteConversation(id: string): void { this.database.prepare('DELETE FROM v3_conversations WHERE id = ?').run(id); }

  public saveRevision(input: UiRevision): UiRevision {
    const record = UiRevisionSchema.parse(input);
    this.database.prepare(`
      INSERT INTO v3_revisions (id, ui_file, parent_id, conversation_id, operations_json, before_hash, after_hash, validation_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET ui_file = excluded.ui_file, parent_id = excluded.parent_id,
        conversation_id = excluded.conversation_id, operations_json = excluded.operations_json, before_hash = excluded.before_hash,
        after_hash = excluded.after_hash, validation_json = excluded.validation_json
    `).run(record.id, record.uiFile, record.parentId ?? null, record.conversationId, encoded(record.operations), record.beforeHash, record.afterHash, encoded(record.validation), record.createdAt);
    return record;
  }

  public getRevision(id: string): UiRevision | undefined {
    const row = this.database.prepare('SELECT id, ui_file, parent_id, conversation_id, operations_json, before_hash, after_hash, validation_json, created_at FROM v3_revisions WHERE id = ?').get(id) as { id: string; ui_file: string; parent_id: string | null; conversation_id: string; operations_json: string; before_hash: string; after_hash: string; validation_json: string; created_at: number } | undefined;
    return row && UiRevisionSchema.parse({ id: row.id, uiFile: row.ui_file, ...(row.parent_id ? { parentId: row.parent_id } : {}), conversationId: row.conversation_id, operations: decoded(row.operations_json), beforeHash: row.before_hash, afterHash: row.after_hash, validation: decoded(row.validation_json), createdAt: row.created_at });
  }

  public listRevisions(uiFile?: string): UiRevision[] {
    const rows = uiFile
      ? this.database.prepare('SELECT id, ui_file, parent_id, conversation_id, operations_json, before_hash, after_hash, validation_json, created_at FROM v3_revisions WHERE ui_file = ? ORDER BY created_at, id').all(uiFile)
      : this.database.prepare('SELECT id, ui_file, parent_id, conversation_id, operations_json, before_hash, after_hash, validation_json, created_at FROM v3_revisions ORDER BY created_at, id').all();
    return (rows as Array<{ id: string; ui_file: string; parent_id: string | null; conversation_id: string; operations_json: string; before_hash: string; after_hash: string; validation_json: string; created_at: number }>).map((row) => UiRevisionSchema.parse({ id: row.id, uiFile: row.ui_file, ...(row.parent_id ? { parentId: row.parent_id } : {}), conversationId: row.conversation_id, operations: decoded(row.operations_json), beforeHash: row.before_hash, afterHash: row.after_hash, validation: decoded(row.validation_json), createdAt: row.created_at }));
  }

  public deleteRevision(id: string): void { this.database.prepare('DELETE FROM v3_revisions WHERE id = ?').run(id); }

  public savePreferences(input: V3Preferences): V3Preferences {
    const preferences = PreferencesSchema.parse(input);
    this.database.prepare('INSERT INTO v3_preferences (id, preferences_json, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET preferences_json = excluded.preferences_json, updated_at = excluded.updated_at').run(encoded(preferences), Date.now());
    return preferences;
  }

  public getPreferences(): V3Preferences {
    const row = this.database.prepare('SELECT preferences_json FROM v3_preferences WHERE id = 1').get() as { preferences_json: string } | undefined;
    return row ? PreferencesSchema.parse(decoded(row.preferences_json)) : {};
  }
}

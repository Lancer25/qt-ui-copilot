import { randomUUID } from 'node:crypto';
import type { WorkflowEvent } from '@qt-ui-copilot/contracts';
import { z } from 'zod';
import type { Database } from './database.js';

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.string(), z.number().finite(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(z.string(), JsonValueSchema),
]));

const TaskEventSchema = z.object({
  node: z.string().min(1),
  status: z.enum(['started', 'completed', 'failed', 'cancelled']),
  at: z.number().finite(),
  payload: JsonValueSchema.optional(),
}).strict();

export type TaskEvent = z.infer<typeof TaskEventSchema>;
export type PersistedWorkflowEvent = TaskEvent | WorkflowEvent;

export interface StoredTask {
  id: string;
  projectId: string;
  targetUi: string;
  createdAt: number;
  updatedAt: number;
}

export interface StoredArtifact {
  id: number;
  taskId: string;
  kind: string;
  relativePath: string;
  metadata: unknown;
  createdAt: number;
}

export interface StoredModelSettings {
  baseUrl: string;
  model: string;
  /** Opaque ciphertext created by Electron safeStorage, never plaintext. */
  encryptedApiKey?: Buffer;
  updatedAt: number;
}

export const SAFE_RESUME_NODES = new Set([
  'IMPORT_PROJECT', 'SELECT_UI', 'CAPTURE_BASELINE', 'RETRIEVE_COMPONENTS', 'UNDERSTAND_REQUIREMENT',
  'GENERATE_UI_PLAN', 'USER_APPROVAL', 'XML_VALIDATE', 'UIC_VALIDATE', 'ENHANCED_PREVIEW',
  'DETERMINISTIC_CHECKS', 'VISUAL_REVIEW', 'INCREMENTAL_BUILD', 'LAUNCH_ISOLATED_EXE',
  'NAVIGATE_TO_TARGET', 'PROBE_VERIFY_PAGE', 'CAPTURE_REAL_RESULT', 'FINAL_CHECKS', 'REPORT',
  'ACCEPT_OR_ROLLBACK',
]);

const toMilliseconds = (value: number | string): number => typeof value === 'number' ? value : Date.parse(value);

const json = (value: unknown): string => JSON.stringify(JsonValueSchema.parse(value));

const parseJson = (value: string): unknown => JsonValueSchema.parse(JSON.parse(value));

const normalizeEvent = (event: PersistedWorkflowEvent): TaskEvent => {
  if ('node' in event && 'status' in event) return TaskEventSchema.parse(event);

  switch (event.type) {
    case 'transitioned':
      return { node: event.node, status: 'completed', at: toMilliseconds(event.at), payload: event };
    case 'started':
      return { node: 'IMPORT_PROJECT', status: 'started', at: toMilliseconds(event.at), payload: event };
    case 'failed':
      return { node: 'FAILED', status: 'failed', at: toMilliseconds(event.at), payload: event };
    case 'cancelled':
      return { node: 'CANCELLED', status: 'cancelled', at: toMilliseconds(event.at), payload: event };
  }

  throw new Error('Unsupported workflow event');
};

export class TaskRepository {
  public constructor(private readonly database: Database) {}

  public upsertProject(project: { id: string; rootDir: string; profilePath?: string; profile?: unknown }): void {
    const now = Date.now();
    this.database.prepare(`
      INSERT INTO projects (id, root_dir, profile_path, profile_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET root_dir = excluded.root_dir, profile_path = excluded.profile_path,
        profile_json = excluded.profile_json, updated_at = excluded.updated_at
    `).run(project.id, project.rootDir, project.profilePath ?? null, project.profile === undefined ? null : json(project.profile), now, now);
  }

  public createTask(projectId: string, targetUi: string): string {
    const now = Date.now();
    this.database.prepare(`
      INSERT OR IGNORE INTO projects (id, root_dir, profile_path, profile_json, created_at, updated_at)
      VALUES (?, ?, NULL, NULL, ?, ?)
    `).run(projectId, '', now, now);
    const id = randomUUID();
    this.database.prepare('INSERT INTO tasks (id, project_id, target_ui, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, projectId, targetUi, now, now);
    return id;
  }

  public getTask(id: string): StoredTask | undefined {
    const row = this.database.prepare('SELECT id, project_id, target_ui, created_at, updated_at FROM tasks WHERE id = ?').get(id) as {
      id: string; project_id: string; target_ui: string; created_at: number; updated_at: number;
    } | undefined;
    return row && { id: row.id, projectId: row.project_id, targetUi: row.target_ui, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  public appendEvent(taskId: string, event: PersistedWorkflowEvent): void {
    const normalized = normalizeEvent(event);
    this.database.prepare('INSERT INTO workflow_events (task_id, node, status, occurred_at, payload_json) VALUES (?, ?, ?, ?, ?)')
      .run(taskId, normalized.node, normalized.status, normalized.at, json(normalized.payload ?? {}));
    this.database.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run(Date.now(), taskId);
  }

  public listEvents(taskId: string): TaskEvent[] {
    const rows = this.database.prepare('SELECT node, status, occurred_at, payload_json FROM workflow_events WHERE task_id = ? ORDER BY id').all(taskId) as Array<{
      node: string; status: TaskEvent['status']; occurred_at: number; payload_json: string;
    }>;
    return rows.map((row) => TaskEventSchema.parse({ node: row.node, status: row.status, at: row.occurred_at, payload: parseJson(row.payload_json) }));
  }

  public resumePoint(taskId: string): string | undefined {
    return [...this.listEvents(taskId)].reverse().find((event) => event.status === 'completed' && SAFE_RESUME_NODES.has(event.node))?.node;
  }

  public addArtifact(taskId: string, artifact: { kind: string; relativePath: string; metadata?: unknown }): void {
    const now = Date.now();
    this.database.prepare(`
      INSERT INTO artifacts (task_id, kind, relative_path, metadata_json, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(task_id, relative_path) DO UPDATE SET kind = excluded.kind, metadata_json = excluded.metadata_json, created_at = excluded.created_at
    `).run(taskId, artifact.kind, artifact.relativePath, json(artifact.metadata ?? {}), now);
  }

  public listArtifacts(taskId: string): StoredArtifact[] {
    const rows = this.database.prepare('SELECT id, task_id, kind, relative_path, metadata_json, created_at FROM artifacts WHERE task_id = ? ORDER BY id').all(taskId) as Array<{
      id: number; task_id: string; kind: string; relative_path: string; metadata_json: string; created_at: number;
    }>;
    return rows.map((row) => ({ id: row.id, taskId: row.task_id, kind: row.kind, relativePath: row.relative_path, metadata: parseJson(row.metadata_json), createdAt: row.created_at }));
  }

  public saveUiBinding(projectId: string, uiFile: string, runtimeKey: string, binding: unknown): void {
    this.database.prepare(`
      INSERT INTO ui_bindings (project_id, ui_file, runtime_key, binding_json, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(project_id, ui_file, runtime_key) DO UPDATE SET binding_json = excluded.binding_json, updated_at = excluded.updated_at
    `).run(projectId, uiFile, runtimeKey, json(binding), Date.now());
  }

  public getUiBinding(projectId: string, uiFile: string, runtimeKey: string): unknown | undefined {
    const row = this.database.prepare('SELECT binding_json FROM ui_bindings WHERE project_id = ? AND ui_file = ? AND runtime_key = ?')
      .get(projectId, uiFile, runtimeKey) as { binding_json: string } | undefined;
    return row && parseJson(row.binding_json);
  }

  public saveRoute(projectId: string, routeId: string, route: unknown): void {
    this.database.prepare(`
      INSERT INTO routes (project_id, route_id, route_json, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(project_id, route_id) DO UPDATE SET route_json = excluded.route_json, updated_at = excluded.updated_at
    `).run(projectId, routeId, json(route), Date.now());
  }

  public getRoute(projectId: string, routeId: string): unknown | undefined {
    const row = this.database.prepare('SELECT route_json FROM routes WHERE project_id = ? AND route_id = ?')
      .get(projectId, routeId) as { route_json: string } | undefined;
    return row && parseJson(row.route_json);
  }

  public saveModelSettings(settings: { baseUrl: string; model: string; encryptedApiKey?: Buffer }): void {
    this.database.prepare(`
      INSERT INTO model_settings (id, base_url, model, encrypted_api_key, updated_at)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET base_url = excluded.base_url, model = excluded.model,
        encrypted_api_key = COALESCE(excluded.encrypted_api_key, model_settings.encrypted_api_key), updated_at = excluded.updated_at
    `).run(settings.baseUrl, settings.model, settings.encryptedApiKey ?? null, Date.now());
  }

  public getModelSettings(): StoredModelSettings | undefined {
    const row = this.database.prepare(
      'SELECT base_url, model, encrypted_api_key, updated_at FROM model_settings WHERE id = 1',
    ).get() as { base_url: string; model: string; encrypted_api_key: Buffer | Uint8Array | null; updated_at: number } | undefined;
    if (!row) return undefined;
    return {
      baseUrl: row.base_url,
      model: row.model,
      ...(row.encrypted_api_key ? { encryptedApiKey: Buffer.from(row.encrypted_api_key) } : {}),
      updatedAt: row.updated_at,
    };
  }
}

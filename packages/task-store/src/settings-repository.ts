import { z } from 'zod';
import type { Database } from './database.js';

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.string(), z.number().finite(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(z.string(), JsonValueSchema),
]));

export const QtKitRecordSchema = z.object({ id: z.string().min(1), displayName: z.string().min(1), config: z.record(z.string(), JsonValueSchema), health: z.record(z.string(), JsonValueSchema).optional(), checkedAt: z.number().finite().optional(), updatedAt: z.number().finite() }).strict();
export type QtKitRecord = z.infer<typeof QtKitRecordSchema>;

export const ProjectBindingRecordSchema = z.object({ projectId: z.string().min(1), qtKitId: z.string().min(1), config: z.record(z.string(), JsonValueSchema), updatedAt: z.number().finite() }).strict();
export type ProjectBindingRecord = z.infer<typeof ProjectBindingRecordSchema>;

export const UiPreferencesSchema = z.record(z.string(), JsonValueSchema);
export type UiPreferences = z.infer<typeof UiPreferencesSchema>;

const encoded = (value: unknown): string => JSON.stringify(JsonValueSchema.parse(value));
const decoded = (value: string): unknown => JsonValueSchema.parse(JSON.parse(value));

export class SettingsRepository {
  constructor(private readonly database: Database) {}

  saveQtKit(input: Omit<QtKitRecord, 'updatedAt'> & { updatedAt?: number }): QtKitRecord {
    const updatedAt = input.updatedAt ?? Date.now();
    const record = { ...input, updatedAt };
    QtKitRecordSchema.parse(record);
    this.database.prepare(`INSERT INTO qt_kits (id, display_name, config_json, health_json, checked_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, config_json = excluded.config_json,
        health_json = excluded.health_json, checked_at = excluded.checked_at, updated_at = excluded.updated_at`).run(
      record.id, record.displayName, encoded(record.config), record.health ? encoded(record.health) : null, record.checkedAt ?? null, updatedAt,
    );
    return record;
  }

  listQtKits(): QtKitRecord[] {
    const rows = this.database.prepare('SELECT id, display_name, config_json, health_json, checked_at, updated_at FROM qt_kits ORDER BY display_name, id').all() as Array<{ id: string; display_name: string; config_json: string; health_json: string | null; checked_at: number | null; updated_at: number }>;
    return rows.map((row) => QtKitRecordSchema.parse({ id: row.id, displayName: row.display_name, config: decoded(row.config_json), ...(row.health_json ? { health: decoded(row.health_json) } : {}), ...(row.checked_at === null ? {} : { checkedAt: row.checked_at }), updatedAt: row.updated_at }));
  }

  getQtKit(id: string): QtKitRecord | undefined { return this.listQtKits().find((kit) => kit.id === id); }

  deleteQtKit(id: string): void {
    const references = this.database.prepare('SELECT COUNT(*) AS count FROM project_bindings WHERE qt_kit_id = ?').get(id) as { count: number };
    if (references.count > 0) throw new Error(`Cannot delete Qt Kit: ${references.count} project(s) reference it`);
    this.database.prepare('DELETE FROM qt_kits WHERE id = ?').run(id);
  }

  saveProjectBinding(input: Omit<ProjectBindingRecord, 'updatedAt'> & { updatedAt?: number }): ProjectBindingRecord {
    const updatedAt = input.updatedAt ?? Date.now();
    const record = { ...input, updatedAt };
    ProjectBindingRecordSchema.parse(record);
    this.database.prepare(`INSERT INTO project_bindings (project_id, qt_kit_id, config_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET qt_kit_id = excluded.qt_kit_id, config_json = excluded.config_json, updated_at = excluded.updated_at`).run(
      record.projectId, record.qtKitId, encoded(record.config), updatedAt,
    );
    return record;
  }

  getProjectBinding(projectId: string): ProjectBindingRecord | undefined {
    const row = this.database.prepare('SELECT project_id, qt_kit_id, config_json, updated_at FROM project_bindings WHERE project_id = ?').get(projectId) as { project_id: string; qt_kit_id: string; config_json: string; updated_at: number } | undefined;
    return row && ProjectBindingRecordSchema.parse({ projectId: row.project_id, qtKitId: row.qt_kit_id, config: decoded(row.config_json), updatedAt: row.updated_at });
  }

  saveUiPreferences(preferences: UiPreferences): UiPreferences { const parsed = UiPreferencesSchema.parse(preferences); this.database.prepare(`INSERT INTO ui_preferences (id, preferences_json, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET preferences_json = excluded.preferences_json, updated_at = excluded.updated_at`).run(encoded(parsed), Date.now()); return parsed; }
  getUiPreferences(): UiPreferences { const row = this.database.prepare('SELECT preferences_json FROM ui_preferences WHERE id = 1').get() as { preferences_json: string } | undefined; return row ? UiPreferencesSchema.parse(decoded(row.preferences_json)) : {}; }
}

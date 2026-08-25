export const DATABASE_SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    root_dir TEXT NOT NULL,
    profile_path TEXT,
    profile_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    target_ui TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS workflow_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    node TEXT NOT NULL,
    status TEXT NOT NULL,
    occurred_at INTEGER NOT NULL,
    payload_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(task_id, relative_path)
  );

  CREATE TABLE IF NOT EXISTS ui_bindings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    ui_file TEXT NOT NULL,
    runtime_key TEXT NOT NULL,
    binding_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(project_id, ui_file, runtime_key)
  );

  CREATE TABLE IF NOT EXISTS routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    route_id TEXT NOT NULL,
    route_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(project_id, route_id)
  );

  -- A singleton row for non-secret model configuration.  The API key, when
  -- present, is an opaque Electron safeStorage ciphertext; plaintext must
  -- never be written to this database.
  CREATE TABLE IF NOT EXISTS model_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    base_url TEXT NOT NULL,
    model TEXT NOT NULL,
    encrypted_api_key BLOB,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS qt_kits (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    config_json TEXT NOT NULL,
    health_json TEXT,
    checked_at INTEGER,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_bindings (
    project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    qt_kit_id TEXT NOT NULL REFERENCES qt_kits(id) ON DELETE RESTRICT,
    config_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ui_preferences (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    preferences_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- V3 IDE state is intentionally kept separate from the V2 task/report
  -- tables. JSON columns are validated by V3Repository on every read/write.
  CREATE TABLE IF NOT EXISTS v3_workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    root_dir TEXT NOT NULL UNIQUE,
    file_count INTEGER NOT NULL DEFAULT 0,
    profile_json TEXT,
    last_opened_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS v3_editor_sessions (
    id TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES v3_workspaces(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    preview_json TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    dirty INTEGER NOT NULL DEFAULT 0 CHECK (dirty IN (0, 1)),
    baseline_hash TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(workspace_id, file_path)
  );

  CREATE TABLE IF NOT EXISTS v3_conversations (
    id TEXT PRIMARY KEY,
    ui_file TEXT NOT NULL,
    context_mode TEXT NOT NULL,
    apply_mode TEXT NOT NULL,
    title TEXT,
    messages_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS v3_revisions (
    id TEXT PRIMARY KEY,
    ui_file TEXT NOT NULL,
    parent_id TEXT REFERENCES v3_revisions(id) ON DELETE SET NULL,
    conversation_id TEXT NOT NULL,
    operations_json TEXT NOT NULL,
    before_hash TEXT NOT NULL,
    after_hash TEXT NOT NULL,
    validation_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS v3_preferences (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    preferences_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;

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
`;

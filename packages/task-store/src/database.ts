import { DatabaseSync } from 'node:sqlite';
import { DATABASE_SCHEMA } from './schema.js';

export type Database = DatabaseSync;

export const openDatabase = (databasePath: string): Database => {
  const database = new DatabaseSync(databasePath);
  database.exec(DATABASE_SCHEMA);
  try { database.exec("ALTER TABLE model_settings ADD COLUMN image_payload_mode TEXT NOT NULL DEFAULT 'base64_data_url'"); } catch { /* existing databases already migrated */ }
  return database;
};

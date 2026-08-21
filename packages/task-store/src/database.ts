import { DatabaseSync } from 'node:sqlite';
import { DATABASE_SCHEMA } from './schema.js';

export type Database = DatabaseSync;

export const openDatabase = (databasePath: string): Database => {
  const database = new DatabaseSync(databasePath);
  database.exec(DATABASE_SCHEMA);
  return database;
};

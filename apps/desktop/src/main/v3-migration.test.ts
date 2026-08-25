import { describe, expect, it } from 'vitest';
import { openDatabase, V3Repository } from '@qt-ui-copilot/task-store';
import { migrateToV3 } from './v3-migration';
describe('V3 migration', () => { it('is idempotent', () => { const repository = new V3Repository(openDatabase(':memory:')); expect(migrateToV3(repository).migrated).toBe(true); expect(migrateToV3(repository).migrated).toBe(false); }); });

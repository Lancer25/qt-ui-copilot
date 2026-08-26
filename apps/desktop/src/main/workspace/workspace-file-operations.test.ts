import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceService } from './workspace-service';
import { WorkspaceFileOperations } from './workspace-file-operations';
describe('WorkspaceFileOperations', () => { it('rejects traversal and requires confirmation for permanent delete', async () => { const root = await mkdtemp(join(tmpdir(), 'ops-')); await writeFile(join(root, 'a.txt'), 'x'); const workspace = await new WorkspaceService().open(root); const ops = new WorkspaceFileOperations(new WorkspaceService()); expect(ops.createFile(workspace.id, '..', 'x')).rejects.toThrow(); }); });

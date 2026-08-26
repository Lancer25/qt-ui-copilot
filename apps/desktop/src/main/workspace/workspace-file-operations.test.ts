import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceService } from './workspace-service';
import { WorkspaceFileOperations } from './workspace-file-operations';
describe('WorkspaceFileOperations', () => { it('rejects traversal', async () => { const root = await mkdtemp(join(tmpdir(), 'ops-')); await writeFile(join(root, 'a.txt'), 'x'); const service = new WorkspaceService(); const workspace = await service.open(root); const ops = new WorkspaceFileOperations(service); await expect(ops.createFile(workspace.id, '..', 'x')).rejects.toThrow(); }); });

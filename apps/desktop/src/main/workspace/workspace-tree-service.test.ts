import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceService } from './workspace-service';
import { WorkspaceTreeService } from './workspace-tree-service';
describe('WorkspaceTreeService', () => { it('builds stable nested tree and hides tool internals', async () => { const root = await mkdtemp(join(tmpdir(), 'tree-')); await mkdir(join(root, 'ui')); await mkdir(join(root, '.qt-ui-copilot', 'candidates'), { recursive: true }); await writeFile(join(root, 'ui', 'Main.ui'), '<ui/>'); await writeFile(join(root, '.qt-ui-copilot', 'candidates', 'temp.ui'), '<ui/>'); const service = new WorkspaceService(); const workspace = await service.open(root); const tree = await new WorkspaceTreeService(service).build(workspace.id); expect(tree.root.children?.map((item) => item.name)).toEqual(['ui']); expect(tree.root.children?.[0].children?.[0].name).toBe('Main.ui'); }); });

import { mkdtemp, mkdir, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkspaceService } from './workspace-service';
import { WorkspaceWatcher } from './workspace-watcher';

describe('WorkspaceWatcher', () => {
  it('emits created, changed, deleted and renamed events with hashes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qt-ui-copilot-watcher-'));
    await mkdir(join(root, 'ui'));
    const source = join(root, 'ui', 'Settings.ui');
    await writeFile(source, '<ui/>');
    const service = new WorkspaceService();
    const workspace = await service.open(root);
    const watcher = new WorkspaceWatcher(service, workspace.id);
    const events: Array<{ type: string; path: string; oldPath?: string }> = [];
    watcher.on('change', (event) => events.push({ type: event.type, path: event.path, ...('oldPath' in event ? { oldPath: event.oldPath } : {}) }));
    await watcher.start();
    const created = join(root, 'ui', 'Login.ui');
    await writeFile(created, '<ui/>');
    await watcher.refresh();
    await writeFile(source, '<ui><widget/></ui>');
    await watcher.refresh();
    await rename(created, join(root, 'ui', 'Dialog.ui'));
    await watcher.refresh();
    await import('node:fs/promises').then(({ unlink }) => unlink(source));
    await watcher.refresh();
    watcher.stop();
    expect(events.map((event) => event.type)).toEqual(['created', 'changed', 'renamed', 'deleted']);
    expect(events[2].oldPath).toBe(created);
  });

  it('suppresses a matching app-owned write', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qt-ui-copilot-watcher-'));
    const source = join(root, 'MainWindow.ui');
    await writeFile(source, '<ui/>');
    const service = new WorkspaceService();
    const workspace = await service.open(root);
    const watcher = new WorkspaceWatcher(service, workspace.id);
    const events: unknown[] = [];
    watcher.on('change', (event) => events.push(event));
    await watcher.start();
    await writeFile(source, '<ui><widget/></ui>');
    const files = await service.listFiles(workspace.id);
    watcher.expectAppWrite(source, files[0].contentHash);
    await watcher.refresh();
    watcher.stop();
    expect(events).toHaveLength(0);
  });
});

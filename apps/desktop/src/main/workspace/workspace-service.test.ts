import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkspaceService } from './workspace-service';

const fixture = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'qt-ui-copilot-workspace-'));
  await mkdir(join(root, 'resources'));
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'ui'));
  await mkdir(join(root, 'build'));
  await mkdir(join(root, '.git'));
  await writeFile(join(root, 'resources', 'common.qrc'), '<RCC/>');
  await writeFile(join(root, 'resources', 'dark.qss'), 'QWidget { color: white; }');
  await writeFile(join(root, 'src', 'MainWindow.cpp'), 'int main() {}');
  await writeFile(join(root, 'src', 'MainWindow.h'), '#pragma once');
  await writeFile(join(root, 'ui', 'MainWindow.ui'), '<ui version="4.0"/>');
  await writeFile(join(root, 'build', 'ignored.ui'), '<ui/>');
  await writeFile(join(root, '.git', 'ignored.cpp'), 'ignored');
  return root;
};

describe('WorkspaceService', () => {
  it('indexes ui, qss, qrc and source files while excluding build and git directories', async () => {
    const service = new WorkspaceService();
    const workspace = await service.open(await fixture());
    expect(workspace.files.map((file) => file.relativePath)).toEqual([
      'resources/common.qrc', 'resources/dark.qss', 'src/MainWindow.cpp', 'src/MainWindow.h', 'ui/MainWindow.ui',
    ]);
    expect(workspace.files.some((file) => file.relativePath.includes('build/'))).toBe(false);
    expect(workspace.files.every((file) => file.contentHash.length === 64)).toBe(true);
  });

  it('supports configured ignore patterns and deterministic workspace identity', async () => {
    const root = await fixture();
    await mkdir(join(root, 'generated'));
    await writeFile(join(root, 'generated', 'generated.ui'), '<ui/>');
    const service = new WorkspaceService();
    const first = await service.open(root, { ignorePatterns: ['generated'] });
    const second = await service.open(root, { ignorePatterns: ['generated'] });
    expect(first.id).toBe(second.id);
    expect(first.files.some((file) => file.relativePath.startsWith('generated/'))).toBe(false);
  });
  it('only permits Settings to write the project profile', async () => {
    const root = await fixture(); await mkdir(join(root, '.qt-ui-copilot')); await writeFile(join(root, '.qt-ui-copilot', 'project.json'), '{"id":"demo"}');
    const service = new WorkspaceService(); const workspace = await service.open(root);
    await service.writeText(workspace.id, '.qt-ui-copilot/project.json', '{"id":"updated"}');
    await expect(service.readText(workspace.id, '.qt-ui-copilot/project.json')).resolves.toBe('{"id":"updated"}');
    await expect(service.writeText(workspace.id, 'src/MainWindow.cpp', 'bad')).rejects.toThrow('Only the workspace project profile');
  });
});

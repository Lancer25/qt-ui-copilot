import { access, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkspaceService, matchPortableQtKit } from './workspace-service';

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
  await mkdir(join(root, '.qt-ui-copilot', 'candidates'), { recursive: true });
  await writeFile(join(root, '.qt-ui-copilot', 'candidates', 'draft.ui'), '<ui/>');
  return root;
};

describe('WorkspaceService', () => {
  it('matches a portable Qt fingerprint only to an exact local Kit', () => {
    const profile = { qt: { version: '5.9.6', qtMajor: 5, compilerAbi: 'msvc2015_64', architecture: 'x86_64' } };
    const matching = { id: 'current-device-kit', version: '5.9.6', qtMajor: 5 as const, compilerAbi: 'msvc2015_64', architecture: 'x86_64' };
    const wrongVersion = { ...matching, id: 'different-patch', version: '5.9.7' };
    const wrongAbi = { ...matching, id: 'different-abi', compilerAbi: 'msvc2019_64' };

    expect(matchPortableQtKit(profile, [wrongVersion, wrongAbi, matching])).toEqual({ status: 'matched', kit: matching });
  });

  it('keeps a portable workspace usable when no local Kit matches', () => {
    const profile = { qt: { version: '5.9.6', qtMajor: 5, compilerAbi: 'msvc2015_64', architecture: 'x86_64' } };
    const localOnly = { id: 'qt6', version: '6.8.3', qtMajor: 6 as const, compilerAbi: 'msvc2022_64', architecture: 'x86_64' };

    expect(matchPortableQtKit(profile, [localOnly])).toEqual({ status: 'binding_required' });
  });
  it('opens a fresh workspace without creating internal configuration', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qt-ui-copilot-empty-workspace-'));
    const workspace = await new WorkspaceService().open(root);

    await expect(access(join(root, '.qt-ui-copilot'))).rejects.toThrow();
    expect(workspace.fileCount).toBe(0);
  });

  it('indexes project files while excluding build, git and internal candidate directories', async () => {
    const service = new WorkspaceService();
    const workspace = await service.open(await fixture());
    expect(workspace.files.map((file) => file.relativePath)).toEqual([
      'resources/common.qrc', 'resources/dark.qss', 'src/MainWindow.cpp', 'src/MainWindow.h', 'ui/MainWindow.ui',
    ]);
    expect(workspace.files.some((file) => file.relativePath.includes('build/'))).toBe(false);
    expect(workspace.files.some((file) => file.relativePath.includes('.qt-ui-copilot/'))).toBe(false);
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
    const root = await fixture(); await writeFile(join(root, '.qt-ui-copilot', 'project.json'), '{"id":"demo"}');
    const service = new WorkspaceService(); const workspace = await service.open(root);
    await service.writeText(workspace.id, '.qt-ui-copilot/project.json', '{"id":"updated"}');
    await expect(service.readText(workspace.id, '.qt-ui-copilot/project.json')).resolves.toBe('{"id":"updated"}');
    await expect(service.writeText(workspace.id, 'src/MainWindow.cpp', 'bad')).rejects.toThrow('Only the workspace project profile');
  });

  it('atomically synchronizes a portable project profile without local Qt tool paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qt-ui-copilot-profile-sync-'));
    const service = new WorkspaceService();
    const workspace = await service.open(root);

    await service.syncProjectProfile(workspace.id, {
      id: 'portable-demo',
      qt: { version: '5.9.6', qtMajor: 5, compilerAbi: 'msvc2015_64', architecture: 'x86_64' },
      build: { backend: 'qmake', directory: '.qt-ui-copilot/build' },
      run: { executable: '.qt-ui-copilot/build/portable-demo.exe' },
      preview: { width: 960, height: 640, locale: 'zh_CN', style: 'Fusion', highDpiMode: 'project-default' },
    });

    const saved = JSON.parse(await readFile(join(root, '.qt-ui-copilot', 'project.json'), 'utf8')) as Record<string, unknown>;
    expect(saved).toMatchObject({ id: 'portable-demo', qt: { version: '5.9.6', qtMajor: 5, compilerAbi: 'msvc2015_64', architecture: 'x86_64' }, build: { backend: 'qmake', directory: '.qt-ui-copilot/build' } });
    expect(JSON.stringify(saved)).not.toMatch(/"(?:uic|rcc|binDirectory|cmake|rootDir)"/);
    await expect(access(join(root, '.qt-ui-copilot', 'project.json.tmp'))).rejects.toThrow();
  });

  it('rejects device-specific Qt tools and absolute project paths during profile sync', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qt-ui-copilot-profile-reject-'));
    const service = new WorkspaceService();
    const workspace = await service.open(root);

    await expect(service.syncProjectProfile('unknown', { id: 'demo', qt: { version: '6.0', compilerAbi: 'msvc', architecture: 'x86_64' }, build: { backend: 'auto' } })).rejects.toThrow('Unknown workspace');
    await expect(service.syncProjectProfile(workspace.id, {
      id: 'demo', qt: { version: '6.0', compilerAbi: 'msvc', architecture: 'x86_64', uic: 'C:/Qt/bin/uic.exe' }, build: { backend: 'auto' },
    } as unknown as Parameters<WorkspaceService['syncProjectProfile']>[1])).rejects.toThrow('可移植');
    await expect(service.syncProjectProfile(workspace.id, {
      id: 'demo', qt: { version: '6.0', compilerAbi: 'msvc', architecture: 'x86_64' }, build: { backend: 'auto', directory: 'C:/build' },
    })).rejects.toThrow('相对');
  });
});

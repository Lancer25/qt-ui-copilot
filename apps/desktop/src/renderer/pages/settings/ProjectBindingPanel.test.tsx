// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopApi, QtKit, WorkspaceSummary } from '../../lib/api';
import { ProjectBindingPanel } from './ProjectBindingPanel';

const kit: QtKit = {
  id: 'qt-6', displayName: 'Qt 6.8 MSVC', version: '6.8.3', qtMajor: 6,
  rootDir: 'D:/Qt/6.8.3/msvc2022_64', binDirectory: 'D:/Qt/6.8.3/msvc2022_64/bin',
  uic: 'D:/Qt/6.8.3/msvc2022_64/bin/uic.exe', rcc: 'D:/Qt/6.8.3/msvc2022_64/bin/rcc.exe',
  compilerAbi: 'msvc2022_64', architecture: 'x86_64',
};

const workspace: WorkspaceSummary = { id: 'workspace-opened', name: 'opened', rootDir: 'D:/opened', fileCount: 0, lastOpenedAt: 1, createdAt: 1, updatedAt: 1, files: [] };

function makeApi(options: { sync?: ReturnType<typeof vi.fn> } = {}): DesktopApi {
  const projects = [
    { id: 'old-project', rootDir: 'D:/old', uiFiles: [], updatedAt: 1, health: 'ready' as const },
    { id: 'opened-project', rootDir: 'D:/opened/', uiFiles: [], updatedAt: 2, health: 'ready' as const },
  ];
  return {
    projects: { list: vi.fn(async () => projects), import: vi.fn(async () => projects[1]), chooseDirectory: vi.fn(async () => undefined) },
    settings: {
      getModel: vi.fn(), configureModel: vi.fn(), testModel: vi.fn(), testModelCapability: vi.fn(),
      getProjectBinding: vi.fn(async () => undefined), saveProjectBinding: vi.fn(async (binding) => binding), checkProjectBinding: vi.fn(async () => ({ ok: true, blocking: [] })),
      qtKits: { list: vi.fn(async () => [kit]), scan: vi.fn(), check: vi.fn(), save: vi.fn(), delete: vi.fn() },
    },
    workspace: {
      open: vi.fn(), listFiles: vi.fn(), readText: vi.fn(), writeText: vi.fn(), syncProjectProfile: options.sync ?? vi.fn(async () => undefined), onChange: vi.fn(), tree: vi.fn(), createFile: vi.fn(), createDirectory: vi.fn(), renameEntry: vi.fn(), trashEntry: vi.fn(), deleteEntryPermanently: vi.fn(),
    },
  } as unknown as DesktopApi;
}

describe('ProjectBindingPanel', () => {
  afterEach(cleanup);

  it('selects the opened workspace, saves locally without writing project.json, then explicitly synchronizes a portable profile', async () => {
    const api = makeApi();
    const user = userEvent.setup();
    render(<ProjectBindingPanel api={api} workspace={workspace} />);
    expect(await screen.findByDisplayValue('D:/opened/')).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText('Qt Kit') as HTMLSelectElement).value).toBe('qt-6'));
    await user.click(screen.getByRole('button', { name: '保存本机绑定' }));
    await waitFor(() => expect(api.settings.saveProjectBinding).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'opened-project', qtKitId: 'qt-6' })));
    expect(api.workspace?.readText).not.toHaveBeenCalled();
    expect(api.workspace?.writeText).not.toHaveBeenCalled();
    expect(screen.getByText(/项目目录尚未写入/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '同步到项目' }));
    await waitFor(() => expect(api.workspace?.syncProjectProfile).toHaveBeenCalledWith('workspace-opened', {
      id: 'opened-project', qt: { version: '6.8.3', qtMajor: 6, compilerAbi: 'msvc2022_64', architecture: 'x86_64' },
      build: { backend: 'auto', directory: '.qt-ui-copilot/build' }, run: { executable: '.qt-ui-copilot/build/Debug/opened-project.exe' },
    }));
  });

  it('keeps the local binding valid when the optional project sync cannot write', async () => {
    const sync = vi.fn(async () => { throw new Error('EACCES'); });
    const api = makeApi({ sync });
    const user = userEvent.setup();
    render(<ProjectBindingPanel api={api} workspace={workspace} />);
    await screen.findByDisplayValue('D:/opened/');
    await waitFor(() => expect((screen.getByLabelText('Qt Kit') as HTMLSelectElement).value).toBe('qt-6'));
    await user.click(screen.getByRole('button', { name: '保存本机绑定' }));
    await waitFor(() => expect(api.settings.saveProjectBinding).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: '同步到项目' }));
    expect(await screen.findByText('本机绑定已保存，但同步到项目失败。请检查项目目录写入权限后重试。')).toBeTruthy();
  });

  it('matches a portable project fingerprint to a compatible local Kit instead of using old tool paths', async () => {
    const matchingWorkspace = { ...workspace, profile: { qt: { version: '6.8.3', qtMajor: 6, compilerAbi: 'msvc2022_64', architecture: 'x86_64' } } };
    const otherKit = { ...kit, id: 'qt-5', displayName: 'Qt 5', version: '5.15.2', qtMajor: 5 as const, compilerAbi: 'msvc2019_64' };
    const api = makeApi();
    api.settings.qtKits!.list = vi.fn(async () => [otherKit, kit]);
    render(<ProjectBindingPanel api={api} workspace={matchingWorkspace} />);
    await waitFor(() => expect((screen.getByLabelText('Qt Kit') as HTMLSelectElement).value).toBe('qt-6'));
    expect(screen.queryByText(/需要绑定本机 Qt Kit/)).toBeNull();
  });

  it('keeps a workspace usable and asks for a local Kit when no portable fingerprint matches', async () => {
    const unmatchedWorkspace = { ...workspace, profile: { qt: { version: '6.8.3', qtMajor: 6, compilerAbi: 'mingw_64', architecture: 'x86_64' } } };
    const api = makeApi();
    render(<ProjectBindingPanel api={api} workspace={unmatchedWorkspace} />);
    expect(await screen.findByText('项目需要绑定本机 Qt Kit；旧设备的工具路径不会被复用。')).toBeTruthy();
    expect((screen.getByLabelText('Qt Kit') as HTMLSelectElement).value).toBe('');
  });
});

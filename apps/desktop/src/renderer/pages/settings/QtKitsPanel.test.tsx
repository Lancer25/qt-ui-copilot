// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DesktopApi } from '../../lib/api';
import { QtKitsPanel } from './QtKitsPanel';

describe('QtKitsPanel', () => {
  it('manually saves a project Qt Kit with derived tool paths', async () => {
    const save = vi.fn(async (kit) => kit);
    const api = { settings: { qtKits: { list: vi.fn(async () => []), scan: vi.fn(async () => []), save, check: vi.fn(), delete: vi.fn() } }, projects: { chooseDirectory: vi.fn() } } as unknown as DesktopApi;
    const user = userEvent.setup(); render(<QtKitsPanel api={api} />);
    await user.type(screen.getByPlaceholderText('D:/Qt/5.9.6/msvc2015_64'), 'D:/Qt/5.9.6/msvc2015_64');
    await user.type(screen.getByPlaceholderText('5.9.6'), '5.9.6');
    await user.type(screen.getByPlaceholderText('msvc2015_64'), 'msvc2015_64');
    await user.click(screen.getByRole('button', { name: '保存 Qt Kit' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'manual-qt-5.9.6-msvc2015_64', binDirectory: 'D:/Qt/5.9.6/msvc2015_64/bin', uic: 'D:/Qt/5.9.6/msvc2015_64/bin/uic.exe', qmake: 'D:/Qt/5.9.6/msvc2015_64/bin/qmake.exe', compilerAbi: 'msvc2015_64' })));
  });

  it('directly saves a listed Qt Kit as the current project binding', async () => {
    const kit = { id: 'qt59', displayName: 'Qt 5.9.6', version: '5.9.6', qtMajor: 5 as const, rootDir: 'D:/Qt/5.9.6/msvc2015_64', binDirectory: 'D:/Qt/5.9.6/msvc2015_64/bin', uic: 'uic.exe', rcc: 'rcc.exe', compilerAbi: 'msvc2015_64', architecture: 'x86_64' };
    const saveProjectBinding = vi.fn();
    const api = { settings: { qtKits: { list: vi.fn(async () => [kit]), scan: vi.fn(), save: vi.fn(), check: vi.fn(), delete: vi.fn() }, saveProjectBinding, getProjectBinding: vi.fn(), checkProjectBinding: vi.fn() }, projects: { list: vi.fn(async () => [{ id: 'demo', rootDir: 'D:/demo', uiFiles: [] }]), import: vi.fn(), chooseDirectory: vi.fn() } } as unknown as DesktopApi;
    const user = userEvent.setup(); render(<QtKitsPanel api={api} workspace={{ id: 'workspace', name: 'demo', rootDir: 'D:/demo', fileCount: 0, lastOpenedAt: 1, createdAt: 1, updatedAt: 1, files: [], profile: {} }} />);
    await user.click(await screen.findByRole('button', { name: '用于当前项目' }));
    await waitFor(() => expect(saveProjectBinding).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'demo', qtKitId: 'qt59' })));
    expect(await screen.findByText('已将 Qt 5.9.6 保存为当前项目 Qt Kit。')).toBeTruthy();
  });

  it('lets a projectless settings page select the application default Qt Kit', async () => {
    const first = { id: 'qt5', displayName: 'Qt 5.9.6', version: '5.9.6', qtMajor: 5 as const, rootDir: 'D:/Qt5', binDirectory: 'D:/Qt5/bin', uic: 'uic.exe', rcc: 'rcc.exe' };
    const second = { id: 'qt6', displayName: 'Qt 6.10.2', version: '6.10.2', qtMajor: 6 as const, rootDir: 'D:/Qt6', binDirectory: 'D:/Qt6/bin', uic: 'uic.exe', rcc: 'rcc.exe' };
    const save = vi.fn(async (kit) => kit);
    const api = { settings: { qtKits: { list: vi.fn(async () => [first, second]), scan: vi.fn(), save, check: vi.fn(), delete: vi.fn() } }, projects: { chooseDirectory: vi.fn() } } as unknown as DesktopApi;
    const user = userEvent.setup(); render(<QtKitsPanel api={api} />);
    await user.click((await screen.findAllByRole('button', { name: '设为默认 Qt Kit' }))[0]!);
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'qt5', isDefault: true })));
    expect(await screen.findByText('已将 Qt 5.9.6 设为应用默认 Qt Kit。')).toBeTruthy();
  });
});

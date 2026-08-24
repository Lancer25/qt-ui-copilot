// @vitest-environment jsdom
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { SettingsPage } from './SettingsPage';
import { FakeDesktopApi } from '../../test/FakeDesktopApi';

describe('SettingsPage', () => {
  afterEach(cleanup);
  it('tests model capabilities independently and never renders an API key', async () => {
    const user = userEvent.setup();
    render(<SettingsPage api={new FakeDesktopApi()} initialSection="model" />);
    await user.click(screen.getByRole('button', { name: '测试视觉能力' }));
    expect(await screen.findByText(/图片理解可用/)).not.toBeNull();
    expect(document.body.textContent).not.toContain('sk-sp-secret');
  });
  it('shows a Qt Kit health result and its exact failing tool', async () => {
    const api = new FakeDesktopApi().withQtKits([{ id: 'qt59', displayName: 'Qt 5.9.6', version: '5.9.6', qtMajor: 5, rootDir: 'D:/Qt5.9.6', binDirectory: 'D:/Qt5.9.6/bin', uic: 'D:/Qt5.9.6/bin/uic.exe', rcc: 'D:/Qt5.9.6/bin/rcc.exe' }]).withQtKitHealth({ ok: false, tools: [{ name: 'uic', ok: true, path: 'uic.exe' }, { name: 'rcc', ok: false, path: 'rcc.exe', message: 'rcc missing' }], previewHost: { ok: false } });
    const user = userEvent.setup();
    render(<SettingsPage api={api} initialSection="qt-kits" />);
    expect(await screen.findByText('Qt 5.9.6')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: '健康检查' }));
    await waitFor(() => expect(screen.getByText(/rcc 检测失败/)).not.toBeNull());
  });
});

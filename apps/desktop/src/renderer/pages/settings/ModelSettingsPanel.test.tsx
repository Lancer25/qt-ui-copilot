// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeDesktopApi } from '../../test/FakeDesktopApi';
import { ModelSettingsPanel } from './ModelSettingsPanel';

describe('ModelSettingsPanel', () => {
  afterEach(cleanup);

  it('groups connection, image and capability settings without squeezing fields together', async () => {
    render(<ModelSettingsPanel api={new FakeDesktopApi()} />);
    expect(await screen.findByRole('group', { name: '连接配置' })).toBeTruthy();
    expect(screen.getByRole('group', { name: '图片配置' })).toBeTruthy();
    expect(screen.getByRole('group', { name: '能力检测' })).toBeTruthy();
    expect(screen.getByLabelText('Base URL')).toBeTruthy();
    expect(screen.getByLabelText('API Key')).toBeTruthy();
  });

  it('keeps full failure details collapsed until requested', async () => {
    const api = new FakeDesktopApi();
    api.settings.testModelCapability = async ({ capability }) => ({ capability, ok: false, status: 400, model: 'fake', message: 'HTTP 400: invalid image payload\nprovider detail', elapsedMs: 1 });
    const user = userEvent.setup();
    render(<ModelSettingsPanel api={api} />);
    await user.click(await screen.findByRole('button', { name: '测试视觉能力' }));
    expect(screen.getByText(/图片理解不可用：HTTP 400/)).toBeTruthy();
    expect(screen.queryByText(/provider detail/)).toBeNull();
    await user.click(screen.getByRole('button', { name: '查看详情' }));
    expect(screen.getByText(/provider detail/)).toBeTruthy();
  });
});

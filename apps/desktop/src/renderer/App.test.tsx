// @vitest-environment jsdom
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { FakeDesktopApi } from './test/FakeDesktopApi';
import { makeReportRequest } from './features/report/EvidenceReport';

describe('Qt UI Copilot product UI', () => {
  afterEach(cleanup);
  it('approves and applies the structured plan from the primary candidate action', async () => {
    const user = userEvent.setup();
    const fakeApi = new FakeDesktopApi().withPlan({ summary: '增加测试按钮', riskLevel: 'medium', expectedResults: [], componentIds: [], operations: [{ op: 'addWidget', parentLayout: 'buttonLayout', widgetClass: 'QPushButton', objectName: 'testButton' }] });
    render(<App api={fakeApi} />);
    await user.click(screen.getByRole('button', { name: '选择项目目录' }));
    await user.click(screen.getByRole('button', { name: 'src/Settings.ui' }));
    await user.type(screen.getByLabelText('界面需求'), '增加测试按钮');
    await user.click(screen.getByRole('button', { name: '生成修改计划' }));
    const applyCandidate = screen.getByRole('button', { name: '批准并应用候选修改' });
    expect((applyCandidate as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: '批准计划' })).toBeNull();

    await user.click(applyCandidate);

    expect(fakeApi.approveRequests).toEqual([{ taskId: 'task-1', approved: true }]);
    await waitFor(() => expect(screen.getByText('UIC_VALIDATE · running')).not.toBeNull());
    expect((screen.getByRole('button', { name: '批准并应用候选修改' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('chooses a directory on first use, imports it, and leaves the workbench unchanged when cancelled', async () => {
    const user = userEvent.setup();
    const fakeApi = new FakeDesktopApi();
    render(<App api={fakeApi} />);

    await user.click(screen.getByRole('button', { name: '选择项目目录' }));
    expect(fakeApi.importedDirectories).toEqual(['D:/demo']);
    expect(screen.getByDisplayValue('D:/demo')).not.toBeNull();

    const cancelledApi = new FakeDesktopApi();
    cancelledApi.selectedDirectory = undefined;
    render(<App api={cancelledApi} />);
    await user.click(screen.getByRole('button', { name: '选择项目目录' }));
    expect(cancelledApi.importedDirectories).toEqual([]);
  });

  it('keeps report evidence structured for the Main-process exporter', () => {
    const fakeApi = new FakeDesktopApi().withPlan({ summary: '增加按钮', riskLevel: 'low', expectedResults: ['按钮可见'], componentIds: [], operations: [{ op: 'setProperty', target: 'saveButton', name: 'text', value: '保存' }] });
    void fakeApi;
    const request = makeReportRequest({ taskId: 't1', targetUi: 'Settings.ui', status: 'completed', node: 'ACCEPT_OR_ROLLBACK', events: [], deterministicFindings: ['uic 校验通过'], visualFindings: [], routeEvidence: [], qtKit: 'Qt 5.9.6', build: { executable: 'demo.exe', args: [], exitCode: 0 } });
    expect(request.task.deterministicFindings).toEqual(['uic 校验通过']);
    expect(request.task.build?.exitCode).toBe(0);
  });

  it('exposes a model connection test in model settings', async () => {
    const user = userEvent.setup();
    const fakeApi = new FakeDesktopApi();
    render(<App api={fakeApi} />);
    await user.click(screen.getByRole('button', { name: '模型设置' }));
    await user.click(screen.getByRole('button', { name: '测试连接' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('连接成功'));
  });
});

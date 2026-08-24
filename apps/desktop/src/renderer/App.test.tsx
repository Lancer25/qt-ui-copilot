// @vitest-environment jsdom
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { FakeDesktopApi } from './test/FakeDesktopApi';
import { makeReportRequest } from './features/report/EvidenceReport';

describe('Qt UI Copilot product UI', () => {
  afterEach(cleanup);
  it('keeps the primary action focusable and explains why approval is unavailable', async () => {
    const user = userEvent.setup();
    render(<App api={new FakeDesktopApi()} />);
    const applyCandidate = screen.getByRole('button', { name: '批准并应用候选修改' });

    expect((applyCandidate as HTMLButtonElement).disabled).toBe(false);
    expect(applyCandidate.getAttribute('aria-disabled')).toBe('true');
    expect(applyCandidate.getAttribute('data-workflow-status')).toBe('none');
    expect(applyCandidate.getAttribute('data-workflow-node')).toBe('none');
    expect(applyCandidate.getAttribute('data-has-plan')).toBe('false');
    expect(applyCandidate.getAttribute('data-can-apply')).toBe('false');
    await user.click(applyCandidate);

    expect(screen.getByRole('alert').textContent).toContain('当前没有可批准的候选修改计划');
  });

  it('approves and applies the structured plan from the primary candidate action', async () => {
    const user = userEvent.setup();
    const fakeApi = new FakeDesktopApi().withPlan({ summary: '增加测试按钮', riskLevel: 'medium', expectedResults: [], componentIds: [], operations: [{ op: 'addWidget', parentLayout: 'buttonLayout', widgetClass: 'QPushButton', objectName: 'testButton' }] });
    render(<App api={fakeApi} />);
    await user.click(screen.getByRole('button', { name: '选择项目目录' }));
    await user.click(screen.getByRole('button', { name: 'src/Settings.ui' }));
    await user.type(screen.getByLabelText('界面需求'), '增加测试按钮');
    await user.click(screen.getByRole('button', { name: '生成修改计划' }));
    const applyCandidate = screen.getByRole('button', { name: '批准并应用候选修改' });
    expect(applyCandidate.getAttribute('aria-disabled')).toBe('false');
    expect(applyCandidate.getAttribute('data-has-plan')).toBe('true');
    expect(applyCandidate.getAttribute('data-can-apply')).toBe('true');
    expect(screen.queryByRole('button', { name: '批准计划' })).toBeNull();

    await user.click(applyCandidate);

    expect(fakeApi.approveRequests).toEqual([{ taskId: 'task-1', approved: true }]);
    await waitFor(() => expect(screen.getByText('UIC_VALIDATE · running')).not.toBeNull());
    // A complete plan remains actionable while the workflow is running; the
    // main-process workflow machine remains authoritative for repeat/illegal approvals.
    expect(screen.getByRole('button', { name: '批准并应用候选修改' }).getAttribute('aria-disabled')).toBe('false');
  });

  it.each(['waiting_approval', 'running'] as const)('enables approval for a complete USER_APPROVAL candidate when status is %s', async (status) => {
    const user = userEvent.setup();
    const fakeApi = new FakeDesktopApi().withPlan({ summary: '增加测试按钮', riskLevel: 'medium', expectedResults: [], componentIds: [], operations: [{ op: 'addWidget', parentLayout: 'buttonLayout', widgetClass: 'QPushButton', objectName: 'testButton' }] }).withWorkflowState({ status, node: 'USER_APPROVAL' });
    render(<App api={fakeApi} />);
    await user.click(screen.getByRole('button', { name: '选择项目目录' }));
    await user.click(screen.getByRole('button', { name: 'src/Settings.ui' }));
    await user.type(screen.getByLabelText('界面需求'), '增加测试按钮');
    await user.click(screen.getByRole('button', { name: '生成修改计划' }));

    expect(screen.getByRole('button', { name: '批准并应用候选修改' }).getAttribute('aria-disabled')).toBe('false');
  });

  it('does not rewind an approval candidate when an older workflow event arrives late', async () => {
    const user = userEvent.setup();
    const fakeApi = new FakeDesktopApi().withPlan({ summary: '增加测试按钮', riskLevel: 'medium', expectedResults: [], componentIds: [], operations: [{ op: 'addWidget', parentLayout: 'buttonLayout', widgetClass: 'QPushButton', objectName: 'testButton' }] });
    render(<App api={fakeApi} />);
    await user.click(screen.getByRole('button', { name: '选择项目目录' }));
    await user.click(screen.getByRole('button', { name: 'src/Settings.ui' }));
    await user.type(screen.getByLabelText('界面需求'), '增加测试按钮');
    await user.click(screen.getByRole('button', { name: '生成修改计划' }));

    fakeApi.emitWorkflowState({ taskId: 'task-1', targetUi: 'src/Settings.ui', status: 'running', node: 'IMPORT_PROJECT', events: [{ node: 'GENERATE_UI_PLAN', status: 'completed' }, { node: 'USER_APPROVAL', status: 'waiting_approval' }], deterministicFindings: [], visualFindings: [], routeEvidence: [] });
    expect(screen.getByRole('button', { name: '批准并应用候选修改' }).getAttribute('data-workflow-status')).toBe('waiting_approval');
    expect(screen.getByRole('button', { name: '批准并应用候选修改' }).getAttribute('data-can-apply')).toBe('true');
  });

  it('surfaces completed and failed runtime verification badges from workflow events', async () => {
    const fakeApi = new FakeDesktopApi();
    render(<App api={fakeApi} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fakeApi.emitWorkflowState({
      taskId: 'task-verify', targetUi: 'src/Settings.ui', status: 'completed', node: 'REPORT',
      events: [
        { node: 'UIC_VALIDATE', status: 'completed' },
        { node: 'CAPTURE_REAL_RESULT', status: 'completed' },
      ], deterministicFindings: [], visualFindings: [], routeEvidence: [],
    });
    await waitFor(() => expect(screen.getByText('uic 校验通过')).not.toBeNull());
    expect(screen.getByText('真实应用验证通过')).not.toBeNull();

    fakeApi.emitWorkflowState({
      taskId: 'task-verify', targetUi: 'src/Settings.ui', status: 'failed', node: 'CAPTURE_REAL_RESULT',
      events: [
        { node: 'UIC_VALIDATE', status: 'failed' },
        { node: 'CAPTURE_REAL_RESULT', status: 'failed' },
      ], deterministicFindings: [], visualFindings: [], routeEvidence: [],
    });
    await waitFor(() => expect(screen.getByText('uic 校验失败')).not.toBeNull());
    expect(screen.getByText('真实应用验证失败')).not.toBeNull();
  });

  it('keeps approval disabled for a failed planner node even when a plan is present', async () => {
    const user = userEvent.setup();
    const fakeApi = new FakeDesktopApi().withPlan({ summary: '增加测试按钮', riskLevel: 'medium', expectedResults: [], componentIds: [], operations: [{ op: 'addWidget', parentLayout: 'buttonLayout', widgetClass: 'QPushButton', objectName: 'testButton' }] }).withFailure({ code: 'model_output_invalid', message: 'planner failed' });
    render(<App api={fakeApi} />);
    await user.click(screen.getByRole('button', { name: '选择项目目录' }));
    await user.click(screen.getByRole('button', { name: 'src/Settings.ui' }));
    await user.type(screen.getByLabelText('界面需求'), '增加测试按钮');
    await user.click(screen.getByRole('button', { name: '生成修改计划' }));

    expect(screen.getByRole('button', { name: '批准并应用候选修改' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('keeps approval disabled for a cancelled task even when a plan is present', async () => {
    const user = userEvent.setup();
    const fakeApi = new FakeDesktopApi().withPlan({ summary: '增加测试按钮', riskLevel: 'medium', expectedResults: [], componentIds: [], operations: [{ op: 'addWidget', parentLayout: 'buttonLayout', widgetClass: 'QPushButton', objectName: 'testButton' }] }).withWorkflowState({ status: 'cancelled', node: 'USER_APPROVAL' });
    render(<App api={fakeApi} />);
    await user.click(screen.getByRole('button', { name: '选择项目目录' }));
    await user.click(screen.getByRole('button', { name: 'src/Settings.ui' }));
    await user.type(screen.getByLabelText('界面需求'), '增加测试按钮');
    await user.click(screen.getByRole('button', { name: '生成修改计划' }));

    expect(screen.getByRole('button', { name: '批准并应用候选修改' }).getAttribute('aria-disabled')).toBe('true');
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

  it('shows a failed planner node and a bounded alert when the workflow cannot create a plan', async () => {
    const user = userEvent.setup();
    const fakeApi = new FakeDesktopApi().withFailure({ code: 'model_output_invalid', message: `planner failed ${'x'.repeat(800)}` });
    render(<App api={fakeApi} />);
    await user.click(screen.getByRole('button', { name: '选择项目目录' }));
    await user.click(screen.getByRole('button', { name: 'src/Settings.ui' }));
    await user.type(screen.getByLabelText('界面需求'), '增加测试按钮');
    await user.click(screen.getByRole('button', { name: '生成修改计划' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('model_output_invalid');
    expect(alert.textContent).toContain('planner failed');
    expect(alert.textContent?.length ?? 0).toBeLessThan(600);
    expect(screen.getByRole('listitem', { name: /GENERATE_UI_PLAN failed/ })).not.toBeNull();
  });
});

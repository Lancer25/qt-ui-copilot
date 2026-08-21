import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ModelProvider } from '@qt-ui-copilot/agent-workflow';
import { createLocalBackend } from './register-ipc';

const fakeProvider: ModelProvider = { generate: async (request) => request.kind === 'visual_review'
  ? { requirementSatisfied: true, score: 100, blockingIssues: [], suggestions: [] }
  : { summary: '增加测试按钮', riskLevel: 'low', expectedResults: ['按钮可见'], componentIds: [], operations: [{ op: 'addWidget', parentLayout: 'buttonLayout', widgetClass: 'QPushButton', objectName: 'testButton' }] } };

describe('local workflow backend', () => {
  it('returns an explicit configuration result instead of throwing when no model is configured', async () => {
    const backend = createLocalBackend();
    await expect(backend.startTask({ projectId: 'missing', targetUi: 'missing.ui', requirement: 'test' })).resolves.toMatchObject({ kind: 'configuration_required' });
  });

  it('persists task workflow snapshots and emits updates with an injected deterministic model', async () => {
    const root = mkdtempSync(join(tmpdir(), 'qt-ui-copilot-backend-'));
    const ui = join(root, 'Settings.ui');
    writeFileSync(ui, '<ui version="4.0"><class>Settings</class><widget class="QWidget" name="Settings"><layout class="QVBoxLayout" name="buttonLayout"/></widget><resources/><connections/></ui>');
    const backend = createLocalBackend({ databasePath: join(root, 'tasks.sqlite'), modelProvider: fakeProvider });
    const project = await backend.importProject({ rootDir: root }) as { id: string; uiFiles: string[] };
    const events: unknown[] = []; backend.subscribeWorkflow?.((state) => events.push(state));
    const started = await backend.startTask({ projectId: project.id, targetUi: project.uiFiles[0], requirement: '增加测试按钮' }) as { kind: string; state: { taskId: string; status: string; node: string; plan?: { summary: string } } };
    expect(started.kind).toBe('started'); expect(started.state.status).toBe('waiting_approval'); expect(started.state.plan?.summary).toBe('增加测试按钮');
    const progressed = await backend.approveTask({ taskId: started.state.taskId, approved: true }) as { status: string; node: string };
    expect(progressed.status).toBe('waiting_approval'); expect(progressed.node).toBe('ACCEPT_OR_ROLLBACK'); expect(events.length).toBeGreaterThan(1);
  });
});

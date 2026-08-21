import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ModelProvider } from '@qt-ui-copilot/agent-workflow';
import { createLocalBackend, type SecureStorage } from './register-ipc';

const fakeProvider: ModelProvider = { generate: async (request) => request.kind === 'visual_review'
  ? { requirementSatisfied: true, score: 100, blockingIssues: [], suggestions: [] }
  : { summary: '增加测试按钮', riskLevel: 'low', expectedResults: ['按钮可见'], componentIds: [], operations: [{ op: 'addWidget', parentLayout: 'buttonLayout', widgetClass: 'QPushButton', objectName: 'testButton' }] } };

const encryptedStorage = (): SecureStorage => ({
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from([...Buffer.from(value, 'utf8')].map((byte) => byte ^ 0xa5)),
  decryptString: (value) => Buffer.from([...value].map((byte) => byte ^ 0xa5)).toString('utf8'),
});

const unavailableStorage: SecureStorage = {
  isEncryptionAvailable: () => false,
  encryptString: () => { throw new Error('unavailable'); },
  decryptString: () => { throw new Error('unavailable'); },
};

describe('local workflow backend', () => {
  it('returns an explicit configuration result instead of throwing when no model is configured', async () => {
    const backend = createLocalBackend();
    await expect(backend.startTask({ projectId: 'missing', targetUi: 'missing.ui', requirement: 'test' })).resolves.toMatchObject({ kind: 'configuration_required' });
  });

  it('returns a user-facing message when the selected project directory cannot be read', async () => {
    const backend = createLocalBackend();
    await expect(backend.importProject({ rootDir: join(tmpdir(), 'qt-ui-copilot-directory-does-not-exist') })).rejects
      .toThrow('无法导入项目目录');
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

  it('reopens persisted model metadata and decrypts only safeStorage ciphertext', async () => {
    const root = mkdtempSync(join(tmpdir(), 'qt-ui-copilot-model-backend-'));
    const databasePath = join(root, 'tasks.sqlite');
    const apiKey = 'super-secret-key-not-in-sqlite';
    try {
      const first = createLocalBackend({ databasePath, secureStorage: encryptedStorage() });
      await expect(first.configureModelSettings({ baseUrl: 'https://models.example/v1', model: 'demo-model', apiKey })).resolves.toEqual({
        baseUrl: 'https://models.example/v1', model: 'demo-model', hasApiKey: true, hasPersistentApiKey: true,
      });
      expect(readFileSync(databasePath).includes(Buffer.from(apiKey, 'utf8'))).toBe(false);
      first.dispose?.();

      const reopened = createLocalBackend({ databasePath, secureStorage: encryptedStorage() });
      await expect(reopened.getModelSettings()).resolves.toEqual({
        baseUrl: 'https://models.example/v1', model: 'demo-model', hasApiKey: true, hasPersistentApiKey: true,
      });
      reopened.dispose?.();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('retains a supplied API key only in memory when system encryption is unavailable', async () => {
    const root = mkdtempSync(join(tmpdir(), 'qt-ui-copilot-volatile-model-backend-'));
    const databasePath = join(root, 'tasks.sqlite');
    const apiKey = 'volatile-secret-never-on-disk';
    try {
      const first = createLocalBackend({ databasePath, secureStorage: unavailableStorage });
      await expect(first.configureModelSettings({ baseUrl: 'https://models.example/v1', model: 'demo-model', apiKey })).resolves.toEqual({
        baseUrl: 'https://models.example/v1', model: 'demo-model', hasApiKey: true, hasPersistentApiKey: false,
        storageWarning: '系统安全存储不可用；API Key 只在当前会话内保存。',
      });
      expect(readFileSync(databasePath).includes(Buffer.from(apiKey, 'utf8'))).toBe(false);
      first.dispose?.();

      const reopened = createLocalBackend({ databasePath, secureStorage: unavailableStorage });
      await expect(reopened.getModelSettings()).resolves.toEqual({
        baseUrl: 'https://models.example/v1', model: 'demo-model', hasApiKey: false, hasPersistentApiKey: false,
      });
      reopened.dispose?.();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

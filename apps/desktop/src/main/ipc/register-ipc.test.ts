import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

function writeExecutionConfig(root: string): void {
  mkdirSync(join(root, '.qt-ui-copilot'), { recursive: true });
  writeFileSync(join(root, '.qt-ui-copilot', 'project.json'), JSON.stringify({
    id: 'test-project',
    qt: { version: '6.10.2', binDirectory: 'bin', uic: 'uic', rcc: 'rcc', cmake: 'cmake', cmakePrefixPath: 'qt', compilerAbi: 'test', architecture: 'x86_64' },
    preview: { sourceDirectory: 'preview-host', cacheDirectory: '.qt-ui-copilot/cache', width: 300, height: 200, locale: 'zh_CN', style: 'Fusion', qrcFiles: [], stylesheets: [], fonts: [], pluginPaths: [] },
    build: { command: { executable: 'cmake', args: ['--build', 'build'] } },
    run: { executable: 'app', args: [], environment: {} },
  }));
}

function writeQt6IntegrationConfig(root: string): void {
  const repositoryRoot = join(process.cwd(), '..', '..');
  mkdirSync(join(root, '.qt-ui-copilot'), { recursive: true });
  writeFileSync(join(root, '.qt-ui-copilot', 'project.json'), JSON.stringify({
    id: 'qt6-integration',
    qt: {
      version: '6.10.2', binDirectory: 'D:/Qt6.10.2/6.10.2/msvc2022_64/bin',
      uic: 'D:/Qt6.10.2/6.10.2/msvc2022_64/bin/uic.exe', rcc: 'D:/Qt6.10.2/6.10.2/msvc2022_64/bin/rcc.exe',
      cmake: 'C:/Program Files/CMake/bin/cmake.exe', cmakePrefixPath: 'D:/Qt6.10.2/6.10.2/msvc2022_64', cmakeGenerator: 'Visual Studio 18 2026', compilerAbi: 'msvc2022_64', architecture: 'x86_64',
    },
    preview: { sourceDirectory: join(repositoryRoot, 'native', 'qt-ui-preview-host'), cacheDirectory: join(root, '.qt-ui-copilot', 'preview-cache'), width: 360, height: 240, locale: 'zh_CN', style: 'Fusion', qrcFiles: [], stylesheets: [], fonts: [], pluginPaths: [] },
    build: { command: { executable: 'C:/Program Files/CMake/bin/cmake.exe', args: ['-E', 'true'] } },
    run: { executable: join(root, 'not-built.exe'), args: [], environment: {} },
  }));
}

describe('local workflow backend', () => {
  it('tests a configured model connection without exposing the API key', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const backend = createLocalBackend({ fetchImpl: async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 });
    }, secureStorage: encryptedStorage() });
    await backend.configureModelSettings({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-test', apiKey: 'sk-secret' });
    await expect(backend.testModelConnection()).resolves.toMatchObject({ ok: true, status: 200, model: 'gpt-test' });
    expect(requests[0]?.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(String(requests[0]?.init?.body)).toContain('gpt-test');
    expect(String(requests[0]?.init?.body)).not.toContain('sk-secret');
    expect((requests[0]?.init?.headers as Record<string, string>).authorization).toBe('Bearer sk-secret');
    backend.dispose?.();
  });

  it.each([
    [401, 'authentication_failed'],
    [404, 'model_or_endpoint_not_found'],
  ])('returns a useful sanitized diagnostic for HTTP %s', async (status, code) => {
    const backend = createLocalBackend({ fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'bad key sk-secret should not leak' } }), { status }), secureStorage: encryptedStorage() });
    await backend.configureModelSettings({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-test', apiKey: 'sk-secret' });
    await expect(backend.testModelConnection()).resolves.toMatchObject({ ok: false, status, code, model: 'gpt-test' });
    const result = await backend.testModelConnection();
    expect(result.message).not.toContain('sk-secret');
    backend.dispose?.();
  });

  it('returns a bounded timeout diagnostic', async () => {
    const backend = createLocalBackend({ fetchImpl: async () => { throw new DOMException('The operation was aborted.', 'AbortError'); } });
    await backend.configureModelSettings({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-test' });
    await expect(backend.testModelConnection()).resolves.toMatchObject({ ok: false, code: 'timeout', model: 'gpt-test' });
    backend.dispose?.();
  });

  it('returns an explicit configuration result instead of throwing when no model is configured', async () => {
    const backend = createLocalBackend();
    await expect(backend.startTask({ projectId: 'missing', targetUi: 'missing.ui', requirement: 'test' })).resolves.toMatchObject({ kind: 'configuration_required' });
  });

  it('returns a user-facing message when the selected project directory cannot be read', async () => {
    const backend = createLocalBackend();
    await expect(backend.importProject({ rootDir: join(tmpdir(), 'qt-ui-copilot-directory-does-not-exist') })).rejects
      .toThrow('无法导入项目目录');
  });

  it('imports an unconfigured project but blocks a real task with configuration_required', async () => {
    const root = mkdtempSync(join(tmpdir(), 'qt-ui-copilot-unconfigured-'));
    try {
      const ui = join(root, 'Settings.ui');
      writeFileSync(ui, '<ui version="4.0"><class>Settings</class><widget class="QWidget" name="Settings"/><resources/><connections/></ui>');
      const backend = createLocalBackend({ modelProvider: fakeProvider });
      const project = await backend.importProject({ rootDir: root }) as { id: string; uiFiles: string[]; configurationRequired?: string };
      expect(project.configurationRequired).toContain('project.json');
      await expect(backend.startTask({ projectId: project.id, targetUi: project.uiFiles[0], requirement: 'test' })).resolves.toMatchObject({ kind: 'configuration_required' });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('persists task workflow snapshots and emits updates with an injected deterministic model', async () => {
    const root = mkdtempSync(join(tmpdir(), 'qt-ui-copilot-backend-'));
    const ui = join(root, 'Settings.ui');
    writeFileSync(ui, '<ui version="4.0"><class>Settings</class><widget class="QWidget" name="Settings"><layout class="QVBoxLayout" name="buttonLayout"></layout></widget><resources/><connections/></ui>');
    writeExecutionConfig(root);
    const backend = createLocalBackend({ databasePath: join(root, 'tasks.sqlite'), modelProvider: fakeProvider });
    const project = await backend.importProject({ rootDir: root }) as { id: string; uiFiles: string[] };
    const events: unknown[] = []; backend.subscribeWorkflow?.((state) => events.push(state));
    const started = await backend.startTask({ projectId: project.id, targetUi: project.uiFiles[0], requirement: '增加测试按钮' }) as { kind: string; state: { taskId: string; status: string; node: string; plan?: { summary: string } } };
    expect(started.kind).toBe('started'); expect(started.state.status).toBe('waiting_approval'); expect(started.state.plan?.summary).toBe('增加测试按钮');
    const progressed = await backend.approveTask({ taskId: started.state.taskId, approved: true }) as { status: string; node: string; failure?: { code: string } };
    expect(progressed.status).toBe('failed'); expect(progressed.failure?.code).toBe('uic_validate_failed'); expect(events.length).toBeGreaterThan(1);
    await expect(backend.rollbackTask({ taskId: started.state.taskId })).resolves.toMatchObject({ status: 'cancelled' });
    expect(readFileSync(ui, 'utf8')).not.toContain('testButton');
  });

  it.skipIf(!existsSync('D:/Qt6.10.2/6.10.2/msvc2022_64/bin/uic.exe'))('stages a UiOperation and runs target-kit uic plus PreviewHost with the Qt6 profile', async () => {
    const root = mkdtempSync(join(tmpdir(), 'qt-ui-copilot-qt6-workflow-'));
    const ui = join(root, 'Settings.ui');
    const original = '<ui version="4.0"><class>Settings</class><widget class="QWidget" name="Settings"><layout class="QVBoxLayout" name="buttonLayout"></layout></widget><resources/><connections/></ui>';
    writeFileSync(ui, original); writeQt6IntegrationConfig(root);
    const backend = createLocalBackend({ databasePath: join(root, 'tasks.sqlite'), modelProvider: fakeProvider });
    try {
      const project = await backend.importProject({ rootDir: root }) as { id: string; uiFiles: string[] };
      const started = await backend.startTask({ projectId: project.id, targetUi: project.uiFiles[0], requirement: '增加测试按钮' }) as { state: { taskId: string } };
      const result = await backend.approveTask({ taskId: started.state.taskId, approved: true }) as { status: string; failure?: { code: string } };
      expect(result.status).toBe('failed');
      expect(result.failure?.code).toBe('runtime_route_required');
      expect(readFileSync(ui, 'utf8')).toContain('testButton');
      expect(readFileSync(join(root, '.qt-ui-copilot', 'tasks', started.state.taskId, 'preview-after.png')).length).toBeGreaterThan(0);
    } finally { backend.dispose?.(); writeFileSync(ui, original); rmSync(root, { recursive: true, force: true }); }
  }, 120_000);

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

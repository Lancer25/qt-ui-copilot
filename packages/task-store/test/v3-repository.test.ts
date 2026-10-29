import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/database.js';
import { V3Repository } from '../src/v3-repository.js';

const profile = {
  qtKitId: 'qt59-msvc2017', mode: 'quick' as const, width: 900, height: 640,
  locale: 'zh_CN', style: 'Fusion', qrcFiles: [], stylesheets: [], fonts: [], pluginPaths: [], highDpiMode: 'system' as const,
};

const session = (id: string, filePath: string, conversationId: string, mode: 'quick' | 'enhanced' = 'quick') => ({
  id, filePath, preview: { ...profile, mode }, conversationId, createdAt: 1, updatedAt: 1,
});

describe('V3Repository', () => {
  it('stores independent preview and conversation state per ui file', () => {
    const database = openDatabase(':memory:');
    const repository = new V3Repository(database);
    repository.saveEditorSession(session('a', 'D:/app/Settings.ui', 'conversation-a'));
    repository.saveEditorSession(session('b', 'D:/app/Login.ui', 'conversation-b', 'enhanced'));
    expect(repository.getEditorSession('a')?.conversationId).toBe('conversation-a');
    expect(repository.getEditorSession('b')?.preview.mode).toBe('enhanced');
    database.close();
  });

  it('round-trips conversations, revisions and preferences with schema validation', () => {
    const database = openDatabase(':memory:');
    const repository = new V3Repository(database);
    repository.saveConversation({ id: 'conversation-a', uiFile: 'D:/app/Settings.ui', contextMode: 'focused_ui', applyMode: 'approval', messages: [], createdAt: 1, updatedAt: 1 });
    repository.appendConversationMessage('conversation-a', { id: 'm1', role: 'user', content: 'Add a button', createdAt: 2 });
    expect(repository.getConversation('conversation-a')?.messages[0].content).toBe('Add a button');
    repository.saveRevision({ id: 'r1', uiFile: 'D:/app/Settings.ui', conversationId: 'conversation-a', operations: [], beforeHash: 'before', afterHash: 'after', validation: { xml: true, semantic: true, uic: true, preview: true, findings: [], validatedAt: 2 }, createdAt: 2 });
    expect(repository.listRevisions('D:/app/Settings.ui')[0]?.validation.uic).toBe(true);
    repository.savePreferences({ assistantWidth: 360, applyMode: 'approval' });
    expect(repository.getPreferences()).toEqual({ assistantWidth: 360, applyMode: 'approval' });
    database.close();
  });

  it('persists workspaces and deletes dependent editor sessions', () => {
    const database = openDatabase(':memory:');
    const repository = new V3Repository(database);
    repository.saveWorkspace({ id: 'workspace-a', name: 'Demo', rootDir: 'D:/app', fileCount: 2, lastOpenedAt: 1, createdAt: 1, updatedAt: 1 });
    repository.saveEditorSession({ ...session('a', 'D:/app/Settings.ui', 'conversation-a'), workspaceId: 'workspace-a' });
    expect(repository.listWorkspaces()).toHaveLength(1);
    repository.deleteWorkspace('workspace-a');
    expect(repository.listEditorSessions()).toHaveLength(0);
    database.close();
  });

  it('persists V3 task snapshots and filters history by workspace', () => {
    const database = openDatabase(':memory:');
    const repository = new V3Repository(database);
    repository.saveTaskSnapshot({
      workspaceId: 'workspace-a', title: 'Create Login.ui', targetPath: 'ui/Login.ui',
      snapshot: { taskId: 'task-a', status: 'completed', lastSequence: 1, events: [{ taskId: 'task-a', sequence: 1, timestamp: 2, lane: 'conversation', type: 'done', status: 'completed', title: '完成' }], createdAt: 1, updatedAt: 2 },
    });
    repository.saveTaskSnapshot({
      workspaceId: 'workspace-b', title: 'Build app',
      snapshot: { taskId: 'task-b', status: 'failed', lastSequence: 1, events: [{ taskId: 'task-b', sequence: 1, timestamp: 4, lane: 'generation', type: 'error', status: 'failed', title: '失败' }], createdAt: 3, updatedAt: 4 },
    });

    expect(repository.getTaskSnapshot('task-a')?.events[0]?.title).toBe('完成');
    expect(repository.listTaskSnapshots('workspace-a')).toEqual([expect.objectContaining({ taskId: 'task-a', title: 'Create Login.ui', status: 'completed' })]);
    expect(repository.listTaskSnapshots()).toHaveLength(2);
    database.close();
  });

  it('marks tasks left active by a previous process as interrupted once', () => {
    const database = openDatabase(':memory:');
    const repository = new V3Repository(database);
    repository.saveTaskSnapshot({
      workspaceId: 'workspace-a', title: 'Running task',
      snapshot: { taskId: 'task-a', status: 'running', lastSequence: 1, events: [{ taskId: 'task-a', sequence: 1, timestamp: 2, lane: 'generation', type: 'status', status: 'running', title: '处理中' }], createdAt: 1, updatedAt: 2 },
    });

    expect(repository.reconcileInterruptedTasks(10)).toBe(1);
    expect(repository.reconcileInterruptedTasks(20)).toBe(0);
    expect(repository.getTaskSnapshot('task-a')).toMatchObject({ status: 'cancelled', lastSequence: 2, updatedAt: 10 });
    expect(repository.getTaskSnapshot('task-a')?.events.at(-1)?.title).toBe('应用上次退出时任务已中断');
    database.close();
  });

  it('persists component sources and atomically replaces their cached items', () => {
    const database = openDatabase(':memory:');
    const repository = new V3Repository(database);
    repository.saveComponentSource({ id: 'local-a', name: 'Local A', kind: 'local', enabled: true, protected: false, config: { rootDir: 'D:/widgets', discovery: 'hybrid' }, health: { status: 'idle' }, createdAt: 1, updatedAt: 1, encryptedCredential: Buffer.from('cipher') });
    const item = { sourceId: 'local-a', componentId: 'login', name: 'Login', description: 'Login card', tags: ['login'], uiSource: '<ui version="4.0"><class>A</class><widget class="QWidget" name="a"/></ui>', assets: [], qtVersionRange: '>=5.9.6 <7.0.0', license: { name: 'MIT', spdx: 'MIT' }, inferred: false, contentHash: 'a'.repeat(64), updatedAt: 2 };
    repository.replaceComponentSourceItems('local-a', [item], 3);
    expect(repository.getComponentSource('local-a')).toMatchObject({ itemCount: 1, hasCredential: true, lastSyncAt: 3 });
    expect(repository.getComponentSourceCredential('local-a')?.toString()).toBe('cipher');
    expect(repository.listComponentSourceItems('local-a')[0]?.componentId).toBe('login');
    expect(() => repository.replaceComponentSourceItems('local-a', [{ ...item, componentId: 'bad', assets: [{ path: '../bad', kind: 'qss', text: '' }] }], 4)).toThrow();
    expect(repository.listComponentSourceItems('local-a')[0]?.componentId).toBe('login');
    repository.deleteComponentSource('local-a');
    expect(repository.listComponentSourceItems()).toEqual([]);
    database.close();
  });
});

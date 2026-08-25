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
});

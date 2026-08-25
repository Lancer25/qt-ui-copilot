import { describe, expect, it } from 'vitest';
import { UiEditorSessionSchema, PreviewProfileSchema, WorkspaceFileSchema } from '../src/v3.js';

const preview = {
  qtKitId: 'qt59-msvc2017', mode: 'quick' as const, width: 900, height: 640,
  locale: 'zh_CN', style: 'Fusion', qrcFiles: [], stylesheets: [], fonts: [], pluginPaths: [], highDpiMode: 'system' as const,
};

describe('V3 contracts', () => {
  it('rejects a non-ui editor tab and invalid preview dimensions', () => {
    expect(() => UiEditorSessionSchema.parse({
      id: 'settings', filePath: 'settings', preview: { ...preview, width: 0 }, conversationId: 'conversation-a', createdAt: 1, updatedAt: 1,
    })).toThrow();
    expect(() => PreviewProfileSchema.parse({ ...preview, width: 0 })).toThrow();
  });

  it('requires complete, typed workspace file metadata', () => {
    expect(() => WorkspaceFileSchema.parse({ relativePath: 'ui/MainWindow.ui', kind: 'ui' })).toThrow();
    expect(WorkspaceFileSchema.parse({ absolutePath: 'D:/app/ui/MainWindow.ui', relativePath: 'ui/MainWindow.ui', kind: 'ui', size: 10, contentHash: 'sha256:x', modifiedAt: 1 })).toMatchObject({ kind: 'ui' });
  });
});

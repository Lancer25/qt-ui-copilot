import { describe, expect, it } from 'vitest';
import { artifactTabId, artifactTabsReducer, initialArtifactTabsState } from './artifact-tabs';

describe('artifactTabsReducer', () => {
  it('deduplicates preview tabs by normalized file path and promotes candidate previews', () => {
    const first = artifactTabsReducer(initialArtifactTabsState, { type: 'openPreview', filePath: 'D:/demo/Main.ui', temporary: true });
    const second = artifactTabsReducer(first, { type: 'openPreview', filePath: 'D:/demo/Main.ui', temporary: false });

    expect(second.tabs).toHaveLength(2);
    expect(second.tabs[1]).toMatchObject({ kind: 'preview', temporary: false });
    expect(second.activeTabId).toBe(artifactTabId('preview', 'D:/demo/Main.ui'));
  });

  it('uses one tab identity for source, diff and output artifacts', () => {
    const state = artifactTabsReducer(initialArtifactTabsState, { type: 'openArtifact', kind: 'source', filePath: 'D:/demo/Main.ui', title: 'Main.ui 源码' });
    const reopened = artifactTabsReducer(state, { type: 'openArtifact', kind: 'source', filePath: 'd:/DEMO/main.UI', title: '新的标题不应覆盖' });

    expect(reopened.tabs).toHaveLength(2);
    expect(reopened.tabs[1]).toMatchObject({ id: 'source:d:/demo/main.ui', title: 'Main.ui 源码' });
  });

  it('opens settings as one unique central workspace tab', () => {
    const first = artifactTabsReducer(initialArtifactTabsState, { type: 'openSettings' });
    const second = artifactTabsReducer(first, { type: 'openSettings' });

    expect(second.tabs).toHaveLength(2);
    expect(second.tabs[1]).toMatchObject({ id: 'settings:app', kind: 'settings', title: '设置' });
    expect(second.activeTabId).toBe('settings:app');
  });
});

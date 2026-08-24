import { describe, expect, it } from 'vitest';
import { closeTab, initialTabState, openTab, restoreTabs, serializeTabs, type AppTab } from './tab-model';

const workbench: AppTab = { id: 'workbench', kind: 'workbench', title: 'AI 工作台', closable: false };
const settings: AppTab = { id: 'settings', kind: 'settings', title: '设置', closable: true };

describe('tab model', () => {
  it('deduplicates a resource tab and focuses the existing tab', () => {
    const once = openTab({ tabs: [workbench], activeId: 'workbench' }, settings);
    const twice = openTab(once, settings);
    expect(twice.tabs).toEqual([workbench, settings]);
    expect(twice.activeId).toBe('settings');
  });

  it('never closes the fixed workbench tab', () => {
    expect(closeTab(initialTabState, 'workbench').tabs).toEqual([workbench]);
  });

  it('selects a neighboring tab after closing the active tab', () => {
    const ui: AppTab = { id: 'ui:/tmp/main.ui', kind: 'ui', title: 'main.ui', closable: true, projectId: 'p1', uiFile: '/tmp/main.ui' };
    const state = openTab(openTab(initialTabState, settings), ui);
    expect(closeTab(state, 'ui:/tmp/main.ui').activeId).toBe('settings');
  });

  it('restores only valid tabs and always keeps workbench', () => {
    const restored = restoreTabs(serializeTabs({ tabs: [settings, { id: 'broken', kind: 'task' } as unknown as AppTab], activeId: 'broken' as AppTab['id'] }));
    expect(restored.tabs).toEqual([workbench]);
    expect(restored.activeId).toBe('workbench');
  });

  it('returns a safe state for malformed persisted data', () => {
    expect(restoreTabs('{not-json')).toEqual(initialTabState);
    expect(restoreTabs({ tabs: 'bad', activeId: 'settings' })).toEqual(initialTabState);
  });
});

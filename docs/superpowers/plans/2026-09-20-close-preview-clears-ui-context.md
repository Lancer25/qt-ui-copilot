# Close Preview Clears UI Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the selected UI file when its preview tab closes so the AI task returns to creation mode and routes the next prompt correctly.

**Architecture:** Keep `selectedFile` as the explicit editing context used by `ArtifactContent`. Extend the existing tab-close handler to clear that context only when the closing preview path matches the selected file, using case-insensitive slash-normalized comparison.

**Tech Stack:** React, TypeScript, Testing Library, Vitest, Electron packaging

**Spec:** `docs/superpowers/specs/2026-09-20-close-preview-clears-ui-context-design.md`

## Global Constraints

- Preserve switching from an open UI preview to the AI task for follow-up adjustments.
- Closing source, diff, output, or settings tabs must not clear the selected UI file.
- Closing the selected UI preview must restore creation controls and `kind: create` request routing.
- Preserve temporary candidate dismissal behavior.

---

### Task 1: Add the preview-close regression test

**Files:**
- Modify: `apps/desktop/src/renderer/v3/V3App.test.tsx`

**Interfaces:**
- Consumes: the public V3 UI flow and `DesktopApi.ai.startTaskStream`.
- Produces: a regression test covering visible creation controls and the outgoing task kind.

- [ ] **Step 1: Add a failing integration test**

Add this test inside `describe('V3App')`:

```tsx
it('returns to creation mode after closing the selected UI preview', async () => {
  const startTaskStream = vi.fn(async () => ({ taskId: 'workspace:w' }));
  const closeApi = {
    ...api,
    ai: {
      startTaskStream,
      getTaskSnapshot: async () => undefined,
      onTaskEvent: () => () => {},
    },
  } as unknown as DesktopApi;
  const user = userEvent.setup();
  render(<V3App api={closeApi} />);

  await user.click(screen.getByRole('button', { name: '打开文件夹' }));
  await user.dblClick(screen.getByRole('treeitem', { name: /ui\/Settings\.ui/ }));
  await user.click(screen.getByRole('button', { name: '关闭 Settings.ui' }));

  expect(screen.getByRole('button', { name: /引用组件库/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: '完整应用' })).toBeTruthy();
  await user.type(screen.getByLabelText('发送给 AI'), '创建新的设置页面');
  await user.click(screen.getByRole('button', { name: '发送' }));
  await waitFor(() => expect(startTaskStream).toHaveBeenCalledWith(expect.objectContaining({ kind: 'create' })));
});
```

- [ ] **Step 2: Run the test and confirm the old behavior fails**

Run:

```powershell
pnpm --filter @qt-ui-copilot/desktop test -- V3App.test.tsx
```

Expected: FAIL because the component-library and full-application controls remain hidden after closing the preview.

---

### Task 2: Clear matching file context on close

**Files:**
- Modify: `apps/desktop/src/renderer/v3/V3App.tsx`
- Test: `apps/desktop/src/renderer/v3/V3App.test.tsx`

**Interfaces:**
- Consumes: `tab.kind`, `tab.filePath`, and `selectedFile.absolutePath` in `closeTab`.
- Produces: `selectedFile === undefined` only after closing its matching preview.

- [ ] **Step 1: Add a path identity helper**

Near the existing path helpers add:

```ts
const normalizedFilePath = (value: string): string => value.replaceAll('\\', '/').toLowerCase();
```

- [ ] **Step 2: Clear only matching preview context**

Expand `closeTab` with:

```ts
if (
  tab?.kind === 'preview'
  && selectedFile
  && normalizedFilePath(tab.filePath) === normalizedFilePath(selectedFile.absolutePath)
) {
  setSelectedFile(undefined);
}
```

Keep the existing candidate-dismissal, settings-activity, and reducer-dispatch statements unchanged.

- [ ] **Step 3: Run focused tests and type checking**

Run:

```powershell
pnpm --filter @qt-ui-copilot/desktop test -- V3App.test.tsx TaskComposer.test.tsx ArtifactTabs.test.tsx
pnpm --filter @qt-ui-copilot/desktop typecheck
git diff --check -- apps/desktop/src/renderer/v3/V3App.tsx apps/desktop/src/renderer/v3/V3App.test.tsx
```

Expected: all focused tests pass, TypeScript reports no errors, and the diff check is clean.

---

### Task 3: Package and verify the desktop flow

**Files:**
- Package output: `apps/desktop/out/qt-ui-copilot-preview-close-fix-win32-x64/`

**Interfaces:**
- Consumes: the fixed renderer production bundle.
- Produces: a runnable portable app verified through the open-preview-close-task flow.

- [ ] **Step 1: Build the portable application**

Run:

```powershell
$env:PORTABLE_OUTPUT='E:\workspace\AI\apps\desktop\out\qt-ui-copilot-preview-close-fix-win32-x64'
pnpm --filter @qt-ui-copilot/desktop package:portable
```

- [ ] **Step 2: Verify the real interaction**

Open the packaged app, open a project containing a `.ui` file, open and close that preview, then confirm the AI task displays the component-library, creation-type, and build controls without the empty footer shown in the bug screenshot.

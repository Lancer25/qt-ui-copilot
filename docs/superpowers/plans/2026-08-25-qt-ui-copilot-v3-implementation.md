# Qt UI Copilot V3 IDE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the V2 dashboard with a VS Code-style Qt UI IDE centered on per-file `.ui` tabs, real Qt quick/enhanced preview, and a persistent AI modification panel.

**Architecture:** Electron Main owns workspace scanning, file watching, preview sessions, AI context, candidate files, revisions, and native process lifecycles. The sandboxed React renderer becomes a resizable IDE shell with Explorer, file tabs, Qt Preview Editor, AI Assistant, bottom panel, and status bar. Existing Qt Kit, UI Document, PreviewHost, component library, model provider, QtUiProbe, and runtime verification services are reused rather than rewritten.

**Tech Stack:** Electron 40, React 19, TypeScript 5.8, Vite 5, Zod 4, Node SQLite, Vitest, Testing Library, Playwright Electron, Qt 5.9.6, Qt 6.10.2, C++11 native helpers.

**Spec:** `docs/superpowers/specs/2026-08-25-qt-ui-copilot-v3-design.md`

## Global Constraints

- V3 supports Qt Widgets `.ui` files; QML remains out of scope.
- Minimum Qt version is 5.9.6; Qt 5 and Qt 6 never share `uic`, `rcc`, PreviewHost binaries, or caches.
- A top editor tab represents one absolute `.ui` file path, not a settings/task/report page.
- Quick and enhanced preview use real Qt PreviewHost processes, never HTML emulation.
- Enhanced preview loads QSS, QRC, fonts, Qt Style, locale, and ABI-compatible Designer plugins.
- AI produces structured `UiOperation`; it cannot overwrite complete XML or execute arbitrary shell commands.
- Focused UI mode does not read the whole repository by default.
- Whole-project mode may retrieve C++/headers but V3 first release only auto-writes `.ui`.
- Approval and auto-apply modes run the same XML, semantic, `uic`, and preview validation.
- Renderer remains sandboxed with context isolation and no Node integration.
- API keys remain encrypted through Electron `safeStorage` and never reach Renderer.
- Preserve existing Qt5/Qt6 native gates and existing accepted project files.

---

## File Map

```text
apps/desktop/src/main/
├── workspace/workspace-service.ts
├── workspace/workspace-watcher.ts
├── preview/preview-session-service.ts
├── ai/context-service.ts
├── ai/conversation-service.ts
├── revisions/revision-service.ts
└── ipc/register-v3-ipc.ts

apps/desktop/src/renderer/v3/
├── V3App.tsx
├── shell/IdeShell.tsx
├── shell/ActivityBar.tsx
├── explorer/Explorer.tsx
├── editors/EditorTabs.tsx
├── editors/QtPreviewEditor.tsx
├── assistant/AiAssistant.tsx
├── assistant/PlanApproval.tsx
├── bottom-panel/BottomPanel.tsx
├── status-bar/V3StatusBar.tsx
├── state/v3-state.tsx
└── styles/v3.css

packages/task-store/src/v3-repository.ts
packages/contracts/src/v3.ts
```

V2 renderer pages stay available behind a temporary development flag until V3 completes the end-to-end gate. Production switches to `V3App` only after Task 11.

---

### Task 1: Define V3 contracts and persistence

**Files:**
- Create: `packages/contracts/src/v3.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/contracts/test/v3.test.ts`
- Modify: `packages/task-store/src/schema.ts`
- Create: `packages/task-store/src/v3-repository.ts`
- Create: `packages/task-store/test/v3-repository.test.ts`
- Modify: `packages/task-store/src/index.ts`

**Interfaces:**
- Produces `WorkspaceSummary`, `WorkspaceFile`, `UiEditorSession`, `PreviewProfile`, `AiContextMode`, `ApplyMode`, `UiRevision`, and `ConversationRecord`.
- Produces `V3Repository` CRUD methods used by all later tasks.

- [ ] **Step 1: Write failing contract and repository tests**

```ts
it('rejects a non-ui editor tab and invalid preview dimensions', () => {
  expect(() => UiEditorSessionSchema.parse({ id: 'settings', filePath: 'settings', preview: { mode: 'quick', width: 0, height: 640 } })).toThrow();
});

it('stores independent preview and conversation state per ui file', () => {
  const repository = new V3Repository(openDatabase(':memory:'));
  repository.saveEditorSession(sessionA);
  repository.saveEditorSession(sessionB);
  expect(repository.getEditorSession(sessionA.filePath)?.conversationId).toBe('conversation-a');
  expect(repository.getEditorSession(sessionB.filePath)?.preview.mode).toBe('enhanced');
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/contracts test -- v3.test.ts`

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/task-store test -- v3-repository.test.ts`

Expected: FAIL because V3 schemas and repository do not exist.

- [ ] **Step 3: Implement strict V3 contracts**

```ts
export const AiContextModeSchema = z.enum(['focused_ui', 'whole_project']);
export const ApplyModeSchema = z.enum(['approval', 'auto_apply']);
export const PreviewModeSchema = z.enum(['quick', 'enhanced']);

export const PreviewProfileSchema = z.object({
  qtKitId: z.string().min(1), mode: PreviewModeSchema,
  width: z.number().int().min(160).max(4096), height: z.number().int().min(120).max(4096),
  locale: z.string().min(2), style: z.string().min(1),
  qrcFiles: z.array(z.string()), stylesheets: z.array(z.string()),
  fonts: z.array(z.string()), pluginPaths: z.array(z.string()),
  highDpiMode: z.enum(['project-default', 'logical-96', 'system']),
}).strict();
```

Add SQLite tables `v3_workspaces`, `v3_editor_sessions`, `v3_conversations`, `v3_revisions`, and `v3_preferences`. Parse every JSON column with strict schemas on read and write.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/contracts test && corepack pnpm@10.15.0 --filter @qt-ui-copilot/task-store test`

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/task-store typecheck`

Expected: PASS.

- [ ] **Step 5: Commit contracts and storage**

```bash
git add packages/contracts packages/task-store
git commit -m "feat: add V3 workspace and editor persistence"
```

### Task 2: Implement workspace scanning and file watching

**Files:**
- Create: `apps/desktop/src/main/workspace/workspace-service.ts`
- Create: `apps/desktop/src/main/workspace/workspace-service.test.ts`
- Create: `apps/desktop/src/main/workspace/workspace-watcher.ts`
- Create: `apps/desktop/src/main/workspace/workspace-watcher.test.ts`
- Create: `apps/desktop/src/main/ipc/register-v3-ipc.ts`
- Modify: `apps/desktop/src/main/main.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/lib/api.ts`

**Interfaces:**
- Produces `WorkspaceService.open(rootDir): Promise<WorkspaceSummary>` and `listFiles(workspaceId): WorkspaceFile[]`.
- Produces `WorkspaceWatcher` events `created`, `changed`, `deleted`, and `renamed` with absolute paths and content hashes.
- Adds `v3.workspace.open`, `v3.workspace.listFiles`, and `v3.workspace.onChange` preload APIs.

- [ ] **Step 1: Write failing workspace tests**

```ts
it('indexes ui, qss, qrc and source files while excluding build and git directories', async () => {
  const workspace = await service.open(fixtureRoot);
  expect(workspace.files.map((file) => file.relativePath)).toEqual([
    'resources/common.qrc', 'resources/dark.qss', 'src/MainWindow.cpp', 'src/MainWindow.h', 'ui/MainWindow.ui',
  ]);
  expect(workspace.files.some((file) => file.relativePath.includes('build/'))).toBe(false);
});
```

- [ ] **Step 2: Verify tests fail**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- workspace-service.test.ts workspace-watcher.test.ts`

Expected: FAIL because services do not exist.

- [ ] **Step 3: Implement bounded scanning and watching**

Use `fs.promises.readdir({ withFileTypes: true })`, normalized absolute paths, content hashes for text files, and ignored directories `.git`, `.svn`, `node_modules`, `build`, `.qt-ui-copilot/build`, and user-configured patterns. Do not read binary contents into Renderer. Debounce duplicate filesystem events for 100 ms and tag app-owned writes with expected hashes.

- [ ] **Step 4: Run workspace, IPC, and type tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- workspace register-v3-ipc`

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop typecheck`

Expected: PASS with deterministic ordering and conflict events.

- [ ] **Step 5: Commit workspace services**

```bash
git add apps/desktop/src/main/workspace apps/desktop/src/main/ipc/register-v3-ipc.ts apps/desktop/src/main/main.ts apps/desktop/src/preload/index.ts apps/desktop/src/renderer/lib/api.ts
git commit -m "feat: add V3 Qt workspace service"
```

### Task 3: Build the V3 IDE shell and Explorer

**Files:**
- Create: `apps/desktop/src/renderer/v3/V3App.tsx`
- Create: `apps/desktop/src/renderer/v3/V3App.test.tsx`
- Create: `apps/desktop/src/renderer/v3/shell/IdeShell.tsx`
- Create: `apps/desktop/src/renderer/v3/shell/ActivityBar.tsx`
- Create: `apps/desktop/src/renderer/v3/explorer/Explorer.tsx`
- Create: `apps/desktop/src/renderer/v3/state/v3-state.tsx`
- Create: `apps/desktop/src/renderer/v3/styles/v3.css`
- Modify: `apps/desktop/src/renderer/main.tsx`

**Interfaces:**
- Produces `V3StateProvider`, `useV3State()`, and resizable IDE regions.
- Explorer emits `openFile(path, mode: 'preview' | 'permanent')`.

- [ ] **Step 1: Write failing shell and Explorer tests**

```tsx
it('opens a folder and renders the Qt project tree', async () => {
  render(<V3App api={fakeApi} />);
  await user.click(screen.getByRole('button', { name: '打开文件夹' }));
  expect(await screen.findByRole('treeitem', { name: 'Settings.ui' })).toBeTruthy();
});

it('keeps Explorer, editor, assistant and status regions independently addressable', () => {
  expect(screen.getByLabelText('项目文件')).toBeTruthy();
  expect(screen.getByLabelText('Qt 预览编辑器')).toBeTruthy();
  expect(screen.getByLabelText('AI 助手')).toBeTruthy();
});
```

- [ ] **Step 2: Verify renderer tests fail**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- V3App.test.tsx`

Expected: FAIL because V3 renderer does not exist.

- [ ] **Step 3: Implement the confirmed IDE layout**

Use CSS grid columns `46px`, persisted Explorer width, `minmax(420px, 1fr)`, and persisted assistant width. Use pointer capture for splitters; clamp Explorer to 160–420 px and assistant to 260–560 px. Fix body/root to viewport height; only Explorer, active editor, assistant messages, and bottom panel scroll.

- [ ] **Step 4: Run tests at 100%, 125%, 150%, and 200% viewport fixtures**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- V3App IdeShell Explorer`

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop typecheck`

Expected: PASS without outer document scroll.

- [ ] **Step 5: Commit V3 shell**

```bash
git add apps/desktop/src/renderer/v3 apps/desktop/src/renderer/main.tsx
git commit -m "feat: add V3 IDE shell and Explorer"
```

### Task 4: Implement `.ui` file tabs and editor sessions

**Files:**
- Create: `apps/desktop/src/renderer/v3/editors/EditorTabs.tsx`
- Create: `apps/desktop/src/renderer/v3/editors/editor-tabs.test.tsx`
- Create: `apps/desktop/src/renderer/v3/editors/editor-session.ts`
- Create: `apps/desktop/src/renderer/v3/editors/editor-session.test.ts`
- Modify: `apps/desktop/src/renderer/v3/state/v3-state.tsx`
- Modify: `apps/desktop/src/renderer/v3/explorer/Explorer.tsx`

**Interfaces:**
- Produces `openUiFile(filePath, permanent)`, `activateEditor(editorId)`, `closeEditor(editorId)`, and `markDirty(editorId, dirty)`.
- Guarantees one editor per normalized absolute path.

- [ ] **Step 1: Write failing tab behavior tests**

```ts
it('reuses a preview tab and deduplicates permanent ui tabs', () => {
  let state = openUiFile(initialState, 'A.ui', false);
  state = openUiFile(state, 'B.ui', false);
  expect(state.editors.map((editor) => editor.filePath)).toEqual(['B.ui']);
  state = openUiFile(state, 'B.ui', true);
  state = openUiFile(state, 'B.ui', true);
  expect(state.editors).toHaveLength(1);
});
```

- [ ] **Step 2: Verify tests fail**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- editor-session editor-tabs`

Expected: FAIL because session reducer does not exist.

- [ ] **Step 3: Implement file-only tabs and dirty-close confirmation**

Normalize Windows path casing for identity but retain display path. Restore only `.ui` editors that still belong to the active workspace. Settings, tasks, and reports never enter `EditorTabs`. Add accessible close names and keyboard behavior for `Ctrl+W`, `Ctrl+Tab`, and `Ctrl+Shift+Tab`.

- [ ] **Step 4: Run tab and persistence tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- editor-session editor-tabs v3-repository`

Expected: PASS.

- [ ] **Step 5: Commit editor tabs**

```bash
git add apps/desktop/src/renderer/v3/editors apps/desktop/src/renderer/v3/state apps/desktop/src/renderer/v3/explorer
git commit -m "feat: add per-file V3 UI editor tabs"
```

### Task 5: Add quick and enhanced preview sessions

**Files:**
- Create: `apps/desktop/src/main/preview/preview-session-service.ts`
- Create: `apps/desktop/src/main/preview/preview-session-service.test.ts`
- Modify: `apps/desktop/src/main/ipc/register-v3-ipc.ts`
- Create: `apps/desktop/src/renderer/v3/editors/QtPreviewEditor.tsx`
- Create: `apps/desktop/src/renderer/v3/editors/QtPreviewEditor.test.tsx`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/lib/api.ts`

**Interfaces:**
- Produces `PreviewSessionService.render(input): Promise<PreviewResult>` and `invalidate(changedPath)`.
- Adds `v3.preview.render`, `v3.preview.cancel`, and `v3.preview.onInvalidated` APIs.

- [ ] **Step 1: Write failing preview-profile tests**

```ts
it('uses a minimal profile for quick preview and project resources for enhanced preview', async () => {
  await service.render({ ...input, profile: { ...profile, mode: 'quick' } });
  expect(client.requests[0]).toMatchObject({ qrcFiles: [], stylesheets: [], fonts: [], pluginPaths: [] });
  await service.render({ ...input, profile: { ...profile, mode: 'enhanced' } });
  expect(client.requests[1].qrcFiles).toContain('resources/common.qrc');
  expect(client.requests[1].stylesheets).toContain('resources/dark.qss');
});
```

- [ ] **Step 2: Verify preview tests fail**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- preview-session-service QtPreviewEditor`

Expected: FAIL because service and editor do not exist.

- [ ] **Step 3: Compose existing PreviewHostBuilder and PreviewClient**

Maintain one cancellable request sequence per editor. Build cache keys from Qt Kit, ABI, architecture, `.ui` hash, resource hashes, and profile. Return `imageDataUrl`, `findings`, `loadedResources`, `degradedFeatures`, `widgetGeometry`, `confidence`, and elapsed timing. Never share Qt5 and Qt6 cache entries.

- [ ] **Step 4: Run preview tests and native gates**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- preview-session-service QtPreviewEditor`

Run: `$env:QT59_CMAKE_PREFIX_PATH='D:\Qt5.9.6\5.9.6\msvc2017_64'; corepack pnpm@10.15.0 test:native:qt59`

Run: `$env:QT6_CMAKE_PREFIX_PATH='D:\Qt6.10.2\6.10.2\msvc2022_64'; corepack pnpm@10.15.0 test:native:qt6`

Expected: PASS for both native matrices.

- [ ] **Step 5: Commit dual preview**

```bash
git add apps/desktop/src/main/preview apps/desktop/src/main/ipc/register-v3-ipc.ts apps/desktop/src/renderer/v3/editors apps/desktop/src/preload/index.ts apps/desktop/src/renderer/lib/api.ts
git commit -m "feat: add V3 quick and enhanced Qt preview"
```

### Task 6: Implement AI context modes and tool approval

**Files:**
- Create: `apps/desktop/src/main/ai/context-service.ts`
- Create: `apps/desktop/src/main/ai/context-service.test.ts`
- Create: `apps/desktop/src/main/ai/conversation-service.ts`
- Create: `apps/desktop/src/main/ai/conversation-service.test.ts`
- Modify: `apps/desktop/src/main/ipc/register-v3-ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/lib/api.ts`

**Interfaces:**
- Produces `ContextService.buildFocusedUiContext`, `searchWholeProject`, and `approveReadRequest`.
- Produces streamed conversation events `message_delta`, `tool_request`, `plan`, `error`, and `done`.

- [ ] **Step 1: Write failing context-boundary tests**

```ts
it('does not include unrelated source in focused UI mode', async () => {
  const context = await service.buildFocusedUiContext(settingsUi);
  expect(JSON.stringify(context)).toContain('Settings.ui');
  expect(JSON.stringify(context)).toContain('dark.qss');
  expect(JSON.stringify(context)).not.toContain('BillingEngine.cpp');
});

it('requires approval before focused mode reads a requested header', async () => {
  const request = await service.requestRelatedFileRead('src/SettingsController.h', 'Need signal names');
  await expect(service.readRequestedFile(request.id)).rejects.toThrow('approval');
});
```

- [ ] **Step 2: Verify tests fail**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- context-service conversation-service`

Expected: FAIL because AI V3 services do not exist.

- [ ] **Step 3: Implement focused and whole-project retrieval**

Focused context contains semantic `.ui` summary, Preview Profile, resource summaries, up to three component candidates, and recent validation. Whole-project retrieval searches filenames, symbols, text index, and optional vector Adapter, then reads only bounded hits. Persist file paths and hashes in conversation metadata, not unrestricted project dumps.

- [ ] **Step 4: Run security, redaction, and mode tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- context-service conversation-service register-v3-ipc`

Expected: PASS with no API key or unauthorized file contents in Renderer events.

- [ ] **Step 5: Commit AI context services**

```bash
git add apps/desktop/src/main/ai apps/desktop/src/main/ipc/register-v3-ipc.ts apps/desktop/src/preload/index.ts apps/desktop/src/renderer/lib/api.ts
git commit -m "feat: add V3 AI context modes"
```

### Task 7: Build the persistent AI Assistant panel

**Files:**
- Create: `apps/desktop/src/renderer/v3/assistant/AiAssistant.tsx`
- Create: `apps/desktop/src/renderer/v3/assistant/AiAssistant.test.tsx`
- Create: `apps/desktop/src/renderer/v3/assistant/ConversationView.tsx`
- Create: `apps/desktop/src/renderer/v3/assistant/ContextSummary.tsx`
- Create: `apps/desktop/src/renderer/v3/assistant/PlanApproval.tsx`
- Modify: `apps/desktop/src/renderer/v3/state/v3-state.tsx`
- Modify: `apps/desktop/src/renderer/v3/shell/IdeShell.tsx`

**Interfaces:**
- Consumes Task 6 conversation stream.
- Produces per-editor conversation UI, context/apply mode switches, and approval events.

- [ ] **Step 1: Write failing per-editor conversation tests**

```tsx
it('switches conversations when active ui tab changes', async () => {
  render(<V3Harness editors={[settings, login]} />);
  expect(screen.getByText('Settings conversation')).toBeTruthy();
  await user.click(screen.getByRole('tab', { name: 'Login.ui' }));
  expect(screen.getByText('Login conversation')).toBeTruthy();
  expect(screen.queryByText('Settings conversation')).toBeNull();
});
```

- [ ] **Step 2: Verify Assistant tests fail**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- AiAssistant`

Expected: FAIL because panel does not exist.

- [ ] **Step 3: Implement persistent right-side assistant**

Render messages, streaming state, stop/retry, context summary, focused/whole-project toggle, approval/auto-apply toggle, structured plan, risk, operations, candidate Diff, apply/reject buttons, and tool-read requests. Disable mode changes while an application transaction is committing.

- [ ] **Step 4: Run assistant interaction and accessibility tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- AiAssistant PlanApproval ContextSummary`

Expected: PASS with keyboard navigation and scoped announcements.

- [ ] **Step 5: Commit assistant UI**

```bash
git add apps/desktop/src/renderer/v3/assistant apps/desktop/src/renderer/v3/state apps/desktop/src/renderer/v3/shell
git commit -m "feat: add V3 persistent AI assistant"
```

### Task 8: Add revisions, candidate transactions, undo, and redo

**Files:**
- Create: `apps/desktop/src/main/revisions/revision-service.ts`
- Create: `apps/desktop/src/main/revisions/revision-service.test.ts`
- Modify: `apps/desktop/src/main/ipc/register-v3-ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/lib/api.ts`
- Create: `apps/desktop/src/renderer/v3/editors/RevisionControls.tsx`
- Create: `apps/desktop/src/renderer/v3/editors/RevisionControls.test.tsx`

**Interfaces:**
- Produces `createCandidate`, `commitCandidate`, `rejectCandidate`, `undo`, `redo`, and `rebaseAfterExternalChange`.
- Returns validation and preview evidence for every committed revision.

- [ ] **Step 1: Write failing transactional tests**

```ts
it('leaves the source unchanged when uic rejects a candidate', async () => {
  const before = await readFile(uiFile, 'utf8');
  await expect(service.apply(uiFile, invalidOperations)).rejects.toThrow('uic');
  expect(await readFile(uiFile, 'utf8')).toBe(before);
});

it('undoes and redoes committed revisions without losing the conversation link', async () => {
  const revision = await service.apply(uiFile, operations, conversationId);
  await service.undo(uiFile);
  await service.redo(uiFile);
  expect(service.current(uiFile)?.id).toBe(revision.id);
  expect(service.current(uiFile)?.conversationId).toBe(conversationId);
});
```

- [ ] **Step 2: Verify revision tests fail**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- revision-service RevisionControls`

Expected: FAIL because revision service does not exist.

- [ ] **Step 3: Compose CandidateFile, UiOperation, uic, and preview validation**

Stage under `.qt-ui-copilot/v3/candidates/<transactionId>`, validate without mutating source, atomically replace the file only after success, then persist hashes, operations, conversation ID, validation, and preview evidence. Undo/redo are new validated revisions, never blind file copies across external baselines.

- [ ] **Step 4: Run revision, conflict, and filesystem tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- revision-service workspace-watcher RevisionControls`

Expected: PASS for invalid candidate, undo, redo, delete, external change, and rebase cases.

- [ ] **Step 5: Commit revisions**

```bash
git add apps/desktop/src/main/revisions apps/desktop/src/main/ipc/register-v3-ipc.ts apps/desktop/src/preload/index.ts apps/desktop/src/renderer/lib/api.ts apps/desktop/src/renderer/v3/editors
git commit -m "feat: add V3 validated UI revisions"
```

### Task 9: Implement approval and auto-apply modification flow

**Files:**
- Modify: `apps/desktop/src/main/ai/conversation-service.ts`
- Modify: `apps/desktop/src/main/revisions/revision-service.ts`
- Modify: `apps/desktop/src/main/ipc/register-v3-ipc.ts`
- Modify: `apps/desktop/src/renderer/v3/assistant/AiAssistant.tsx`
- Modify: `apps/desktop/src/renderer/v3/assistant/PlanApproval.tsx`
- Create: `apps/desktop/src/main/ai/apply-flow.test.ts`

**Interfaces:**
- Produces state machine `idle → planning → waiting_approval|applying → validating → previewing → completed|failed`.
- Approval and auto-apply share one `applyPlan(plan, editorSession)` implementation.

- [ ] **Step 1: Write failing shared-validation tests**

```ts
it.each(['approval', 'auto_apply'] as const)('uses identical validation in %s mode', async (mode) => {
  const result = await harness.run({ mode, plan: validPlan, approve: mode === 'approval' });
  expect(result.steps).toEqual(['schema', 'xml', 'semantic', 'uic', 'preview', 'commit']);
});
```

- [ ] **Step 2: Verify apply-flow tests fail**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- apply-flow`

Expected: FAIL because V3 apply state machine does not exist.

- [ ] **Step 3: Implement one bounded apply state machine**

Approval mode stops at `waiting_approval`; auto-apply enters `applying` immediately. Both enforce operation count, input size, one format repair, cancellation, candidate isolation, validation, preview refresh, and source hash precondition. Publish metadata-only progress to Renderer.

- [ ] **Step 4: Run approval, auto-apply, cancel, and failure tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- apply-flow AiAssistant revision-service`

Expected: PASS with unchanged source on every failed scenario.

- [ ] **Step 5: Commit apply flow**

```bash
git add apps/desktop/src/main/ai apps/desktop/src/main/revisions apps/desktop/src/main/ipc/register-v3-ipc.ts apps/desktop/src/renderer/v3/assistant
git commit -m "feat: add V3 approval and auto-apply flow"
```

### Task 10: Add bottom panel, resource diagnostics, and optional runtime verification

**Files:**
- Create: `apps/desktop/src/renderer/v3/bottom-panel/BottomPanel.tsx`
- Create: `apps/desktop/src/renderer/v3/bottom-panel/BottomPanel.test.tsx`
- Create: `apps/desktop/src/renderer/v3/bottom-panel/ProblemsView.tsx`
- Create: `apps/desktop/src/renderer/v3/bottom-panel/OutputView.tsx`
- Create: `apps/desktop/src/renderer/v3/bottom-panel/DiffView.tsx`
- Create: `apps/desktop/src/renderer/v3/bottom-panel/ResourcesView.tsx`
- Create: `apps/desktop/src/renderer/v3/bottom-panel/RuntimeView.tsx`
- Modify: `apps/desktop/src/renderer/v3/shell/IdeShell.tsx`
- Modify: `apps/desktop/src/main/ipc/register-v3-ipc.ts`

**Interfaces:**
- Consumes preview findings, revision Diff, loaded resources, and existing runtime verification states.
- Produces collapsible, resizable auxiliary views without duplicating AI plan controls.

- [ ] **Step 1: Write failing panel-routing tests**

```tsx
it('opens Problems for uic failures and Resources for degraded enhanced preview', async () => {
  render(<BottomPanelHarness />);
  emit({ kind: 'uic_error', message: 'unknown widget' });
  expect(screen.getByRole('tab', { name: 'Problems' }).getAttribute('aria-selected')).toBe('true');
  emit({ kind: 'preview_degraded', resource: 'dark.qss' });
  await user.click(screen.getByRole('tab', { name: 'Resources' }));
  expect(screen.getByText('dark.qss')).toBeTruthy();
});
```

- [ ] **Step 2: Verify panel tests fail**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- BottomPanel`

Expected: FAIL because V3 bottom panel does not exist.

- [ ] **Step 3: Implement auxiliary views and runtime trigger**

Persist active view and height. Route deterministic failures to Problems; metadata-only logs to Output; candidate/revision changes to Diff; QSS/QRC/font/plugin state to Resources. Runtime view calls the existing build, RuntimeSession, RouteRunner, QtUiProbe, and evidence services for the active editor.

- [ ] **Step 4: Run panel and runtime integration tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- BottomPanel RuntimeView register-v3-ipc`

Expected: PASS without outer document scrolling.

- [ ] **Step 5: Commit bottom panel and runtime integration**

```bash
git add apps/desktop/src/renderer/v3/bottom-panel apps/desktop/src/renderer/v3/shell/IdeShell.tsx apps/desktop/src/main/ipc/register-v3-ipc.ts
git commit -m "feat: add V3 diagnostics and runtime panel"
```

### Task 11: Switch production to V3 and migrate V2 data

**Files:**
- Create: `apps/desktop/src/main/v3-migration.ts`
- Create: `apps/desktop/src/main/v3-migration.test.ts`
- Modify: `apps/desktop/src/renderer/main.tsx`
- Modify: `apps/desktop/src/main/main.ts`
- Modify: `apps/desktop/src/renderer/app.css`
- Modify: `apps/desktop/src/renderer/test/FakeDesktopApi.ts`

**Interfaces:**
- Produces idempotent migration of recent workspace, Qt Kit, project profile, task/report references, and model settings.
- Makes `V3App` the production root while retaining V2 data read compatibility.

- [ ] **Step 1: Write failing migration and root tests**

```ts
it('migrates a V2 project to one V3 workspace exactly once', () => {
  migrateToV3(database);
  migrateToV3(database);
  expect(new V3Repository(database).listWorkspaces()).toHaveLength(1);
});

it('renders V3App as the production root', () => {
  expect(screen.getByLabelText('项目文件')).toBeTruthy();
  expect(screen.queryByText('验证报告')).toBeNull();
});
```

- [ ] **Step 2: Verify migration tests fail**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- v3-migration V3App`

Expected: FAIL before root switch.

- [ ] **Step 3: Implement idempotent migration and remove V2 root routing**

Migrate metadata without altering user project files. Keep V2 task/artifact tables readable from Runtime/History views. Remove V2 dashboard navigation and CSS from production imports only after V3 tests cover model settings, Qt Kits, project opening, preview, AI planning, apply, undo, and report evidence.

- [ ] **Step 4: Run complete JavaScript/TypeScript regression**

Run: `corepack pnpm@10.15.0 test`

Run: `corepack pnpm@10.15.0 typecheck`

Expected: PASS across all workspace packages.

- [ ] **Step 5: Commit production switch**

```bash
git add apps/desktop/src/main apps/desktop/src/renderer packages/task-store
git commit -m "feat: switch Qt UI Copilot to V3 IDE"
```

### Task 12: V3 E2E, native matrix, packaging, and documentation

**Files:**
- Create: `tests/e2e/v3-ide.spec.ts`
- Modify: `tests/e2e/helpers.ts`
- Modify: `scripts/run-e2e.mjs`
- Modify: `README.md`
- Create: `docs/v3-user-guide.md`
- Modify: `apps/desktop/scripts/package-portable.mjs`

**Interfaces:**
- Produces repeatable evidence for folder open, `.ui` tabs, both preview modes, focused/whole-project context, approval/auto-apply, undo/redo, and Qt5/Qt6 runtime verification.

- [ ] **Step 1: Add failing V3 Playwright flows**

```ts
test('opens a Qt folder, previews Settings.ui, and applies an AI change', async ({ page }) => {
  await page.getByRole('button', { name: '打开文件夹' }).click();
  await page.getByRole('treeitem', { name: 'Settings.ui' }).dblclick();
  await expect(page.getByRole('tab', { name: 'Settings.ui' })).toBeVisible();
  await page.getByRole('button', { name: '增强预览' }).click();
  await expect(page.getByText('common.qrc')).toBeVisible();
  await page.getByLabel('AI 输入').fill('增加测试连接按钮');
  await page.getByRole('button', { name: '应用修改' }).click();
  await expect(page.getByText('uic 校验通过')).toBeVisible();
});
```

- [ ] **Step 2: Run V3 E2E and capture the first failing boundary**

Run: `$env:QT_UI_COPILOT_E2E='1'; corepack pnpm@10.15.0 exec playwright test tests/e2e/v3-ide.spec.ts`

Expected: FAIL at the first incomplete V3 integration without modifying source fixtures.

- [ ] **Step 3: Fix E2E-only integration gaps and write the guide**

Use isolated fixture copies and stable accessible selectors. Document folder opening, tabs, preview modes, context modes, apply modes, revisions, resources, runtime verification, Qt Kit setup, model setup, and package location. Do not add test-only production behavior.

- [ ] **Step 4: Run the final qualification matrix**

Run: `corepack pnpm@10.15.0 test`

Run: `corepack pnpm@10.15.0 typecheck`

Run: `$env:QT59_CMAKE_PREFIX_PATH='D:\Qt5.9.6\5.9.6\msvc2017_64'; corepack pnpm@10.15.0 test:native:qt59`

Run: `$env:QT6_CMAKE_PREFIX_PATH='D:\Qt6.10.2\6.10.2\msvc2022_64'; corepack pnpm@10.15.0 test:native:qt6`

Run: `$env:QT_UI_COPILOT_E2E='1'; corepack pnpm@10.15.0 test:e2e`

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop package:portable`

Expected: all tests and native gates pass; the portable executable launches and renders V3.

- [ ] **Step 5: Commit V3 qualification and documentation**

```bash
git add tests/e2e scripts/run-e2e.mjs README.md docs/v3-user-guide.md apps/desktop/scripts/package-portable.mjs
git commit -m "test: qualify Qt UI Copilot V3"
```

---

## Completion Gate

V3 is complete only when:

- Production starts in the confirmed IDE shell, not the V2 dashboard.
- Opening a folder populates Explorer with filtered real project files.
- Double-clicking `.ui` opens one deduplicated file tab.
- Quick and enhanced preview both use the selected target Qt Kit.
- Enhanced preview reports QSS/QRC/font/plugin load and degradation state.
- Focused UI mode does not read unrelated project source without approval.
- Whole-project mode performs bounded retrieval and displays context scope.
- Approval and auto-apply share deterministic validation.
- Failed AI changes never alter the source file.
- Revisions support Diff, undo, redo, and external-conflict rebase.
- Optional runtime verification still works with QtUiProbe.
- Qt 5.9.6 and Qt 6.x native gates pass.
- V3 Electron E2E passes and the portable package launches successfully.

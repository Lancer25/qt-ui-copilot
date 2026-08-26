# V3 Project Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat V3 `.ui` list with a safe VS Code-style project tree supporting creation, rename, recycle-bin deletion, permanent deletion, filtering, decorations and AI context.

**Architecture:** Main owns tree construction and all filesystem mutations behind strict workspace-relative schemas. Renderer consumes immutable tree snapshots and watcher events, while separate services provide Git/AI decorations and context scopes.

**Tech Stack:** TypeScript, Zod, Electron shell/IPC, React, Vitest, Playwright, Windows/Linux filesystem APIs.

**Spec:** `docs/superpowers/specs/2026-08-26-v3-project-explorer-design.md`

## Global Constraints

- Renderer never accesses Node filesystem APIs.
- Delete defaults to OS recycle bin; permanent delete is explicit and irreversible.
- Workspace root, `.git`, project profile and active AI candidates are protected.
- All mutations revalidate real paths and symbolic-link boundaries in Main.
- Internal candidate/build/cache paths are hidden by default.

---

### Task 1: Tree Contracts and Builder

**Files:**
- Create: `packages/contracts/src/workspace-tree.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/desktop/src/main/workspace/workspace-tree-service.ts`
- Test: `apps/desktop/src/main/workspace/workspace-tree-service.test.ts`

**Interfaces:**
- Produces `WorkspaceTreeNodeSchema`, `WorkspaceTreeSnapshotSchema`.
- Produces `WorkspaceTreeService.build(workspaceId, { showInternal }): Promise<WorkspaceTreeSnapshot>`.

- [ ] Write failing tests for directory-first stable sorting, file-kind icons, hidden internal paths and showInternal.
- [ ] Implement recursive tree construction from workspace root, excluding `.git` always and tool internals by default.
- [ ] Ensure `.qt-ui-copilot/project.json` never counts as a project file.
- [ ] Run workspace tests and commit:

```bash
git add packages/contracts apps/desktop/src/main/workspace/workspace-tree-service*
git commit -m "feat: build V3 workspace directory trees"
```

### Task 2: Secure File Operations

**Files:**
- Create: `apps/desktop/src/main/workspace/workspace-file-operations.ts`
- Test: `apps/desktop/src/main/workspace/workspace-file-operations.test.ts`
- Modify: `apps/desktop/src/main/workspace/workspace-service.ts`

**Interfaces:**
- Produces `createFile`, `createDirectory`, `renameEntry`, `trashEntry`, `deleteEntryPermanently`, `revealEntry`.

- [ ] Write failing tests for path traversal, absolute paths, Windows reserved names, collisions, symlink/junction escape and protected paths.
- [ ] Implement shared `resolveSafeEntry(workspaceId, relativePath)` using `resolve`, `relative`, `lstat` and realpath checks.
- [ ] Create files with exclusive `wx`; create directories without overwriting.
- [ ] Rename without replacing existing targets.
- [ ] Use injected `trashItem` for recycle-bin deletion.
- [ ] Permanently delete files with unlink and directories with verified recursive removal only after exact-name confirmation.
- [ ] Run tests and commit:

```bash
git add apps/desktop/src/main/workspace
git commit -m "feat: add protected Explorer file operations"
```

### Task 3: IPC, Preload and Tab Synchronization

**Files:**
- Modify: `apps/desktop/src/main/ipc/register-v3-ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/lib/api.ts`
- Modify: `apps/desktop/src/renderer/v3/state/v3-state.tsx`
- Test: `apps/desktop/src/main/ipc/register-v3-ipc.test.ts`
- Test: `apps/desktop/src/renderer/v3/state/v3-state.test.tsx`

**Interfaces:**
- IPC methods exactly match the spec file-operation API.
- Adds renderer actions `renamePath`, `deletePath`, `replaceTree`.

- [ ] Write failing IPC schema tests and state reducer tests for rename/delete of open tabs.
- [ ] Register strict handlers and preload APIs.
- [ ] After rename, update editor IDs, file paths and titles.
- [ ] After delete, close affected file/directory tabs and clear active editor if required.
- [ ] Run IPC/preload/state tests and commit:

```bash
git add apps/desktop/src/main/ipc/register-v3-ipc* apps/desktop/src/preload/index.ts apps/desktop/src/renderer/lib/api.ts apps/desktop/src/renderer/v3/state
git commit -m "feat: expose Explorer operations over V3 IPC"
```

### Task 4: Hierarchical Explorer UI

**Files:**
- Create: `apps/desktop/src/renderer/v3/explorer/ProjectExplorer.tsx`
- Create: `apps/desktop/src/renderer/v3/explorer/ExplorerTreeNode.tsx`
- Create: `apps/desktop/src/renderer/v3/explorer/ExplorerToolbar.tsx`
- Test: `apps/desktop/src/renderer/v3/explorer/ProjectExplorer.test.tsx`
- Modify: `apps/desktop/src/renderer/v3/V3App.tsx`
- Modify: `apps/desktop/src/renderer/v3/styles/v3.css`

**Interfaces:**
- Consumes tree snapshot, active path and DesktopApi workspace operations.
- Emits open/preview/fixed-tab events to V3 state.

- [ ] Write failing tests for hierarchy, expand/collapse, filter ancestor preservation, single/double click and long-name tooltip.
- [ ] Implement toolbar: new file, new folder, refresh, collapse-all and show-internal toggle.
- [ ] Persist expanded relative paths per workspace in localStorage.
- [ ] Implement roving tabindex and arrow-key navigation.
- [ ] Replace V3App flat renderExplorer implementation.
- [ ] Run renderer/accessibility tests and commit:

```bash
git add apps/desktop/src/renderer/v3/explorer apps/desktop/src/renderer/v3/V3App.tsx apps/desktop/src/renderer/v3/styles/v3.css
git commit -m "feat: add hierarchical V3 Project Explorer"
```

### Task 5: Context Menu and Destructive Confirmations

**Files:**
- Create: `apps/desktop/src/renderer/v3/explorer/ExplorerContextMenu.tsx`
- Create: `apps/desktop/src/renderer/v3/explorer/DeleteEntryDialog.tsx`
- Test: `apps/desktop/src/renderer/v3/explorer/DeleteEntryDialog.test.tsx`
- Modify: `apps/desktop/src/renderer/v3/explorer/ProjectExplorer.tsx`

**Interfaces:**
- Provides normal recycle-bin delete and permanent delete modes.

- [ ] Write failing tests for menu actions, Escape/focus return, file confirmation and non-empty-directory name confirmation.
- [ ] Add context actions from the spec, grouped with permanent delete in a danger section.
- [ ] Implement `Delete` and `Shift+Delete` shortcuts.
- [ ] Show descendant counts for directories before deletion.
- [ ] Keep dialogs open and show inline errors when Main rejects an operation.
- [ ] Run renderer tests and commit:

```bash
git add apps/desktop/src/renderer/v3/explorer
git commit -m "feat: add safe and permanent Explorer deletion"
```

### Task 6: Git, AI and Diagnostic Decorations

**Files:**
- Create: `apps/desktop/src/main/workspace/workspace-decoration-service.ts`
- Create: `apps/desktop/src/renderer/v3/explorer/ExplorerDecorations.tsx`
- Test: `apps/desktop/src/main/workspace/workspace-decoration-service.test.ts`
- Modify: `apps/desktop/src/main/ipc/register-v3-ipc.ts`
- Modify: `apps/desktop/src/renderer/v3/explorer/ExplorerTreeNode.tsx`

**Interfaces:**
- Produces bounded decorations keyed by normalized relative path.

- [ ] Write failing parser tests for NUL-delimited `git status --porcelain=v1 -z` output.
- [ ] Add AI-created/modified decorations from creation and revision events.
- [ ] Add warning/error decorations from Problems findings.
- [ ] Gracefully return no Git decorations outside a repository or without git.
- [ ] Run tests and commit:

```bash
git add apps/desktop/src/main/workspace apps/desktop/src/main/ipc/register-v3-ipc.ts apps/desktop/src/renderer/v3/explorer
git commit -m "feat: decorate Explorer with Git and AI state"
```

### Task 7: AI Context and Cross-Platform Qualification

**Files:**
- Create: `apps/desktop/src/renderer/v3/explorer/explorer-context.ts`
- Test: `apps/desktop/src/renderer/v3/explorer/explorer-context.test.ts`
- Modify: `apps/desktop/src/renderer/v3/V3App.tsx`
- Modify: `tests/e2e/v3-ide.spec.ts`
- Modify: `docs/v3-user-guide.md`

**Interfaces:**
- Maintains explicit file hashes and lazy directory scopes for AI context.

- [ ] Write tests for add/remove, rename/delete synchronization and lazy directory scope.
- [ ] Wire context-menu and drag-to-assistant actions.
- [ ] Add Windows E2E for create, rename, recycle delete and permanent delete.
- [ ] Add Linux-compatible unit gates for path normalization and permission errors.
- [ ] Run full qualification:

```powershell
corepack pnpm@10.15.0 typecheck
corepack pnpm@10.15.0 test
$env:QT_UI_COPILOT_E2E='1'; corepack pnpm@10.15.0 test:e2e
```

- [ ] Update docs and commit:

```bash
git add apps/desktop/src/renderer/v3 tests/e2e/v3-ide.spec.ts docs/v3-user-guide.md
git commit -m "test: qualify V3 Project Explorer"
```

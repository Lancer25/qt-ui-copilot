# Application-wide UI UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a consistent, responsive, accessible visual and interaction system across the Qt UI Copilot shell, task workflow, component library, settings, preview, history, explorer, and source viewer.

**Architecture:** Keep the existing activity/sidebar/tab architecture, but make sidebar presence explicit per activity and move repeated visual rules into `workspace-polish.css`. Add small focused component APIs for starter prompts, friendly component errors, settings navigation, and source-viewer utilities rather than introducing a new state framework.

**Tech Stack:** React 19, TypeScript, CSS, Vitest, Testing Library, Playwright Electron

**Spec:** `docs/superpowers/specs/2026-09-19-application-ui-ux-audit-design.md`

## Global Constraints

- Existing task, preview, component-source, project, and settings behavior must remain functional.
- Settings must not display an unrelated contextual sidebar.
- Raw Electron IPC error prefixes must never reach visible component-preview errors.
- All new icon-only actions require `aria-label` and tooltip.
- Layouts must remain usable at 1600×1000, 1366×768, and 1100×720.

---

### Task 1: Correct Shell Navigation and Sidebar Modes

**Files:**
- Modify: `apps/desktop/src/renderer/v3/shell/WorkspaceShell.tsx`
- Modify: `apps/desktop/src/renderer/v3/V3App.tsx`
- Modify: `apps/desktop/src/renderer/v3/V3App.test.tsx`
- Modify: `apps/desktop/src/renderer/v3/styles/v3.css`
- Modify: `apps/desktop/src/renderer/v3/styles/workspace-polish.css`

**Interfaces:**
- Produces: `WorkspaceShell.sidebar?: ReactNode` and `.has-no-sidebar` layout mode.
- Consumes: existing `WorkspaceActivity` and artifact tab reducer.

- [ ] Add a failing V3App test that opens Settings after Task History and asserts Settings is active while the `任务历史` sidebar is absent.
- [ ] Make `sidebar` optional; omit the sidebar `<aside>` and apply `has-no-sidebar` when absent.
- [ ] Change the settings activity handler to set `activity='settings'` before opening the settings tab.
- [ ] Return `undefined` for the settings sidebar and preserve normal sidebars for explorer, tasks, search, and components.
- [ ] Add responsive shell columns: activity rail 46px, sidebar `clamp(220px,19vw,296px)`, no-sidebar `46px minmax(0,1fr)`.
- [ ] Add global 8px dark-theme scrollbar styling and keep activity/tab focus rings visible.
- [ ] Run V3App, WorkspaceShell-related tests, and typecheck.

### Task 2: Improve AI and Task History Empty Workflows

**Files:**
- Modify: `apps/desktop/src/renderer/v3/tasks/TaskConversationView.tsx`
- Modify: `apps/desktop/src/renderer/v3/tasks/TaskConversationView.test.tsx`
- Modify: `apps/desktop/src/renderer/v3/tasks/TaskComposer.tsx`
- Modify: `apps/desktop/src/renderer/v3/tasks/TaskComposer.test.tsx`
- Modify: `apps/desktop/src/renderer/v3/tasks/TaskHistoryPanel.tsx`
- Modify: `apps/desktop/src/renderer/v3/tasks/TaskHistoryPanel.test.tsx`
- Modify: `apps/desktop/src/renderer/v3/V3App.tsx`
- Modify: `apps/desktop/src/renderer/v3/tasks/task-conversation.css`
- Modify: `apps/desktop/src/renderer/v3/styles/workspace-polish.css`

**Interfaces:**
- Produces: `TaskComposer.seed?: { id: number; text: string }` and `TaskHistoryPanel.onStartNewTask?: () => void`.
- Consumes: existing composer submission and task-tab opening flow.

- [ ] Add failing tests for three starter-prompt buttons populating (not submitting) the composer textarea.
- [ ] Add a seed prop to TaskComposer and update its internal text when the seed ID changes.
- [ ] Render starter prompts for “创建登录页”, “优化当前界面”, and “编译运行项目” in the empty task state.
- [ ] Add a failing empty-history test for a “开始新任务” action.
- [ ] Render a structured empty-history card and pass an action from V3App that opens the current/default AI task.
- [ ] Adjust empty-task grid so introduction sits above a bottom-adjacent composer with a 960px maximum width.
- [ ] Run task conversation, composer, history, and V3App tests.

### Task 3: Polish Component Library and Component Source Settings

**Files:**
- Create: `apps/desktop/src/renderer/v3/components/component-error.ts`
- Create: `apps/desktop/src/renderer/v3/components/component-error.test.ts`
- Modify: `apps/desktop/src/renderer/v3/components/CapabilityCandidates.tsx`
- Modify: `apps/desktop/src/renderer/v3/components/CapabilityCandidates.test.tsx`
- Modify: `apps/desktop/src/renderer/v3/components/ComponentLibraryPanel.tsx`
- Modify: `apps/desktop/src/renderer/v3/components/ComponentLibraryPanel.test.tsx`
- Modify: `apps/desktop/src/renderer/v3/V3App.tsx`
- Modify: `apps/desktop/src/renderer/pages/settings/ComponentSourcesPanel.tsx`
- Modify: `apps/desktop/src/renderer/pages/settings/ComponentSourcesPanel.test.tsx`
- Modify: `apps/desktop/src/renderer/v3/styles/v3.css`
- Modify: `apps/desktop/src/renderer/v3/styles/workspace-polish.css`

**Interfaces:**
- Produces: `friendlyComponentError(error: unknown): { title; detail; action?: 'settings' }`, compact card metadata, and `ComponentLibraryPanel.onOpenSettings?: () => void`.
- Consumes: current component preview request and settings tab opening flow.

- [ ] Add table-driven failing tests that strip Electron remote-method prefixes and map missing Qt Kit errors to “需要配置 Qt Kit”.
- [ ] Use the friendly error object in ComponentLibraryPanel; render “打开设置” for configuration failures and keep retry for render failures.
- [ ] Pass a settings action from V3App that activates settings and opens its tab.
- [ ] Replace multi-line “来自…” text with source and dependency badges; add `title` to truncated component names.
- [ ] Make source filter/search sticky within the component sidebar and use compact dark scrollbars.
- [ ] Add a failing settings-source test asserting the ready state uses a compact badge and protected sources do not expose mutating controls.
- [ ] Restructure component source cards into information, compact status, and aligned actions; remove the oversized vertical status oval.
- [ ] Run component, source-settings, and V3App tests.

### Task 4: Upgrade Source Viewer and Preview Workspace

**Files:**
- Modify: `apps/desktop/src/renderer/v3/artifacts/UiSourceTab.tsx`
- Create: `apps/desktop/src/renderer/v3/artifacts/UiSourceTab.test.tsx`
- Modify: `apps/desktop/src/renderer/v3/artifacts/UiPreviewTab.tsx`
- Modify: `apps/desktop/src/renderer/v3/artifacts/UiPreviewTab.test.tsx`
- Modify: `apps/desktop/src/renderer/v3/artifacts/artifacts.css`
- Modify: `apps/desktop/src/renderer/v3/styles/workspace-polish.css`

**Interfaces:**
- Produces: source toolbar with path, read-only badge, copy action, line-numbered source list, and responsive preview toolbar groups.
- Consumes: `workspace.readText`, `navigator.clipboard.writeText`, and existing preview display modes.

- [ ] Add failing source-viewer tests for path text, read-only status, line numbers, source contents, copy action, and error card.
- [ ] Render source as ordered line rows with a dedicated number column and preserve whitespace in the code column.
- [ ] Add a copy button with feedback; fall back to a visible error when clipboard write fails.
- [ ] Group preview toolbar controls semantically and allow wrapping below 900px without changing preview behavior.
- [ ] Ensure the AI adjustment composer and approval footer remain separate, non-overlapping regions.
- [ ] Run source and preview tests plus accessibility tests.

### Task 5: Visual Regression, Full Verification, and Packaging

**Files:**
- Modify: `test-results/ui-audit/run-audit.mjs`
- Verify: `test-results/ui-audit/screens/*.png`

**Interfaces:**
- Consumes: all completed UI changes.
- Produces: before/after screenshots and a versioned portable package.

- [ ] Extend the audit script to capture 1600×1000, 1366×768, and 1100×720 for AI task, components, settings, project explorer, preview, and source views.
- [ ] Run desktop full tests, component-library tests, typecheck, and `git diff --check`.
- [ ] Run the Electron screenshot audit and inspect every output for clipping, overlap, wrong active state, raw errors, and native scrollbar regressions.
- [ ] Fix visual regressions and rerun affected tests/screenshots.
- [ ] Build a versioned portable package and verify the executable and renderer assets.

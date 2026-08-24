# Qt UI Copilot V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Qt UI Copilot into a modern, multi-tab AI programming desktop application with a unified settings page, reusable Qt Kits, project bindings, and the existing Qt workflow fully preserved.

**Architecture:** Keep Electron Main and SQLite as the authority for projects, tasks, secrets, Qt environment data, and workflow state. Split the React renderer into a product shell, typed tabs, feature pages, reusable UI primitives, and page-local view models; extend the preload boundary only through strict typed IPC. Deliver the migration vertically so every task leaves a runnable application and the existing Qt 5.9.6/Qt 6 workflow remains testable.

**Tech Stack:** Electron 40, React 19, TypeScript 5.8, Vite 5, Zod 4, Node SQLite, Vitest, Testing Library, Playwright for Electron, Qt 5.9.6 and Qt 6.10.2 native helpers.

**Spec:** `docs/superpowers/specs/2026-08-24-qt-ui-copilot-v2-design.md`

## Global Constraints

- Default visual direction is B1 “墨黑紫 · AI 原生”; colors and spacing must come from CSS design tokens.
- Minimum application width is 1100 px; below the full layout breakpoint the right task rail becomes a drawer and the main navigation becomes an icon rail.
- Qt Widgets `.ui` workflows remain compatible with Qt 5.9.6 and Qt 6.x.
- Model provider copy remains OpenAI-compatible and vendor-neutral; do not mention Token Plan in product copy.
- API keys remain encrypted by Electron `safeStorage` and are never returned to the renderer.
- Renderer keeps sandboxing, context isolation, and `nodeIntegration: false`.
- Existing structured patch, approval, accept, rollback, PreviewHost, Probe, and evidence semantics must not change.
- Preserve unrelated working-tree changes, especially the existing Qwen multimodal changes in `apps/desktop/src/main/ipc/register-ipc.ts` and its tests.
- Each task must pass its focused tests and `pnpm --filter @qt-ui-copilot/desktop typecheck` before commit.

---

## File Map

New renderer ownership boundaries:

```text
apps/desktop/src/renderer/
├── app/AppShell.tsx                 # product shell composition
├── app/AppShell.test.tsx            # navigation and shell behavior
├── app/navigation.ts                # stable primary navigation metadata
├── app/notifications.tsx            # bounded global notifications
├── app/status-bar.tsx               # project/model/task summary
├── app/tabs/TabBar.tsx              # visual tab bar
├── app/tabs/tab-model.ts             # typed tab identity and reducer
├── app/tabs/tab-model.test.ts        # dedupe/close/restore rules
├── components/ui/                    # Button, Card, Field, Badge, EmptyState
├── pages/workbench/WorkbenchPage.tsx # migrated workflow UI
├── pages/projects/ProjectsPage.tsx   # project/resource browser
├── pages/components/ComponentsPage.tsx
├── pages/tasks/TasksPage.tsx
├── pages/reports/ReportsPage.tsx
├── pages/settings/SettingsPage.tsx
├── pages/settings/ModelSettingsPanel.tsx
├── pages/settings/QtKitsPanel.tsx
├── pages/settings/ProjectBindingPanel.tsx
├── state/app-state.tsx               # UI-only state and persistence
└── styles/{tokens,base,layout}.css
```

New Main/domain boundaries:

```text
apps/desktop/src/main/settings/model-capabilities.ts
apps/desktop/src/main/settings/qt-kit-service.ts
apps/desktop/src/main/settings/project-binding-service.ts
packages/task-store/src/settings-repository.ts
```

`register-ipc.ts` remains the composition root but delegates settings logic to these focused services.

---

### Task 1: Design tokens and reusable UI primitives

**Files:**
- Create: `apps/desktop/src/renderer/styles/tokens.css`
- Create: `apps/desktop/src/renderer/styles/base.css`
- Create: `apps/desktop/src/renderer/styles/layout.css`
- Create: `apps/desktop/src/renderer/components/ui/Button.tsx`
- Create: `apps/desktop/src/renderer/components/ui/Card.tsx`
- Create: `apps/desktop/src/renderer/components/ui/Field.tsx`
- Create: `apps/desktop/src/renderer/components/ui/Badge.tsx`
- Create: `apps/desktop/src/renderer/components/ui/EmptyState.tsx`
- Create: `apps/desktop/src/renderer/components/ui/ui-primitives.test.tsx`
- Modify: `apps/desktop/src/renderer/main.tsx`
- Modify: `apps/desktop/src/renderer/app.css`

**Interfaces:**
- Produces: `Button`, `Card`, `Field`, `Badge`, and `EmptyState` React components used by all later pages.
- Produces: CSS variables `--surface-*`, `--text-*`, `--accent-*`, `--status-*`, `--space-*`, `--radius-*`, and `--shadow-*`.

- [ ] **Step 1: Write failing primitive-state tests**

```tsx
it('renders a loading primary button without accepting clicks', async () => {
  const onClick = vi.fn();
  render(<Button variant="primary" loading onClick={onClick}>保存</Button>);
  expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: '保存' }));
  expect(onClick).not.toHaveBeenCalled();
});

it('connects Field errors to the input description', () => {
  render(<Field label="Qt 路径" error="目录不存在"><input /></Field>);
  expect(screen.getByRole('textbox')).toHaveAccessibleDescription('目录不存在');
});
```

- [ ] **Step 2: Verify the tests fail before primitives exist**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- src/renderer/components/ui/ui-primitives.test.tsx`

Expected: FAIL because the primitive modules do not exist.

- [ ] **Step 3: Implement tokens and primitives**

Use this public shape:

```tsx
export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
};

export function Button({ variant = 'secondary', loading = false, disabled, children, ...props }: ButtonProps) {
  return <button className={`ui-button ui-button--${variant}`} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>{children}</button>;
}
```

Define focus-visible, hover, active, disabled, loading, success, warning, and error styles exclusively through tokens. Replace `app.css` with a compatibility import layer so the workbench can migrate incrementally.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- src/renderer/components/ui/ui-primitives.test.tsx`

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the design system foundation**

```bash
git add apps/desktop/src/renderer/styles apps/desktop/src/renderer/components/ui apps/desktop/src/renderer/main.tsx apps/desktop/src/renderer/app.css
git commit -m "feat: add V2 renderer design system"
```

### Task 2: Typed multi-tab application shell

**Files:**
- Create: `apps/desktop/src/renderer/app/navigation.ts`
- Create: `apps/desktop/src/renderer/app/AppShell.tsx`
- Create: `apps/desktop/src/renderer/app/AppShell.test.tsx`
- Create: `apps/desktop/src/renderer/app/tabs/tab-model.ts`
- Create: `apps/desktop/src/renderer/app/tabs/tab-model.test.ts`
- Create: `apps/desktop/src/renderer/app/tabs/TabBar.tsx`
- Create: `apps/desktop/src/renderer/app/notifications.tsx`
- Create: `apps/desktop/src/renderer/app/status-bar.tsx`
- Create: `apps/desktop/src/renderer/state/app-state.tsx`
- Modify: `apps/desktop/src/renderer/App.tsx`

**Interfaces:**
- Produces: `AppTab`, `TabState`, `openTab(state, tab)`, `closeTab(state, id)`, and `restoreTabs(raw)`.
- Produces: `AppShell` slots `activePage`, `status`, and primary navigation callbacks.

- [ ] **Step 1: Write failing tab reducer tests**

```ts
const workbench: AppTab = { id: 'workbench', kind: 'workbench', title: 'AI 工作台', closable: false };
const settings: AppTab = { id: 'settings', kind: 'settings', title: '设置', closable: true };

it('deduplicates a resource tab and focuses the existing tab', () => {
  const once = openTab({ tabs: [workbench], activeId: 'workbench' }, settings);
  const twice = openTab(once, settings);
  expect(twice.tabs).toEqual([workbench, settings]);
  expect(twice.activeId).toBe('settings');
});

it('never closes the fixed workbench tab', () => {
  expect(closeTab({ tabs: [workbench], activeId: 'workbench' }, 'workbench').tabs).toEqual([workbench]);
});
```

- [ ] **Step 2: Verify tab tests fail**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- src/renderer/app/tabs/tab-model.test.ts`

Expected: FAIL because `tab-model.ts` does not exist.

- [ ] **Step 3: Implement typed tabs and shell**

```ts
export type SettingsSection = 'model' | 'qt-kits' | 'build-tools' | 'project-binding' | 'preview' | 'navigation' | 'component-sources' | 'appearance' | 'data-safety';

export type AppTab =
  | { id: 'workbench'; kind: 'workbench'; title: string; closable: false }
  | { id: 'settings'; kind: 'settings'; title: string; closable: true; section?: SettingsSection }
  | { id: `ui:${string}`; kind: 'ui'; title: string; closable: true; projectId: string; uiFile: string }
  | { id: `task:${string}`; kind: 'task'; title: string; closable: true; taskId: string }
  | { id: `report:${string}`; kind: 'report'; title: string; closable: true; taskId: string };

export interface TabState { tabs: AppTab[]; activeId: AppTab['id']; }
```

Persist only parsed `AppTab` data in `localStorage` under `qt-ui-copilot:v2-tabs`. Invalid or missing resource tabs render a recoverable page state rather than crashing.

- [ ] **Step 4: Test reducer, shell navigation, and typecheck**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- src/renderer/app/tabs/tab-model.test.ts src/renderer/app/AppShell.test.tsx`

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop typecheck`

Expected: PASS with one fixed workbench tab and deduplicated settings/resource tabs.

- [ ] **Step 5: Commit the shell**

```bash
git add apps/desktop/src/renderer/app apps/desktop/src/renderer/state apps/desktop/src/renderer/App.tsx
git commit -m "feat: add V2 multi-tab application shell"
```

### Task 3: Migrate the existing workflow into WorkbenchPage

**Files:**
- Create: `apps/desktop/src/renderer/pages/workbench/WorkbenchPage.tsx`
- Create: `apps/desktop/src/renderer/pages/workbench/WorkbenchPage.test.tsx`
- Create: `apps/desktop/src/renderer/pages/workbench/RequirementCard.tsx`
- Create: `apps/desktop/src/renderer/pages/workbench/PlanCard.tsx`
- Create: `apps/desktop/src/renderer/pages/workbench/TaskRail.tsx`
- Move/adapt: `apps/desktop/src/renderer/features/preview/PreviewComparison.tsx`
- Move/adapt: `apps/desktop/src/renderer/features/workflow/WorkflowTimeline.tsx`
- Modify: `apps/desktop/src/renderer/App.tsx`
- Modify: `apps/desktop/src/renderer/App.test.tsx`

**Interfaces:**
- Consumes: existing `DesktopApi`, `WorkflowUiState`, `UiProject`, and `ComponentCandidate` types.
- Produces: `WorkbenchPage({ api, project, onProjectChange, onOpenSettings })`.

- [ ] **Step 1: Move existing acceptance behavior into a failing Workbench test**

```tsx
it('generates, approves, and renders a workflow without losing late-event protection', async () => {
  const api = new FakeDesktopApi().withProject().withPlan(validPlan);
  render(<WorkbenchPage api={api} onOpenSettings={vi.fn()} />);
  await userEvent.type(screen.getByLabelText('界面需求'), '增加测试连接按钮');
  await userEvent.click(screen.getByRole('button', { name: '生成修改计划' }));
  expect(await screen.findByText('结构化计划')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '批准并应用' }));
  expect(api.approvals).toHaveLength(1);
});
```

- [ ] **Step 2: Verify the migrated test fails**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- src/renderer/pages/workbench/WorkbenchPage.test.tsx`

Expected: FAIL because `WorkbenchPage` does not exist.

- [ ] **Step 3: Extract the workbench without changing backend semantics**

Move project import, target selection, requirement, task subscription, revision ordering, approval, cancellation, takeover, acceptance, rollback, component selection, report export, and error sanitization from `App.tsx` into focused workbench components. Keep these gates unchanged:

```ts
const canStart = Boolean(project && targetUi && requirement.trim());
const canApply = Boolean(task?.plan) && task?.status !== 'failed' && task?.status !== 'cancelled';
```

Render the approved dual-column layout and status badges using Task 1 primitives.

- [ ] **Step 4: Run all renderer workflow tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- src/renderer/App.test.tsx src/renderer/pages/workbench/WorkbenchPage.test.tsx src/renderer/features/workflow/WorkflowTimeline.test.tsx`

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop typecheck`

Expected: PASS; existing approval and late-event regression tests remain green.

- [ ] **Step 5: Commit the workbench migration**

```bash
git add apps/desktop/src/renderer/App.tsx apps/desktop/src/renderer/App.test.tsx apps/desktop/src/renderer/pages/workbench apps/desktop/src/renderer/features
git commit -m "feat: migrate workflow into V2 workbench"
```

### Task 4: Persist Qt Kits, project bindings, and UI preferences

**Files:**
- Modify: `packages/task-store/src/schema.ts`
- Create: `packages/task-store/src/settings-repository.ts`
- Create: `packages/task-store/test/settings-repository.test.ts`
- Modify: `packages/task-store/src/index.ts`

**Interfaces:**
- Produces: `QtKitRecord`, `ProjectBindingRecord`, `UiPreferences`, and `SettingsRepository`.

- [ ] **Step 1: Write failing repository tests**

```ts
it('stores multiple Qt kits and protects a referenced kit', () => {
  const database = openDatabase(':memory:');
  const repository = new SettingsRepository(database);
  new TaskRepository(database).upsertProject({ id: 'network-app', rootDir: 'D:/projects/network-app' });
  repository.saveQtKit(qt59);
  repository.saveQtKit(qt610);
  repository.saveProjectBinding({ projectId: 'network-app', qtKitId: qt59.id, buildDirectory: 'build', executable: 'app.exe', args: [] });
  expect(repository.listQtKits()).toHaveLength(2);
  expect(() => repository.deleteQtKit(qt59.id)).toThrow('1 project');
});
```

- [ ] **Step 2: Verify repository tests fail**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/task-store test -- settings-repository.test.ts`

Expected: FAIL because the repository and tables do not exist.

- [ ] **Step 3: Add schema and repository**

Add tables with foreign-key protection:

```sql
CREATE TABLE IF NOT EXISTS qt_kits (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  health_json TEXT,
  checked_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS project_bindings (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  qt_kit_id TEXT NOT NULL REFERENCES qt_kits(id) ON DELETE RESTRICT,
  config_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ui_preferences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  preferences_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

Parse every JSON column with strict Zod schemas on read and write.

- [ ] **Step 4: Run repository tests and full task-store tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/task-store test`

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/task-store typecheck`

Expected: PASS, including existing model-key ciphertext persistence tests.

- [ ] **Step 5: Commit settings persistence**

```bash
git add packages/task-store/src packages/task-store/test/settings-repository.test.ts
git commit -m "feat: persist Qt kits and project bindings"
```

### Task 5: Add vendor-neutral model capability checks

**Files:**
- Create: `apps/desktop/src/main/settings/model-capabilities.ts`
- Create: `apps/desktop/src/main/settings/model-capabilities.test.ts`
- Modify: `apps/desktop/src/main/ipc/register-ipc.ts`
- Modify: `apps/desktop/src/main/ipc/register-ipc.test.ts`
- Modify: `apps/desktop/src/renderer/lib/api.ts`
- Modify: `apps/desktop/src/preload/index.ts`

**Interfaces:**
- Produces: `ModelCapability = 'text' | 'json' | 'vision'`.
- Produces: `ModelCapabilityResult { capability, ok, status?, code?, message?, elapsedMs, model }`.
- Produces IPC: `settings:testModelCapability({ capability })`.

- [ ] **Step 1: Write failing request-shape tests**

```ts
it('sends a real image for the vision capability check', async () => {
  const requests: RequestInit[] = [];
  await testModelCapability(settings, 'vision', async (_url, init) => {
    requests.push(init!);
    return okCompletion('{"description":"purple square"}');
  });
  const body = JSON.parse(String(requests[0].body));
  expect(body.messages[0].content).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'image_url', image_url: expect.objectContaining({ url: expect.stringMatching(/^data:image\/png;base64,/) }) }),
  ]));
});
```

- [ ] **Step 2: Verify capability tests fail**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- src/main/settings/model-capabilities.test.ts`

Expected: FAIL because `testModelCapability` does not exist.

- [ ] **Step 3: Implement the three bounded checks**

- Text: request `Reply with OK.` with bounded output.
- JSON: request `{"ok":true}` using `response_format: { type: 'json_object' }` and validate parsed content.
- Vision: send an embedded 16×16 PNG and require a non-empty response.
- For Qwen-compatible hosts/models add `enable_thinking: false`; retain DeepSeek-specific `thinking: { type: 'disabled' }` behavior.
- Reuse the existing diagnostic sanitization and never include response bodies in renderer-visible success results.

- [ ] **Step 4: Run capability and IPC tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- src/main/settings/model-capabilities.test.ts src/main/ipc/register-ipc.test.ts`

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop typecheck`

Expected: PASS for text, JSON, vision, timeout, 401, 404, and redaction cases.

- [ ] **Step 5: Commit model capability checks**

```bash
git add apps/desktop/src/main/settings apps/desktop/src/main/ipc/register-ipc.ts apps/desktop/src/main/ipc/register-ipc.test.ts apps/desktop/src/renderer/lib/api.ts apps/desktop/src/preload/index.ts
git commit -m "feat: add model capability diagnostics"
```

### Task 6: Implement Qt Kit discovery and health checks

**Files:**
- Create: `apps/desktop/src/main/settings/qt-kit-service.ts`
- Create: `apps/desktop/src/main/settings/qt-kit-service.test.ts`
- Modify: `apps/desktop/src/main/ipc/register-ipc.ts`
- Modify: `apps/desktop/src/main/ipc/register-ipc.test.ts`
- Modify: `apps/desktop/src/renderer/lib/api.ts`
- Modify: `apps/desktop/src/preload/index.ts`

**Interfaces:**
- Produces: `QtKit`, `QtKitHealth`, `QtToolHealth`, and `QtKitService`.
- Produces IPC methods `listQtKits`, `scanQtKits`, `saveQtKit`, `checkQtKit`, and `deleteQtKit` under `settings.qtKits`.

- [ ] **Step 1: Write failing deterministic discovery tests**

```ts
it('discovers Qt 5.9.6 and Qt 6.10.2 without mixing tools', async () => {
  const service = new QtKitService({ roots: ['D:/Qt5.9.6', 'D:/Qt6.10.2'], fileSystem: fakeFs, run: fakeRun });
  const kits = await service.scan();
  expect(kits.map((kit) => kit.version)).toEqual(['5.9.6', '6.10.2']);
  expect(kits[0].uic).toContain('D:/Qt5.9.6');
  expect(kits[1].rcc).toContain('D:/Qt6.10.2');
});
```

- [ ] **Step 2: Verify service tests fail**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- src/main/settings/qt-kit-service.test.ts`

Expected: FAIL because `QtKitService` does not exist.

- [ ] **Step 3: Implement discovery and bounded process checks**

```ts
export interface QtKitHealth {
  ok: boolean;
  checkedAt: number;
  tools: Array<{ name: 'uic' | 'rcc' | 'qmake' | 'cmake'; ok: boolean; path: string; version?: string; message?: string }>;
  abi?: string;
  architecture?: string;
  previewHost: { ok: boolean; cacheKey?: string; message?: string };
}
```

Use direct executable plus argument arrays; do not invoke a shell. Verify `uic -version`, `rcc -version`, `qmake -query`, CMake prefix discovery, and PreviewHost cache/build using the selected Kit only.

- [ ] **Step 4: Run service, IPC, and type tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- src/main/settings/qt-kit-service.test.ts src/main/ipc/register-ipc.test.ts`

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop typecheck`

Expected: PASS with exact per-tool failure diagnostics.

- [ ] **Step 5: Commit Qt Kit services**

```bash
git add apps/desktop/src/main/settings/qt-kit-service.ts apps/desktop/src/main/settings/qt-kit-service.test.ts apps/desktop/src/main/ipc/register-ipc.ts apps/desktop/src/main/ipc/register-ipc.test.ts apps/desktop/src/renderer/lib/api.ts apps/desktop/src/preload/index.ts
git commit -m "feat: add Qt kit discovery and health checks"
```

### Task 7: Build the unified SettingsPage

**Files:**
- Create: `apps/desktop/src/renderer/pages/settings/SettingsPage.tsx`
- Create: `apps/desktop/src/renderer/pages/settings/SettingsPage.test.tsx`
- Create: `apps/desktop/src/renderer/pages/settings/ModelSettingsPanel.tsx`
- Create: `apps/desktop/src/renderer/pages/settings/QtKitsPanel.tsx`
- Create: `apps/desktop/src/renderer/pages/settings/BuildToolsPanel.tsx`
- Create: `apps/desktop/src/renderer/pages/settings/ProjectBindingPanel.tsx`
- Create: `apps/desktop/src/renderer/pages/settings/PreviewSettingsPanel.tsx`
- Create: `apps/desktop/src/renderer/pages/settings/NavigationSettingsPanel.tsx`
- Create: `apps/desktop/src/renderer/pages/settings/ComponentSourcesPanel.tsx`
- Create: `apps/desktop/src/renderer/pages/settings/AppearancePanel.tsx`
- Create: `apps/desktop/src/renderer/pages/settings/DataSafetyPanel.tsx`
- Modify: `apps/desktop/src/renderer/app/tabs/tab-model.ts`

**Interfaces:**
- Consumes: Task 2 `SettingsSection`, Task 5 model capability IPC, and Task 6 Qt Kit IPC.
- Produces: `SettingsPage({ api, initialSection, projectId })`.

- [ ] **Step 1: Write failing Settings behavior tests**

```tsx
it('tests model capabilities independently and never renders an API key', async () => {
  const api = new FakeDesktopApi().withModelCapabilities({ text: true, json: true, vision: true });
  render(<SettingsPage api={api} initialSection="model" />);
  await userEvent.click(screen.getByRole('button', { name: '测试视觉能力' }));
  expect(await screen.findByText('图片理解可用')).toBeInTheDocument();
  expect(document.body.textContent).not.toContain('sk-sp-secret');
});

it('shows the exact failing Qt tool', async () => {
  render(<SettingsPage api={new FakeDesktopApi().withQtKitHealth({ rcc: false })} initialSection="qt-kits" />);
  expect(await screen.findByText(/rcc.*检测失败/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Verify Settings tests fail**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- src/renderer/pages/settings/SettingsPage.test.tsx`

Expected: FAIL because settings page components do not exist.

- [ ] **Step 3: Implement all nine settings categories**

Use a stable category registry:

```ts
export type SettingsSection = 'model' | 'qt-kits' | 'build-tools' | 'project-binding' | 'preview' | 'navigation' | 'component-sources' | 'appearance' | 'data-safety';
```

Only model, Qt Kits, build tools, project binding, preview, navigation, and data safety expose enabled controls in V2. Component sources shows the working local source plus a disabled “外部数据源待配置” action without naming a vendor. Appearance exposes B1 as the active theme and density preference; it does not claim a complete light theme.

- [ ] **Step 4: Run Settings tests and renderer suite**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- src/renderer/pages/settings/SettingsPage.test.tsx src/renderer/App.test.tsx`

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop typecheck`

Expected: PASS with no vendor-specific plan copy in rendered output.

- [ ] **Step 5: Commit unified settings UI**

```bash
git add apps/desktop/src/renderer/pages/settings apps/desktop/src/renderer/app/tabs/tab-model.ts
git commit -m "feat: add unified V2 settings page"
```

### Task 8: Implement project bindings and project-aware execution

**Files:**
- Create: `apps/desktop/src/main/settings/project-binding-service.ts`
- Create: `apps/desktop/src/main/settings/project-binding-service.test.ts`
- Modify: `apps/desktop/src/main/ipc/register-ipc.ts`
- Modify: `apps/desktop/src/main/ipc/register-ipc.test.ts`
- Modify: `apps/desktop/src/renderer/lib/api.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/pages/settings/ProjectBindingPanel.tsx`

**Interfaces:**
- Produces: `ProjectBinding`, `ProjectBindingHealth`, `getProjectBinding`, `saveProjectBinding`, and `checkProjectBinding`.
- Existing task execution consumes the resolved binding before falling back to `.qt-ui-copilot/project.json`.

- [ ] **Step 1: Write failing precedence and validation tests**

```ts
it('uses an explicit local binding before project.json without rewriting the project file', async () => {
  repository.saveProjectBinding(localBinding);
  const resolved = await service.resolve(projectWithJsonProfile);
  expect(resolved.qtKitId).toBe(localBinding.qtKitId);
  expect(readFileSync(projectProfilePath, 'utf8')).toBe(originalProfileText);
});

it('blocks preview when the selected Kit is unhealthy', async () => {
  await expect(service.check(bindingWithMissingUic)).resolves.toMatchObject({ ok: false, blocking: expect.arrayContaining(['uic']) });
});
```

- [ ] **Step 2: Verify binding tests fail**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- src/main/settings/project-binding-service.test.ts`

Expected: FAIL because the binding service does not exist.

- [ ] **Step 3: Implement binding resolution and workflow integration**

Resolution order:

```ts
const resolved = explicitLocalBinding ?? importedProjectJsonProfile ?? undefined;
```

Validate Kit existence, source/build paths, CMake executable, target executable, argument arrays, environment-key allowlist, QRC/QSS/font paths, and route structure. Convert the resolved binding to the existing execution profile so PreviewHost, `uic`, build, launch, and Probe code paths remain unchanged.

- [ ] **Step 4: Run binding and workflow regression tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- src/main/settings/project-binding-service.test.ts src/main/ipc/register-ipc.test.ts`

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop typecheck`

Expected: PASS, including existing configured-route and preview integration tests.

- [ ] **Step 5: Commit project binding support**

```bash
git add apps/desktop/src/main/settings/project-binding-service.ts apps/desktop/src/main/settings/project-binding-service.test.ts apps/desktop/src/main/ipc/register-ipc.ts apps/desktop/src/main/ipc/register-ipc.test.ts apps/desktop/src/renderer/lib/api.ts apps/desktop/src/preload/index.ts apps/desktop/src/renderer/pages/settings/ProjectBindingPanel.tsx
git commit -m "feat: bind projects to reusable Qt kits"
```

### Task 9: Add real Projects, Components, Tasks, and Reports pages

**Files:**
- Create: `apps/desktop/src/renderer/pages/projects/ProjectsPage.tsx`
- Create: `apps/desktop/src/renderer/pages/projects/ProjectsPage.test.tsx`
- Create: `apps/desktop/src/renderer/pages/components/ComponentsPage.tsx`
- Create: `apps/desktop/src/renderer/pages/tasks/TasksPage.tsx`
- Create: `apps/desktop/src/renderer/pages/reports/ReportsPage.tsx`
- Modify: `apps/desktop/src/renderer/lib/api.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/main/ipc/register-ipc.ts`
- Modify: `packages/task-store/src/task-repository.ts`
- Modify: `packages/task-store/test/task-repository.test.ts`

**Interfaces:**
- Adds `projects.list()`, `tasks.list({ projectId?, status? })`, and `tasks.get({ taskId })` to `DesktopApi`.
- Reuses `components.search` and `reports.export`.

- [ ] **Step 1: Write failing list/query tests**

```ts
it('lists persisted tasks newest first with their last durable state', () => {
  const older = repository.createTask('p1', 'Old.ui');
  const newer = repository.createTask('p1', 'New.ui');
  repository.appendEvent(newer, { node: 'REPORT', status: 'completed', at: Date.now(), payload: {} });
  expect(repository.listTasks({ projectId: 'p1' }).map((task) => task.id)).toEqual([newer, older]);
});
```

- [ ] **Step 2: Verify repository/page tests fail**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/task-store test -- task-repository.test.ts`

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- src/renderer/pages/projects/ProjectsPage.test.tsx`

Expected: FAIL because list APIs and pages do not exist.

- [ ] **Step 3: Implement real page data flows**

- Projects page lists imported projects, resource files, binding health, and opens `ui:${absolutePath}` tabs.
- Components page queries the current project and displays real candidate metadata and screenshots.
- Tasks page lists persisted tasks with status, target, duration, and last node; selecting one opens `task:${taskId}`.
- Reports page uses persisted task snapshots and opens/exports evidence; no synthetic metrics are shown.

- [ ] **Step 4: Run repository, page, and type tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/task-store test`

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- src/renderer/pages`

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop typecheck`

Expected: PASS with every primary navigation item opening a data-backed page.

- [ ] **Step 5: Commit product pages**

```bash
git add packages/task-store/src/task-repository.ts packages/task-store/test/task-repository.test.ts apps/desktop/src/main/ipc/register-ipc.ts apps/desktop/src/preload/index.ts apps/desktop/src/renderer/lib/api.ts apps/desktop/src/renderer/pages
git commit -m "feat: add V2 project task and report pages"
```

### Task 10: Responsive behavior, accessibility, and keyboard navigation

**Files:**
- Modify: `apps/desktop/src/renderer/styles/layout.css`
- Modify: `apps/desktop/src/renderer/app/AppShell.tsx`
- Modify: `apps/desktop/src/renderer/app/tabs/TabBar.tsx`
- Create: `apps/desktop/src/renderer/app/accessibility.test.tsx`
- Modify: `apps/desktop/src/main/main.ts`

**Interfaces:**
- Produces keyboard shortcuts `Ctrl+1…6` for primary pages, `Ctrl+Tab` for tabs, and `Ctrl+W` for a closable active tab.
- Raises Electron `minWidth` from 960 to 1100.

- [ ] **Step 1: Write failing keyboard and label tests**

```tsx
it('opens Settings with Ctrl+6 and exposes labels for icon buttons', async () => {
  render(<AppShellForTest />);
  await userEvent.keyboard('{Control>}6{/Control}');
  expect(screen.getByRole('tab', { name: '设置' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('button', { name: '关闭设置' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Verify accessibility tests fail**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- src/renderer/app/accessibility.test.tsx`

Expected: FAIL until shortcuts and accessible names exist.

- [ ] **Step 3: Implement responsive and accessible behavior**

- Use `@media (max-width: 1240px)` to collapse the task rail into a drawer.
- Use `@media (max-width: 1160px)` to collapse primary navigation labels while retaining tooltips.
- Keep a hard `minWidth: 1100` in Electron.
- Add ARIA tab roles, keyboard roving focus, accessible icon labels, focus restoration after drawers, and visible focus rings.

- [ ] **Step 4: Run accessibility and renderer tests**

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop test -- src/renderer/app/accessibility.test.tsx src/renderer/App.test.tsx`

Run: `corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop typecheck`

Expected: PASS at 1100 px and common larger viewport fixtures.

- [ ] **Step 5: Commit responsive polish**

```bash
git add apps/desktop/src/renderer/styles/layout.css apps/desktop/src/renderer/app apps/desktop/src/main/main.ts
git commit -m "feat: polish V2 responsive accessibility"
```

### Task 11: End-to-end V2 acceptance and native regression

**Files:**
- Create: `tests/e2e/v2-settings.spec.ts`
- Create: `tests/e2e/v2-workbench.spec.ts`
- Modify: `tests/e2e/helpers.ts`
- Modify: `scripts/run-e2e.mjs`
- Modify: `apps/desktop/src/renderer/test/FakeDesktopApi.ts`

**Interfaces:**
- Consumes the completed V2 UI and existing Qt fixture runners.
- Produces repeatable evidence for model settings, Qt Kit health, multi-tab restore, Qt5 workflow, and Qt6 workflow.

- [ ] **Step 1: Add failing Playwright acceptance flows**

```ts
test('configures a Kit and restores a Settings tab', async ({ page }) => {
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: 'Qt Kits' }).click();
  await expect(page.getByText('Qt 5.9.6')).toBeVisible();
  await restartElectronApp();
  await expect(page.getByRole('tab', { name: '设置' })).toHaveAttribute('aria-selected', 'true');
});
```

- [ ] **Step 2: Run V2 E2E and record the first failing boundary**

Run: `corepack pnpm@10.15.0 test:e2e -- --grep "V2"`

Expected: FAIL at the first missing V2 selector or behavior, with artifacts isolated from source fixtures.

- [ ] **Step 3: Fix only acceptance gaps revealed by E2E**

Add stable accessible selectors, bounded waits for model/native processes, and failure screenshots. Do not add test-only behavior to production IPC. Preserve the fixture-copy and source-hash protections already used by the Qt E2E runner.

- [ ] **Step 4: Run the complete verification matrix**

Run: `corepack pnpm@10.15.0 test`

Run: `corepack pnpm@10.15.0 typecheck`

Run: `corepack pnpm@10.15.0 test:native:qt59`

Run: `corepack pnpm@10.15.0 test:native:qt6`

Run: `corepack pnpm@10.15.0 test:e2e`

Expected: all JavaScript/TypeScript tests, Qt 5.9.6 matrix, Qt 6.10.2 matrix, and Electron E2E pass.

- [ ] **Step 5: Commit V2 acceptance coverage**

```bash
git add tests/e2e scripts/run-e2e.mjs apps/desktop/src/renderer/test/FakeDesktopApi.ts
git commit -m "test: verify V2 desktop workflows"
```

### Task 12: Final product QA and packaging smoke test

**Files:**
- Modify: `README.md`
- Create: `docs/v2-user-guide.md`
- Modify: `.gitignore`
- Modify: only files identified by the final QA run

**Interfaces:**
- Produces a packaged Windows application and a concise V2 usage guide.

- [ ] **Step 1: Add the user-facing V2 guide before packaging**

Document these exact flows with screenshots or stable labels: configure model capabilities, register Qt 5.9.6/Qt 6.10.2 Kits, bind a project, open a `.ui` tab, create/approve a task, inspect verification, accept/rollback, and export a report. Add `.superpowers/` to `.gitignore` so brainstorming artifacts remain local.

- [ ] **Step 2: Run static and source hygiene checks**

Run: `rg -n "Token Plan|tokenplan|sk-[A-Za-z0-9]" apps/desktop/src/renderer docs/v2-user-guide.md`

Expected: no product copy naming Token Plan and no plaintext secret-like values.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 3: Build and launch the packaged application**

Run: `corepack pnpm@10.15.0 make`

Expected: Electron Forge produces a Windows package with native assets present.

Launch the generated executable, verify the V2 shell renders, open Settings, run a non-destructive Kit health check, and close normally.

- [ ] **Step 4: Run the final focused regression after packaging fixes**

Run: `corepack pnpm@10.15.0 test`

Run: `corepack pnpm@10.15.0 typecheck`

Expected: PASS with a clean application shutdown and no uncaught renderer/Main errors.

- [ ] **Step 5: Commit documentation and release readiness**

```bash
git add README.md docs/v2-user-guide.md .gitignore
git commit -m "docs: prepare Qt UI Copilot V2 release"
```

---

## Completion Gate

V2 is complete only when:

- Every primary navigation destination is data-backed and usable.
- The workbench preserves all existing workflow actions and evidence.
- Model text, JSON, and vision checks pass with a configured compatible provider.
- Both installed Qt 5.9.6 and Qt 6.10.2 Kits pass their required environment checks.
- Project binding selects the correct per-Kit tools without cross-version reuse.
- Tab deduplication and restart restore work without persisting secrets.
- Full TypeScript/Vitest, Qt5, Qt6, Electron E2E, and packaging checks pass.

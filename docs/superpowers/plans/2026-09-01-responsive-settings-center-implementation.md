# 响应式设置中心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将设置从左侧窄栏迁移到中央工作区 Tab，并在 360px、640px、900px 三档宽度保持表单和能力检测可读可用。

**Architecture:** 扩展 `ArtifactTab` 的中央设置 Tab，`V3App` 点击活动栏设置时打开该 Tab 而非替换左侧栏。`SettingsPage` 接收中央模式并管理导航呈现；CSS 负责大屏侧栏、中屏横向分类、小屏选择器和单列表单断点。

**Tech Stack:** React、TypeScript、CSS Grid、Vitest、Testing Library。

**Spec:** `docs/superpowers/specs/2026-09-01-responsive-settings-center-design.md`

## Global Constraints

- 设置必须作为唯一中央 Tab 打开，左侧文件树或任务历史不得被替换。
- 900px、640px、360px 三档都不得产生字段、按钮或文字横向溢出。
- 切换分类不得丢失未保存的输入。
- 现有模型配置、能力检测、Qt Kit、项目绑定、项目配置读写语义保持不变。
- 保存、错误和检测结果必须在页内显示；不得遮挡表单。

---

### Task 1: 添加中央设置 Tab 状态与入口

**Files:**
- Modify: `apps/desktop/src/renderer/v3/state/artifact-tabs.ts`
- Modify: `apps/desktop/src/renderer/v3/V3App.tsx`
- Test: `apps/desktop/src/renderer/v3/state/artifact-tabs.test.ts`
- Test: `apps/desktop/src/renderer/v3/V3App.test.tsx`

**Interfaces:**
- Produces: `ArtifactTab` 的 `{ kind: 'settings'; title: '设置' }` 分支。
- Consumes: `WorkspaceShell`、`ArtifactTabs`。

- [ ] **Step 1: 写中央设置 Tab 失败测试**

```tsx
await user.click(screen.getByRole('button', { name: '设置' }));
expect(screen.getByRole('tab', { name: '设置' })).toBeTruthy();
expect(screen.getByRole('complementary', { name: '项目文件' })).toBeTruthy();
expect(screen.getByRole('main', { name: '设置' })).toBeTruthy();
```

- [ ] **Step 2: 扩展 Tab 类型和 Reducer**

```ts
export type ArtifactTab =
  | { id: string; kind: 'settings'; title: string }
  | ExistingArtifactTab;

{ type: 'openSettings' }
```

`artifactTabId('settings', 'app')` 必须保证多次点击设置只激活一个 Tab。

- [ ] **Step 3: 在 V3App 中打开中央设置**

活动栏的 `settings` 点击处理改为 `dispatchTabs({ type: 'openSettings' })`，左侧 sidebar 继续展示最近的 `explorer` 或 `tasks` 内容。`ArtifactContent` 的 settings 分支渲染 `<SettingsPage api={api} workspace={workspace} central />`。

- [ ] **Step 4: 运行测试并提交**

Run: `pnpm --filter @qt-ui-copilot/desktop exec vitest run src/renderer/v3/state/artifact-tabs.test.ts src/renderer/v3/V3App.test.tsx`

Expected: 设置只出现一个中央 Tab，左侧不渲染 SettingsPage。

Commit: `feat: open settings in central workspace tab`

---

### Task 2: 重构 SettingsPage 的响应式分类导航

**Files:**
- Modify: `apps/desktop/src/renderer/pages/settings/SettingsPage.tsx`
- Modify: `apps/desktop/src/renderer/app.css`
- Modify: `apps/desktop/src/renderer/v3/styles/v3.css`
- Test: `apps/desktop/src/renderer/pages/settings/SettingsPage.test.tsx`

**Interfaces:**
- Consumes: `central?: boolean`、现有 `SettingsSection`。
- Produces: `SettingsPage` 在 desktop/tablet/mobile 三种导航模式。

- [ ] **Step 1: 写分类状态保持失败测试**

```tsx
render(<SettingsPage api={api} central />);
await user.type(screen.getByLabelText('Base URL'), 'https://example.test/v1');
await user.click(screen.getByRole('button', { name: /Qt Kits/ }));
await user.click(screen.getByRole('button', { name: /模型服务/ }));
expect(screen.getByLabelText('Base URL')).toHaveValue('https://example.test/v1');
```

- [ ] **Step 2: 实现导航 DOM**

```tsx
<nav className="settings-nav settings-nav--desktop" aria-label="设置分类">…</nav>
<nav className="settings-nav settings-nav--compact" aria-label="设置分类">…</nav>
<label className="settings-nav-select">设置分类<select value={section} … /></label>
```

三套导航共享同一 `section` state，分类内容组件在切换时保持挂载或由父级保存草稿状态。

- [ ] **Step 3: 实现三档断点**

```css
@media (min-width: 900px) { .settings-layout { grid-template-columns: 220px minmax(0, 1fr); } }
@media (min-width: 640px) and (max-width: 899px) { .settings-nav--desktop { display:none; } .settings-nav--compact { display:flex; overflow-x:auto; } }
@media (max-width: 639px) { .settings-nav--desktop,.settings-nav--compact { display:none; } .settings-nav-select { display:block; } }
```

- [ ] **Step 4: 删除旧侧栏设置覆盖规则**

移除 `.v3-sidebar > .settings-page`、`.v3-settings-overlay` 和 `.v3-ide` 对设置的运行时布局规则，保留其他页面使用的通用 `settings-card` 样式。

- [ ] **Step 5: 运行测试并提交**

Run: `pnpm --filter @qt-ui-copilot/desktop exec vitest run src/renderer/pages/settings/SettingsPage.test.tsx src/renderer/v3/V3App.test.tsx`

Commit: `feat: add responsive settings navigation`

---

### Task 3: 重组模型服务与能力检测布局

**Files:**
- Modify: `apps/desktop/src/renderer/pages/settings/ModelSettingsPanel.tsx`
- Modify: `apps/desktop/src/renderer/app.css`
- Test: `apps/desktop/src/renderer/pages/settings/ModelSettingsPanel.test.tsx`

**Interfaces:**
- Produces: `settings-connection-card`、`settings-image-card`、`settings-capabilities-card` 三个可独立响应式分组。

- [ ] **Step 1: 写窄宽度可读性失败测试**

```tsx
render(<ModelSettingsPanel api={api} />);
expect(screen.getByRole('group', { name: '连接配置' })).toBeTruthy();
expect(screen.getByRole('group', { name: '图片配置' })).toBeTruthy();
expect(screen.getByRole('group', { name: '能力检测' })).toBeTruthy();
```

- [ ] **Step 2: 拆分连接、图像、能力区块**

连接区只含 Base URL、模型、API Key 与保存；图像区只含图片发送格式；能力区逐条渲染文本、JSON、视觉检测。`Key 已配置` 放入标题行的小型状态徽章。

- [ ] **Step 3: 实现字段与按钮响应式规则**

```css
.settings-connection-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
.settings-connection-grid .ui-field--key { grid-column:1 / -1; }
@media (max-width:899px) { .settings-connection-grid { grid-template-columns:1fr; } }
.capability-check { display:grid; grid-template-columns:minmax(0,1fr) auto; }
@media (max-width:639px) { .capability-check { grid-template-columns:1fr; } .capability-check button { width:100%; } }
```

- [ ] **Step 4: 实现页内检测错误摘要与详情**

失败时默认显示 `视觉能力不可用：HTTP 400` 一行摘要；“查看详情”展开完整脱敏信息。保存状态在连接区底部显示 `role=status`，不再使用全局 toast。

- [ ] **Step 5: 运行测试并提交**

Run: `pnpm --filter @qt-ui-copilot/desktop exec vitest run src/renderer/pages/settings/ModelSettingsPanel.test.tsx`

Commit: `refactor: make model settings responsive and grouped`

---

### Task 4: 项目设置分组、粘性操作栏与最终验证

**Files:**
- Modify: `apps/desktop/src/renderer/pages/settings/SettingsDetailPanel.tsx`
- Modify: `apps/desktop/src/renderer/app.css`
- Test: `apps/desktop/src/renderer/pages/settings/SettingsDetailPanel.test.tsx`
- Test: `apps/desktop/src/renderer/app/accessibility.test.tsx`

**Interfaces:**
- Produces: 项目设置折叠分组与 `.settings-save-bar`。

- [ ] **Step 1: 写项目设置分组失败测试**

```tsx
render(<SettingsDetailPanel api={api} section="preview" workspace={workspace} />);
expect(screen.getByRole('group', { name: '预览尺寸与样式' })).toBeTruthy();
expect(screen.getByRole('group', { name: '资源加载' })).toBeTruthy();
expect(screen.getByRole('button', { name: '保存项目配置' })).toBeTruthy();
```

- [ ] **Step 2: 将项目字段分为可折叠语义组**

预览：尺寸与样式、PreviewHost 与缓存、资源加载。构建：CMake、配置命令、构建命令。启动：目标程序、参数与路线。折叠状态只影响可见性，不丢弃 values。

- [ ] **Step 3: 实现粘性保存操作栏**

```css
.settings-save-bar { position:sticky; bottom:0; display:flex; justify-content:flex-end; padding:12px 0; background:linear-gradient(transparent,var(--surface-1) 28%); }
```

- [ ] **Step 4: 完成宽度与可访问性回归**

在测试中将 settings 容器设置为 `width: 360px`、`640px`、`900px`，断言导航模式、字段单列和按钮可访问；验证 `aria-label="设置分类"`、失败详情按钮和保存状态。

- [ ] **Step 5: 全量检查、打包并提交**

Run: `pnpm typecheck && pnpm test && git diff --check && pnpm --filter @qt-ui-copilot/desktop package:portable`

Expected: 全部测试通过，便携版 `apps/desktop/out/qt-ui-copilot-portable-win32-x64/qt-ui-copilot.exe` 更新时间为当前构建时间。

Commit: `feat: finalize responsive settings center`

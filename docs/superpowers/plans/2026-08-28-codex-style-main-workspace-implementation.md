# Codex 式主工作区 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Qt UI Copilot V3 重构为以 AI 对话和真实流式执行为中心的 Codex 式工作区，并把预览、源码、Diff、Output 作为内部成果 Tab。

**Architecture:** Main 进程负责产生带 taskId/sequence 的任务事件并持久化快照；Renderer 通过 `TaskStreamStore` 去重归并，再由 `TaskConversationView` 渲染消息、状态和成果卡片。`ArtifactTabManager` 独立管理 task、preview、source、diff、output Tab，`WorkspaceShell` 只负责整体布局和活动栏。

**Tech Stack:** Electron、React 19、TypeScript、Zod、SQLite、Vitest、Testing Library、Playwright、Qt 5.9.6/Qt 6 PreviewHost。

**Spec:** `docs/superpowers/specs/2026-08-28-codex-style-main-workspace-design.md`

## Global Constraints

- 删除右侧常驻 `AI ASSISTANT`，AI 对话必须成为中央默认 Tab。
- 左侧默认展示项目文件树，并能切换 AI 任务历史。
- 同一 `.ui` 文件的同类型成果 Tab 只能存在一个。
- Main 进程是任务事实来源；Renderer 不得依赖合成计时器伪造进度。
- 流式事件必须带单调 `sequence`，重复或过期事件不得回退状态。
- PreviewHost 失败不得阻止保存已通过 uic 的基础候选。
- Qt 5.9.6 与 Qt 6 均须保留快速预览和增强预览能力。
- 保留现有中性灰主题、无边框标题栏、审批/自动应用语义和安全文件操作。

---

### Task 1: 定义统一任务事件与成果 Tab 状态

**Files:**
- Create: `packages/contracts/src/v3-task-conversation.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/desktop/src/renderer/v3/state/artifact-tabs.ts`
- Test: `packages/contracts/test/v3-task-conversation.test.ts`
- Test: `apps/desktop/src/renderer/v3/state/artifact-tabs.test.ts`

**Interfaces:**
- Produces: `V3TaskEventSchema`, `V3TaskSnapshotSchema`, `ArtifactTab`, `artifactTabsReducer`。
- Consumes: 现有 `UiCreationCandidateSchema`、`V3PreviewResult` 和 `V3UiPlan`。

- [ ] **Step 1: 写统一事件契约失败测试**

```ts
expect(V3TaskEventSchema.parse({
  taskId: 'task-1', sequence: 3, timestamp: 1,
  type: 'status', status: 'completed', stage: 'validating_base_ui',
  title: 'uic 校验通过', lane: 'generation',
})).toMatchObject({ taskId: 'task-1', sequence: 3 });
expect(() => V3TaskEventSchema.parse({ taskId: 'task-1', sequence: 0 })).toThrow();
```

- [ ] **Step 2: 实现任务事件与快照 Schema**

```ts
export const V3TaskEventSchema = z.object({
  taskId: z.string().min(1),
  sequence: z.number().int().positive(),
  timestamp: z.number().int().positive(),
  lane: z.enum(['conversation', 'generation', 'preview', 'approval']),
  type: z.enum(['message_delta', 'status', 'artifact', 'warning', 'error', 'cancelled', 'done']),
  status: z.enum(['pending', 'running', 'completed', 'warning', 'failed', 'cancelled']).optional(),
  stage: z.string().max(128).optional(),
  title: z.string().max(256),
  detail: z.string().max(4096).optional(),
  artifact: z.object({ kind: z.enum(['candidate', 'preview', 'source', 'diff', 'output']), id: z.string(), filePath: z.string().optional() }).optional(),
}).strict();
```

- [ ] **Step 3: 写成果 Tab Reducer 失败测试**

```ts
const first = artifactTabsReducer(initialArtifactTabsState, { type: 'openPreview', filePath: 'D:/demo/Main.ui', temporary: true });
const second = artifactTabsReducer(first, { type: 'openPreview', filePath: 'D:/demo/Main.ui', temporary: false });
expect(second.tabs).toHaveLength(2); // task + one preview
expect(second.tabs[1]).toMatchObject({ kind: 'preview', temporary: false });
```

- [ ] **Step 4: 实现 `ArtifactTab` 与唯一键规则**

```ts
export type ArtifactTab =
  | { id: string; kind: 'task'; taskId: string; title: string }
  | { id: string; kind: 'preview'; filePath: string; title: string; temporary: boolean; candidateId?: string }
  | { id: string; kind: 'source' | 'diff' | 'output'; filePath?: string; taskId?: string; title: string };

export const artifactTabId = (kind: ArtifactTab['kind'], identity: string) => `${kind}:${identity.toLowerCase()}`;
```

- [ ] **Step 5: 运行测试并提交**

Run: `pnpm --filter @qt-ui-copilot/contracts test && pnpm --filter @qt-ui-copilot/desktop exec vitest run src/renderer/v3/state/artifact-tabs.test.ts`

Expected: 新增测试全部通过。

Commit: `feat: add task stream and artifact tab contracts`

---

### Task 2: 在 Main 进程提供真实流式任务事件与快照

**Files:**
- Create: `apps/desktop/src/main/ai/v3-task-event-service.ts`
- Modify: `apps/desktop/src/main/ipc/register-v3-ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/lib/api.ts`
- Test: `apps/desktop/src/main/ai/v3-task-event-service.test.ts`
- Test: `apps/desktop/src/main/ipc/register-v3-ipc.test.ts`

**Interfaces:**
- Consumes: `V3TaskEvent`, `V3TaskSnapshot`。
- Produces: `ai.startTaskStream`, `ai.getTaskSnapshot`, `ai.onTaskEvent`。

- [ ] **Step 1: 写 sequence、去重和快照失败测试**

```ts
const service = new V3TaskEventService();
service.append('task-1', { lane: 'generation', type: 'status', status: 'running', title: '生成基础 UI' });
service.append('task-1', { lane: 'generation', type: 'status', status: 'completed', title: '基础 UI 已生成' });
expect(service.snapshot('task-1')?.events.map((event) => event.sequence)).toEqual([1, 2]);
```

- [ ] **Step 2: 实现事件服务**

`V3TaskEventService` 保存最近 200 条事件、当前候选、预览状态和任务状态；`append()` 生成单调 sequence，`snapshot()` 返回可序列化快照，`subscribe()` 向 Renderer 推送增量事件。

- [ ] **Step 3: 将修改与创建流程接入同一事件服务**

`v3.ai.startTaskStream` 立即返回 `{ taskId }`。Main 进程异步消费 `ConversationService.plan()` 或 `UiCreationService.createCandidate()`，每得到一条真实事件就发送：

```ts
window.webContents.send('v3.ai.taskEvent', event);
```

禁止在 Renderer 使用 `setInterval` 生成假步骤。

- [ ] **Step 4: 暴露 Preload/API**

```ts
ai: {
  startTaskStream(input: V3StartTaskInput): Promise<{ taskId: string }>;
  getTaskSnapshot(taskId: string): Promise<V3TaskSnapshot | undefined>;
  onTaskEvent(listener: (event: V3TaskEvent) => void): () => void;
  cancelTaskStream(taskId: string): Promise<void>;
}
```

- [ ] **Step 5: 验证 IPC 及时发送而非请求结束后批量返回**

测试注入异步生成器，断言第一个 `message_delta` 在 `done` 之前已通过 `webContents.send` 发出。

Run: `pnpm --filter @qt-ui-copilot/desktop exec vitest run src/main/ai/v3-task-event-service.test.ts src/main/ipc/register-v3-ipc.test.ts`

Commit: `feat: stream V3 task events from main process`

---

### Task 3: 实现 Renderer TaskStreamStore

**Files:**
- Create: `apps/desktop/src/renderer/v3/state/task-stream-store.tsx`
- Test: `apps/desktop/src/renderer/v3/state/task-stream-store.test.tsx`

**Interfaces:**
- Consumes: `DesktopApi.ai.onTaskEvent()`、`getTaskSnapshot()`。
- Produces: `useTaskStream(taskId)`、`startTask()`、`queueMessage()`、`cancelTask()`。

- [ ] **Step 1: 写旧事件不得回退的失败测试**

```ts
store.accept(event({ sequence: 8, stage: 'preview_ready', status: 'completed' }));
store.accept(event({ sequence: 6, stage: 'validating_base_ui', status: 'running' }));
expect(store.get('task-1')?.lastSequence).toBe(8);
expect(store.get('task-1')?.events).toHaveLength(1);
```

- [ ] **Step 2: 实现归并规则**

只接受 `sequence > lastSequence` 的事件。`message_delta` 追加到当前 assistant 消息；`status` 生成状态行；`artifact` 更新候选；`error/cancelled/done` 更新任务终态。

- [ ] **Step 3: 实现任务恢复**

Provider 挂载后订阅事件；切换 taskId 时先调用 `getTaskSnapshot`，再应用实时事件。快照和实时事件均通过同一个 `accept()` 路径。

- [ ] **Step 4: 实现输入队列**

运行中提交的消息追加到 `queuedMessages`；收到当前轮 `done` 后自动发送队首消息。取消后队列保留但不自动执行，由用户点击继续。

- [ ] **Step 5: 运行测试并提交**

Run: `pnpm --filter @qt-ui-copilot/desktop exec vitest run src/renderer/v3/state/task-stream-store.test.tsx`

Commit: `feat: add renderer task stream store`

---

### Task 4: 构建 AI 任务对话界面

**Files:**
- Create: `apps/desktop/src/renderer/v3/tasks/TaskConversationView.tsx`
- Create: `apps/desktop/src/renderer/v3/tasks/TaskMessage.tsx`
- Create: `apps/desktop/src/renderer/v3/tasks/TaskStatusLine.tsx`
- Create: `apps/desktop/src/renderer/v3/tasks/TaskComposer.tsx`
- Create: `apps/desktop/src/renderer/v3/tasks/TaskArtifactCard.tsx`
- Create: `apps/desktop/src/renderer/v3/tasks/task-conversation.css`
- Test: `apps/desktop/src/renderer/v3/tasks/TaskConversationView.test.tsx`

**Interfaces:**
- Consumes: `useTaskStream(taskId)` 与 `ArtifactTabManager` 回调。
- Produces: 中央 AI 任务 Tab。

- [ ] **Step 1: 写流式消息与状态行失败测试**

```tsx
render(<TaskConversationView task={snapshotWithEvents()} />);
expect(screen.getByText('基础 UI 已生成')).toBeTruthy();
expect(screen.getByText('正在生成实际预览…')).toHaveClass('is-running');
expect(screen.queryByText(/request body/i)).toBeNull();
```

- [ ] **Step 2: 实现消息和状态行**

`TaskMessage` 合并连续 delta；`TaskStatusLine` 使用 pending/running/completed/warning/failed/cancelled 六种样式；详情按钮展开 `detail`，默认不展示技术日志。

- [ ] **Step 3: 实现成果卡片**

候选成果卡片显示文件名、uic、预览状态，并触发 `onOpenPreview(candidate)`、`onOpenDiff(candidate)`、`onCommit(candidate.id)`。

- [ ] **Step 4: 实现底部输入区**

Composer 支持多行输入、图片/Qt 文件拖入、上下文模式、审批/自动应用切换。运行中提交显示“已加入队列”，停止按钮调用 `cancelTaskStream`。

- [ ] **Step 5: 删除合成进度 UI 的使用**

`CreateUiForm` 的表单字段可以拆入 Composer 的“创建新界面”参数面板；`UiCreationProgressCard` 不再作为默认状态展示，但保留到迁移完成后再删除。

- [ ] **Step 6: 运行组件和可访问性测试并提交**

Run: `pnpm --filter @qt-ui-copilot/desktop exec vitest run src/renderer/v3/tasks/TaskConversationView.test.tsx src/renderer/app/accessibility.test.tsx`

Commit: `feat: add Codex-style task conversation view`

---

### Task 5: 构建成果 Tab 与完整预览审批界面

**Files:**
- Create: `apps/desktop/src/renderer/v3/artifacts/ArtifactTabs.tsx`
- Create: `apps/desktop/src/renderer/v3/artifacts/UiPreviewTab.tsx`
- Create: `apps/desktop/src/renderer/v3/artifacts/UiSourceTab.tsx`
- Create: `apps/desktop/src/renderer/v3/artifacts/DiffTab.tsx`
- Create: `apps/desktop/src/renderer/v3/artifacts/OutputTab.tsx`
- Create: `apps/desktop/src/renderer/v3/artifacts/artifacts.css`
- Test: `apps/desktop/src/renderer/v3/artifacts/ArtifactTabs.test.tsx`
- Test: `apps/desktop/src/renderer/v3/artifacts/UiPreviewTab.test.tsx`

**Interfaces:**
- Consumes: `ArtifactTab[]`、Preview API、Revision API、候选 commit/reject API。
- Produces: 完整中央成果画布和审批条。

- [ ] **Step 1: 写 Tab 唯一性与待审批标记测试**

点击同一文件两次只产生一个 preview Tab；候选 Tab 显示“待审批”；关闭当前 Tab 后激活最近使用的 Tab。

- [ ] **Step 2: 实现 `ArtifactTabs`**

提供 `role="tablist"`、可关闭按钮、脏状态与待审批标记；task Tab 不允许在任务运行中无确认关闭。

- [ ] **Step 3: 实现完整预览画布**

`UiPreviewTab` 包含快速/增强、刷新、适应窗口、100% 缩放。图片容器使用可滚动画布，不复用旧右栏候选卡片的高度限制。

- [ ] **Step 4: 实现审批条与降级状态**

预览成功显示放弃、查看 Diff、审批并保存。预览失败时显示诊断、重试预览、查看 XML、保存基础版本；只有 uic 失败才禁用保存。

- [ ] **Step 5: 实现源码、Diff、Output Tab**

源码 Tab 调用 `workspace.readText`；Diff Tab 展示 revision/candidate 差异；Output Tab 按 taskId 展示事件详情并提供复制日志。

- [ ] **Step 6: 运行测试并提交**

Run: `pnpm --filter @qt-ui-copilot/desktop exec vitest run src/renderer/v3/artifacts/ArtifactTabs.test.tsx src/renderer/v3/artifacts/UiPreviewTab.test.tsx`

Commit: `feat: add preview and artifact workspace tabs`

---

### Task 6: 重构 WorkspaceShell 与左侧任务历史

**Files:**
- Create: `apps/desktop/src/renderer/v3/shell/WorkspaceShell.tsx`
- Create: `apps/desktop/src/renderer/v3/tasks/TaskHistoryPanel.tsx`
- Modify: `apps/desktop/src/renderer/v3/V3App.tsx`
- Modify: `apps/desktop/src/renderer/v3/styles/v3.css`
- Test: `apps/desktop/src/renderer/v3/V3App.test.tsx`
- Test: `apps/desktop/src/renderer/v3/tasks/TaskHistoryPanel.test.tsx`

**Interfaces:**
- Consumes: ProjectExplorer、TaskConversationView、ArtifactTabs、SettingsPage。
- Produces: 最终 Codex 式主工作区。

- [ ] **Step 1: 写布局失败测试**

```tsx
render(<V3App api={api} />);
expect(screen.getByRole('main', { name: 'AI 工作区' })).toBeTruthy();
expect(screen.queryByLabelText('AI 助手')).toBeNull();
expect(screen.getByRole('tab', { name: /AI 任务/ })).toBeTruthy();
```

- [ ] **Step 2: 实现 Shell**

布局固定为标题栏 + 活动栏 + 左侧内容栏 + 中央工作区。删除 `--assistant-width`、`AssistantResizeHandle` 和右侧 assistant DOM。

- [ ] **Step 3: 将 ActivityPanel 扩展为任务入口**

`ActivityPanel` 增加 `tasks`。任务历史使用 `api.tasks.list()`，按更新时间排序，显示运行、待审批、失败、完成状态；点击后打开或激活对应 task Tab。

- [ ] **Step 4: 迁移创建/修改入口**

打开项目后自动创建一个空白 task Tab。没有 `.ui` 时 Composer 默认处于“创建界面”；点击 `.ui` 后默认处于“修改界面”，但用户可在输入区切换。

- [ ] **Step 5: 清理旧工作台依赖**

移除 V3App 对 `BottomPanel`、`AssistantResizeHandle`、旧 conversation state、合成 processing timer 和右侧候选卡片的直接依赖；旧组件暂时保留文件，待全量验证后删除。

- [ ] **Step 6: 运行布局与任务历史测试并提交**

Run: `pnpm --filter @qt-ui-copilot/desktop exec vitest run src/renderer/v3/V3App.test.tsx src/renderer/v3/tasks/TaskHistoryPanel.test.tsx`

Commit: `refactor: replace V3 three-column shell with task workspace`

---

### Task 7: 审批、文件树刷新与任务恢复集成

**Files:**
- Modify: `apps/desktop/src/renderer/v3/V3App.tsx`
- Modify: `apps/desktop/src/renderer/v3/explorer/ProjectExplorer.tsx`
- Modify: `apps/desktop/src/main/ai/ui-creation-service.ts`
- Modify: `apps/desktop/src/main/ipc/register-v3-ipc.ts`
- Test: `apps/desktop/src/renderer/v3/V3App.test.tsx`
- Test: `apps/desktop/src/main/ipc/register-v3-ipc.test.ts`

**Interfaces:**
- Consumes: 候选 commit/reject、TaskStreamStore、ArtifactTabManager。
- Produces: 候选到正式文件的原子转换和可恢复任务。

- [ ] **Step 1: 写审批集成失败测试**

生成候选后自动打开 temporary preview；审批后同一 Tab 变为 permanent，Explorer 出现目标文件，AI 消息追加“已保存”。

- [ ] **Step 2: 让 commit 返回完整文件信息**

扩展结果为 `{ uiFile, workspaceFile }`，减少 Renderer 再次猜测路径；提交后 Main 发出 workspace created/change 事件。

- [ ] **Step 3: 自动展开新文件目录**

ProjectExplorer 接收 `revealPath?: string`，刷新快照后展开该路径的所有父目录并给文件短暂高亮。

- [ ] **Step 4: 恢复失败/取消任务**

重新打开 task Tab 时从 `getTaskSnapshot` 恢复消息、状态、候选和预览。继续操作复用原 taskId；已有基础候选时禁止重新调用生成模型。

- [ ] **Step 5: 运行集成测试并提交**

Run: `pnpm --filter @qt-ui-copilot/desktop exec vitest run src/renderer/v3/V3App.test.tsx src/main/ipc/register-v3-ipc.test.ts`

Commit: `feat: integrate approval tabs and resumable task history`

---

### Task 8: 全量验证、旧代码清理与打包

**Files:**
- Delete after references reach zero: `apps/desktop/src/renderer/v3/assistant/AssistantResizeHandle.tsx`
- Delete after references reach zero: `apps/desktop/src/renderer/v3/assistant/UiCreationProgressCard.tsx`
- Modify: `apps/desktop/src/renderer/v3/styles/v3.css`
- Modify: `scripts/run-e2e.mjs` or existing V3 Playwright specification

**Interfaces:**
- Produces: 可发布的 Codex 式 Qt UI Copilot 便携版。

- [ ] **Step 1: 搜索并删除旧布局残留**

Run: `rg "v3-assistant|assistant-width|AssistantResizeHandle|UiCreationProgressCard" apps/desktop/src/renderer`

Expected: 除迁移说明或兼容测试外无运行时引用。

- [ ] **Step 2: 完成可访问性和键盘验证**

验证活动栏、Tab 切换、消息详情、Composer、审批条均可用键盘操作，且 `role=tab/tablist/main/status/alert` 正确。

- [ ] **Step 3: 运行全量静态与单元测试**

Run: `pnpm typecheck && pnpm test && git diff --check`

Expected: 全部通过，无未提交生成文件。

- [ ] **Step 4: 运行端到端验证**

Run: `pnpm test:e2e`

Expected: 已配置本地模型与 Qt fixture 时，V3 工作区、Qt 5.9.6 和 Qt 6 场景通过；未配置时明确报告 gate skipped，不能误报为通过。

- [ ] **Step 5: 生成便携版并检查产物时间戳**

Run: `pnpm --filter @qt-ui-copilot/desktop package:portable`

Expected: `apps/desktop/out/qt-ui-copilot-portable-win32-x64/qt-ui-copilot.exe` 更新时间为当前构建时间。

- [ ] **Step 6: 完成最终界面验收**

人工验证：默认中央为 AI 任务；旧右栏消失；生成候选自动打开预览；预览失败仍可保存基础版本；审批后文件树展开新文件；任务切换后消息和状态不丢失。

Commit: `chore: finalize Codex-style workspace migration`

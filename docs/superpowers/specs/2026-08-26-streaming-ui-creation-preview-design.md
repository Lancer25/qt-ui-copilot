# Qt UI 创建流式进度与异步预览设计

## 目标

将创建新界面的阻塞式 checklist 改为单列结构化事件流。基础 `.ui` 通过 XML、语义和目标 Qt Kit `uic` 校验后立即形成可保存候选；PreviewHost 构建、启动、资源加载和截图渲染在独立后台任务中继续，不阻塞保存。

## 原则

- 不展示模型思维链，只展示应用产生的阶段、工具调用和结果摘要。
- 不使用虚假百分比。
- 基础候选与预览任务生命周期分离。
- 预览失败或取消不能删除已通过 `uic` 的候选。
- 事件严格有序、可重放、可脱敏。
- 首次 PreviewHost 构建与后续缓存复用必须明确区分。

## 两条任务链路

### Generation Lane

1. `preparing_context`
2. `generating_intent`
3. `normalizing_intent`
4. `building_base_ui`
5. `validating_xml`
6. `validating_uic`
7. `base_candidate_ready`

到达 `base_candidate_ready` 后，Renderer 立即显示候选和保存操作，不再等待 Preview Lane。

### Preview Lane

1. `checking_preview_cache`
2. `building_preview_host` 或 `reusing_preview_host`
3. `starting_preview_host`
4. `loading_resources`
5. `rendering_preview`
6. `reading_preview_image`
7. `preview_ready`、`preview_warning`、`preview_failed` 或 `preview_cancelled`

Preview Lane 在基础候选就绪后启动。取消 Preview Lane 只终止预览进程和后续事件。

## 事件协议

```ts
interface UiCreationStreamEvent {
  taskId: string;
  sequence: number;
  timestamp: number;
  lane: 'generation' | 'preview';
  type: 'started' | 'progress' | 'completed' | 'warning' | 'failed' | 'cancelled';
  stage: string;
  title: string;
  detail?: string;
  elapsedMs?: number;
}
```

约束：

- sequence 在单个 taskId 内严格递增。
- Renderer 丢弃 sequence 小于或等于已处理值的事件。
- detail 最长 2048 字符，只包含脱敏信息。
- 路径显示为工作区相对路径；API Key、Authorization 和原始模型请求体不得进入事件。
- Main 保留最近 200 个事件，供 Renderer 重连后读取。

## 候选模型

```ts
interface UiCreationCandidateState {
  baseCandidate: {
    sourceHash: string;
    uicPassed: boolean;
    readyAt: number;
  };
  preview: {
    status: 'idle' | 'running' | 'ready' | 'warning' | 'failed' | 'cancelled';
    imageDataUrl?: string;
    findings: string[];
  };
}
```

保存操作只依赖 baseCandidate.uicPassed。增强预览成功后更新同一候选的 preview，不改变基础 sourceHash。

## Main 服务拆分

- `UiCreationTaskService`：生成基础候选并发布 Generation Lane。
- `UiPreviewTaskService`：管理 Preview Lane、取消、重试和缓存。
- `UiCreationEventStore`：有序事件、最近事件读取和订阅。
- `PreviewHostBuilder`：报告缓存命中、配置、构建阶段。
- `PreviewSessionService`：报告进程启动、资源加载、渲染和截图读取。

现有 `createUiCandidate` 保留兼容返回值，但新增 `startUiCreation` 立即返回 taskId。Renderer 通过事件和 task snapshot 获取候选。迁移完成前，旧接口作为 wrapper 等待 baseCandidateReady，而不是等待 previewReady。

## IPC

```ts
startUiCreation(input): Promise<{ taskId: string }>;
getUiCreationTask(taskId): Promise<UiCreationTaskSnapshot>;
onUiCreationEvent(listener): () => void;
cancelUiPreview(taskId): Promise<void>;
retryUiPreview(taskId): Promise<void>;
commitUiCandidate(taskId, variant: 'base' | 'previewed'): Promise<{ uiFile: string }>;
```

取消整个创建任务与取消预览是两个不同命令。基础候选生成完成后，“取消创建”变为“丢弃候选”。

## Renderer 布局

提交前显示完整表单。提交后表单折叠为任务摘要：文件名、根窗口、上下文模式、Qt Kit。

事件区使用单列时间线：

- 当前事件展开，显示动画、detail 和 elapsed。
- 已完成事件压缩为单行并显示完成标记。
- warning 使用黄色；failed 使用红色；completed 使用绿色。
- 自动滚动只在用户位于底部时启用。
- “展开详细日志”显示最多 200 条脱敏事件。

基础候选就绪后，在事件流与 Preview Lane 之间显示候选操作：

- `先保存基础版本`
- `查看基础 UI`
- `丢弃候选`

Preview Lane 显示：

- 当前 PreviewHost 阶段。
- `取消预览`。
- 失败后的 `重新预览`。
- 缓存命中时显示“复用已构建 PreviewHost”。

## 性能和缓存

- PreviewHost 缓存键包含 Qt version、compiler ABI、architecture、OS 和 build type。
- 缓存命中跳过构建，直接发布 `reusing_preview_host`。
- 同一缓存键的并发构建合并为一个 Promise。
- Preview Lane 启动后不重复请求 AI。
- 图片和 QRC 资源加载记录耗时，但不发送资源内容到 Renderer 日志。

## 错误策略

- 基础 XML/uic 失败：Generation Lane failed，不能保存。
- PreviewHost 构建失败：Preview Lane failed，基础候选仍可保存。
- QSS/QRC/字体缺失：Preview Lane warning，继续渲染降级预览。
- 预览超时：终止预览进程，允许重试。
- Renderer 重载：通过 getUiCreationTask 恢复事件和候选。
- 事件丢失或乱序：以 snapshot 和 sequence 校正。

## 测试

- baseCandidateReady 先于 previewReady。
- 慢 PreviewHost 不阻塞基础候选返回。
- 取消预览保留基础候选。
- 预览失败仍允许 commit base。
- 缓存命中与首次构建事件不同。
- sequence 去重和重连恢复。
- detail 脱敏测试。
- 单列事件流自动滚动行为测试。
- Qt 5.9.6 和 Qt 6.10.2 PreviewHost E2E。

## 非目标

- 不展示模型内部推理过程。
- 不以 token 级文本流替代结构化事件。
- 不在本阶段实现多个候选并行预览。
- 不让 PreviewHost 失败回滚基础 `.ui`。

## 成功标准

- 基础候选通过 `uic` 后 100ms 内通知 Renderer。
- PreviewHost 首次构建再慢也不阻塞基础候选保存。
- 用户能看到 PreviewHost 当前具体阶段和耗时。
- 预览取消、失败、重试和缓存复用状态准确。
- Renderer 重载后任务状态可恢复。

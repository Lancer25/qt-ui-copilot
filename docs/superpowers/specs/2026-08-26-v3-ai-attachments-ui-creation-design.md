# Qt UI Copilot V3 · AI 附件与新界面创建设计

## 目标

扩展 V3 AI Assistant，使其既能修改当前 `.ui`，也能依据图片、参考 UI、QSS/QRC 和显式源码附件创建全新的 Qt Widgets `.ui` 文件。新界面生成采用“结构化蓝图 + 确定性生成器”，不接受模型直接覆盖完整 XML。

Qt 5.9.6 仍是最低兼容版本；新建和修改流程均复用 XML、语义、`uic` 和 PreviewHost 验证。

## 范围

首版包含：

- AI Assistant 宽度拖拽、双击复位与持久化。
- “修改当前界面 / 创建新界面”模式切换。
- PNG、JPEG、WEBP、SVG、`.ui`、`.qss`、`.qrc`、`.h/.hpp/.cpp` 附件。
- 图片缩略图、文件元数据、删除和错误提示。
- 多模态结构化 `UiCreationBlueprint` 生成。
- 确定性 `.ui` XML 生成器。
- 草稿预览、验证、审批、保存和新 Tab 打开。
- 当前项目 QSS/QRC 与组件库候选的可选复用。

首版不包含：

- QML 生成。
- 根据截图生成任意 C++ 业务逻辑。
- 自动覆盖已有文件。
- UI-TARS 自主循环修改；它作为后续可选视觉优化器保留。

## AI Assistant 布局

AI Assistant 左边增加拖动分隔条：

- 默认宽度 360px。
- 最小宽度 300px，最大宽度 640px。
- Pointer Capture 驱动拖拽，避免鼠标离开分隔条时丢失状态。
- 双击恢复默认宽度。
- 宽度保存到用户界面偏好，窗口重启后恢复。
- 拖动时分隔条显示强调色，并设置 `col-resize` 光标。

编辑区仍使用 `minmax(420px, 1fr)`，不得因 AI 面板扩展产生外层页面滚动。

## 工作模式

### 修改当前界面

仅在存在活动 `.ui` Tab 时可用。附件用于补充当前 UI 上下文，模型输出已有 `UiPlan` 和 `UiOperation[]`，之后进入现有 Revision 流程。

### 创建新界面

可在未打开 `.ui` 时使用。用户需要提供：

- 文件名，必须以 `.ui` 结尾。
- 根窗口类型：`QWidget`、`QDialog` 或 `QMainWindow`。
- 保存目录，默认当前工作区 `ui/`。
- 文字需求或至少一张参考图片。
- 目标 Qt Kit，从项目 Preview Profile 获取。
- 是否复用项目 QSS/QRC。
- 是否检索本地组件库。

如果用户向空 AI Assistant 拖入图片，界面自动切换到创建模式，但不会自动开始生成。

## 附件模型

附件记录不保存任意访问权限，只包含受控元数据和内容：

```ts
interface AiAttachment {
  id: string;
  name: string;
  kind: 'image' | 'ui' | 'qss' | 'qrc' | 'source';
  mimeType: string;
  size: number;
  contentHash: string;
  dataUrl?: string;
  text?: string;
}
```

约束：

- 图片最多 4 张。
- 单文件最大 10MB，单次附件总量最大 24MB。
- 文本附件使用 UTF-8，单文件最多读取 2MB。
- 图片仅允许 PNG、JPEG、WEBP、SVG。
- 源码只有用户显式拖入时才读取。
- Renderer 读取浏览器 `File` 对象并通过类型化 IPC 传递数据，不暴露任意文件读取工具。
- Main 再次验证 MIME、扩展名、大小和内容格式。

## 新界面蓝图

模型不能直接返回完整 XML。响应必须符合严格结构：

```ts
interface UiCreationBlueprint {
  fileName: string;
  rootType: 'QWidget' | 'QDialog' | 'QMainWindow';
  rootObjectName: string;
  windowTitle: string;
  size: { width: number; height: number };
  layoutTree: UiBlueprintNode;
  tabOrder: string[];
  connections: Array<{
    sender: string;
    signal: string;
    receiver: string;
    slot: string;
  }>;
  resourceRefs: string[];
  componentIds: string[];
  expectedResults: string[];
}
```

蓝图节点只允许 Qt 5.9.6 支持的 QWidget 类、标准布局、属性白名单和布局约束。未知自定义控件必须引用项目组件库中的已验证定义，否则生成失败并要求用户选择替代控件。

## 确定性生成器

新增 `UiBlueprintGenerator`：

1. 校验蓝图 Schema、对象名唯一性、布局树无环和控件白名单。
2. 根据根窗口类型生成固定 Qt Designer XML 骨架。
3. 按布局树递归生成 widget、layout、item 和 property。
4. 生成 tab stops、connections 和 resources 引用。
5. 输出稳定格式 XML；相同蓝图必须生成相同内容。
6. 生成器不执行脚本，不拼接模型提供的原始 XML。

新建草稿先写入 `.qt-ui-copilot/v3/candidates/<transactionId>/`，审批前不修改项目源文件。

## 多模态请求

新增模型请求类型 `ui_creation`。OpenAI-compatible Provider 将附件转换为：

- 图片：`image_url` content。
- `.ui`、QSS、QRC、源码：带类型、名称和内容哈希的文本片段。
- 当前项目：Qt 版本、Preview Profile、允许的组件候选和资源摘要。

如果配置模型未通过视觉能力检测且请求包含图片，创建任务在发请求前失败，并提示用户配置支持视觉的模型；文本创建仍可继续。

## 状态机

```text
idle
→ collecting_input
→ planning_blueprint
→ generating_candidate
→ validating_xml
→ validating_uic
→ previewing
→ waiting_approval | auto_applying
→ committing
→ completed | failed | cancelled
```

失败时保留附件、需求和蓝图诊断，便于重试；候选失败不得创建或覆盖项目文件。

## 验证与保存

新界面创建执行：

1. 蓝图 Schema 校验。
2. 确定性 XML 生成。
3. XML 解析和语义检查。
4. 目标 Qt Kit 的 `uic` 校验。
5. Quick Preview。
6. 启用资源时执行 Enhanced Preview。
7. 文件名、保存路径和源文件冲突检查。
8. 审批或自动应用。
9. 原子写入项目并触发 WorkspaceWatcher。
10. 在 V3 中打开永久 `.ui` Tab。

若目标文件已存在，始终停止并要求用户改名；首版不提供覆盖按钮。

## 交互表现

- 输入区支持点击附件按钮和拖放。
- 拖入时 AI 面板显示整面 Drop Zone，不遮挡窗口标题栏。
- 图片显示缩略图；文本附件显示类型图标。
- 每个附件支持移除，错误附件不进入请求。
- 创建模式显示文件名、根窗口类型和资源/组件开关。
- 生成结果显示蓝图摘要、控件数量、风险、验证状态和预览。
- 用户可“审批并保存”“拒绝草稿”“重新生成”。

## 安全与稳定性

- API Key 仍只存在 Main 进程。
- 附件数据不写入日志；日志仅记录名称、类型、大小和哈希。
- SVG 只作为视觉参考，不在 Renderer 中执行脚本。
- 保存路径必须位于当前工作区内。
- 单次模型请求和生成时间可取消。
- 创建和修改使用相同的 Revision 验证证据格式。

## 测试与验收

- 面板宽度边界、持久化、双击复位测试。
- Drag enter/leave/drop、文件选择、删除和限制测试。
- 附件 MIME、扩展名、大小和路径安全测试。
- 蓝图 Schema、对象名、布局树和白名单测试。
- 相同蓝图生成相同 XML 的确定性测试。
- Qt 5.9.6 与 Qt 6.x `uic`/PreviewHost 原生门禁。
- 模型无视觉能力时的前置失败测试。
- 候选失败不写源文件测试。
- 文件冲突拒绝测试。
- Playwright E2E：拖入图片、生成草稿、预览、审批、自动打开新 Tab。

完成标准：用户能在未打开任何 `.ui` 的情况下拖入参考图片，生成通过目标 Qt Kit 校验的草稿，审批后在项目中得到新的 `.ui` 文件，并立即在 V3 Tab 中预览；整个过程不会覆盖已有文件。

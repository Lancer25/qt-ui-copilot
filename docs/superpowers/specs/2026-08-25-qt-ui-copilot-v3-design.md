# Qt UI Copilot V3 产品与技术设计

日期：2026-08-25  
状态：已完成交互确认，待用户书面复核  
目标：将产品重构为以真实 Qt 预览为核心的 VS Code 式 Qt UI 开发助手

## 1. 产品定位

Qt UI Copilot V3 是面向 Qt Widgets `.ui` 文件开发的专用桌面 IDE。用户打开一个 Qt 项目文件夹，以单个 `.ui` 文件为编辑 Tab，在中央使用真实 Qt PreviewHost 预览界面，并通过右侧常驻 AI 对话区生成、审批和验证界面修改。

V3 不再采用 V2 的任务管理仪表盘和多卡片工作台。产品的第一视觉中心是 Qt 界面预览，第二视觉中心是 AI 对话；任务、日志、Diff 和验证证据降级为辅助面板。

核心竞争力：

1. 使用目标 Qt Kit 真实加载 `.ui`，而不是将 Qt 界面模拟成 HTML。
2. 同时提供秒级快速预览和资源完整的增强预览。
3. AI 只生成受控 `UiOperation`，修改经过 XML、`uic` 和预览闭环验证。
4. 最低兼容 Qt 5.9.6，并确保 Qt 5 与 Qt 6 的工具和缓存完全隔离。
5. AI 上下文可在“专注界面”和“整体项目”之间切换。

## 2. 支持范围

### 2.1 V3 首版范围

- Qt Widgets。
- Qt Designer `.ui` 文件。
- `QWidget`、`QDialog`、`QMainWindow` 和嵌套页面。
- Qt 5.9.6 与 Qt 6.x。
- Windows 为首要演示和发布平台，Linux 保持核心能力可移植。
- CMake 项目；qmake 项目沿用现有 Profile/命令接入能力。
- `.ui`、QSS、QRC、字体、Qt Style 和可用 Designer 插件。
- 本地 Qt 组件库；外部向量库继续通过可选 Adapter 接入。
- 可选的真实 EXE、QtUiProbe 和语义路线验证。

### 2.2 非目标

- QML。
- 完全由 C++ 动态创建的界面。
- 将 `.ui` 转为 HTML 作为正式预览。
- 首版由 AI 自动修改 C++ 业务逻辑。
- 无审批地任意执行 shell 命令。
- 将模型输出或 UI-TARS 完成声明当成最终验证证据。

## 3. 主用户流程

```text
打开 Qt 项目文件夹
→ 扫描 .ui / QSS / QRC / Qt Kit
→ 双击 .ui 打开文件 Tab
→ 快速预览或增强预览
→ 在右侧与 AI 对话
→ AI 读取选定上下文并生成 UiOperation
→ 审批应用或自动应用
→ XML + uic 校验
→ 自动刷新当前预览
→ 接受、撤销或继续对话
```

真实应用验证不是日常编辑主路径。用户需要最高可信度时，可从当前 `.ui` Tab 触发增量构建、EXE 启动、语义路线和 QtUiProbe 验证。

## 4. 信息架构

### 4.1 IDE Shell

```text
┌──────────── 自定义窗口栏 ──────────────────────────────┐
├────┬──────────────┬────────────────────────┬──────────┤
│活动│ Explorer     │ .ui 文件 Tab           │ AI 对话  │
│栏  │ 项目文件树   ├────────────────────────┤ 常驻面板 │
│    │              │ Qt Preview Editor      │          │
│    │              ├────────────────────────┤          │
│    │              │ 底部辅助面板（可折叠） │          │
├────┴──────────────┴────────────────────────┴──────────┤
│ 状态栏：Qt Kit / 预览状态 / 上下文模式 / 当前文件      │
└────────────────────────────────────────────────────────┘
```

布局采用已确认的方案 A：

- 左侧 Activity Bar。
- 左侧 Explorer 文件树。
- 中央 `.ui` 文件 Tab 和预览编辑器。
- 右侧常驻 AI Assistant。
- 底部可折叠辅助面板。
- 底部固定状态栏。

Explorer、AI 面板和底部面板均支持拖拽调整尺寸。应用外层不滚动；文件树、当前编辑器、对话和底部面板各自管理滚动。

### 4.2 Tab 规则

- Tab 基本单位是单个 `.ui` 文件。
- 双击文件打开永久 Tab；单击文件可使用预览 Tab，打开其他文件时替换。
- 相同绝对路径只保留一个 Tab。
- Tab 显示文件名、修改状态、预览状态和关闭按钮。
- 关闭未保存修改前必须确认。
- 设置、组件库、任务列表和报告列表属于辅助视图，不创建文件 Tab。
- 每个 `.ui` Tab 独立保存预览模式、窗口尺寸、缩放、AI 会话和 Revision 历史。

## 5. Explorer 与工作区

### 5.1 文件夹工作区

用户打开单个 Qt 项目根目录。Main 进程扫描并维护：

- `.ui` 文件。
- QSS 文件。
- QRC 文件及其资源依赖。
- CMake/qmake 配置。
- C++ 源文件和头文件。
- 字体和 Designer 插件目录。
- `.qt-ui-copilot/project.json`。

默认过滤构建目录、版本控制目录和大型二进制文件。Explorer 提供文件名过滤、折叠目录、刷新和在资源管理器中显示。

### 5.2 文件监听

- Main 进程负责文件系统监听。
- 自身写入携带 Revision 标识，防止重复触发。
- 外部修改未编辑文件时自动重新加载。
- 外部修改当前存在未保存候选的文件时，暂停自动应用并要求“重新加载 / 比较 / 保留当前版本”。
- 文件删除或移动时，Tab 显示可恢复错误状态，不能静默关闭。

## 6. Qt Preview Editor

### 6.1 快速预览

目标是秒级反馈：

- 使用目标 Qt Kit 对应的 PreviewHost。
- 使用 `QUiLoader` 加载当前 `.ui` 基础结构。
- 使用项目工作目录解析 `.ui` 内可直接发现的资源引用。
- 不强制加载完整 QSS/QRC/字体/插件组合。
- 适用于布局、控件、文本和常用属性调整。

快速预览必须明确显示模式标识，不能伪装为真实应用效果。

### 6.2 增强预览

增强预览是 V3 的核心亮点：

- 使用目标 Qt Kit 自己的 `rcc` 编译 QRC 缓存。
- 注册 `.rcc`、字体和插件路径。
- 按顺序加载项目基础 QSS、主题 QSS 和页面附加 QSS。
- 设置 Qt Style、Locale、Palette、DPI 和窗口尺寸。
- 加载 ABI 匹配的 Designer 插件。
- 自定义控件插件缺失时使用 promoted base 占位。
- 输出预览截图、Widget 几何、资源清单、降级项和可信度。

增强预览仍属于 PreviewHost，不等同于真实 EXE。

### 6.3 Preview Profile

每个项目保存默认 Profile，每个 `.ui` Tab 可临时覆盖：

```ts
interface PreviewProfile {
  qtKitId: string;
  mode: 'quick' | 'enhanced';
  width: number;
  height: number;
  locale: string;
  style: string;
  qrcFiles: string[];
  stylesheets: string[];
  fonts: string[];
  pluginPaths: string[];
  highDpiMode: 'project-default' | 'logical-96' | 'system';
}
```

### 6.4 缓存与刷新

缓存键包含：

- Qt 版本。
- 编译器 ABI。
- 架构和操作系统。
- PreviewHost 构建类型。
- `.ui` 内容摘要。
- QSS/QRC/字体/插件依赖摘要。
- Preview Profile。

文件监听仅失效受影响的缓存。QSS 变化不应重新编译 PreviewHost；QRC 内容变化只重建对应 `.rcc`。

## 7. AI Assistant

### 7.1 常驻右侧面板

AI 面板始终绑定当前活动 `.ui` Tab，包含：

- 新对话和会话历史。
- 当前上下文摘要。
- 上下文模式切换。
- 审批/自动应用模式切换。
- 对话消息。
- 结构化计划、风险和候选 Diff。
- 应用、拒绝、停止、撤销和重试操作。
- 输入框、附件和显式上下文命令。

切换 `.ui` Tab 时切换对应 AI 会话；不同文件的会话和修改历史互不覆盖。

### 7.2 专注界面模式

默认模式。上下文包括：

- 当前 `.ui` 语义树。
- 当前 Preview Profile。
- 关联 QSS/QRC 和资源摘要。
- 最多三个组件库候选。
- 最近 Revision 与验证结果。

AI 需要读取相关 C++/头文件时必须发起工具请求，显示文件、原因和范围；用户批准后读取。默认不上传整个项目。

### 7.3 整体模式

允许 AI 检索整个 Qt 项目源码：

- 通过文件名、符号、文本和可选向量索引检索。
- 按需读取命中的 C++、头文件、CMake、QSS 和 QRC。
- 仍然使用有界上下文，不把全部项目内容一次性放入 Prompt。
- 源码检索无需逐文件弹窗，但状态栏和上下文面板必须显示当前读取范围。

整体模式允许 AI 理解业务代码，但 V3 首版仍只自动修改 `.ui`。C++、QSS 和 QRC 写入需要单独确认。

## 8. AI 修改模式

### 8.1 审批模式

默认模式：

1. AI 输出结构化计划。
2. UI 展示风险、`UiOperation`、候选 Diff 和预计结果。
3. 用户点击“应用修改”。
4. 创建候选文件并执行验证。
5. 全部验证通过后更新当前 Revision 并刷新预览。

### 8.2 自动应用模式

在设置中启用，也可在对话区临时切换。自动应用只省略人工审批，不能跳过：

- `UiOperation` Schema 校验。
- XML 校验。
- 引用、布局和 `objectName` 规则。
- 目标 Qt Kit 的 `uic`。
- 当前预览模式加载。

任一步失败时原文件保持不变，对话区显示具体失败节点和恢复操作。

## 9. 受控修改与 Revision

AI 不得直接生成并覆盖完整 XML。继续复用现有操作集合：

- `addWidget`
- `removeWidget`
- `moveWidget`
- `setProperty`
- `createLayout`
- `wrapInLayout`
- `setLayoutProperty`
- `addSpacer`
- `setSizePolicy`
- `setTabOrder`
- `setBuddy`
- `addExistingConnection`
- `insertComponent`

每次成功修改形成 Revision：

```ts
interface UiRevision {
  id: string;
  uiFile: string;
  parentId?: string;
  conversationId: string;
  operations: UiOperation[];
  beforeHash: string;
  afterHash: string;
  validation: RevisionValidation;
  createdAt: number;
}
```

支持撤销、重做、查看 XML Diff 和恢复到指定 Revision。外部修改发生后，现有 Revision 链进入需要重新基线化的状态。

## 10. 底部辅助面板

默认折叠，按需显示以下视图：

- Problems：XML、`uic`、资源和预览问题。
- Output：PreviewHost、构建和模型元数据日志。
- Diff：当前候选或 Revision 的 XML Diff。
- Resources：QSS/QRC/字体/插件加载情况。
- Runtime：真实应用验证、QtUiProbe 和路线。

底部面板不是任务仪表盘，不重复展示 AI 对话中的计划和审批操作。

## 11. 可选真实运行验证

从当前 `.ui` Tab 的预览工具栏触发：

```text
候选已通过 uic
→ 增量构建项目
→ 启动隔离 EXE
→ 重放语义路线或人工接管
→ QtUiProbe 识别目标页面
→ 捕获真实截图与 Widget 状态
→ 写入当前 Revision 验证记录
```

真实运行结果可与增强预览截图并排比较，但不占用日常默认布局。

## 12. 进程与安全边界

### Renderer

- 仅负责 IDE 视图和用户交互。
- 不直接访问文件系统、执行进程或持有 API Key。
- 通过类型化 preload API 调用 Main。

### Electron Main

- 工作区、文件监听和路径规范化。
- Qt Kit、PreviewHost 和子进程生命周期。
- `.ui` 文档、Revision 和候选文件。
- AI 请求、凭据、上下文和工具审批。
- SQLite 持久化和脱敏日志。

### 子进程

- PreviewHost 按 Qt Kit 隔离。
- 真实目标应用独立启动。
- UI-TARS 继续位于 Utility Process。

## 13. 错误处理

| 错误 | 行为 |
|---|---|
| `.ui` XML 无效 | 不预览，不应用候选；Problems 显示位置 |
| `uic` 失败 | 候选不落盘；显示目标 Kit 和 stderr |
| QSS 加载失败 | 增强预览降级；快速预览仍可用 |
| QRC 编译失败 | 增强预览降级；列出资源和 `rcc` 错误 |
| 自定义控件缺失 | 使用基类占位；降低可信度 |
| PreviewHost 崩溃 | 回收进程；当前 Tab 可重启预览 |
| 外部文件冲突 | 暂停自动应用；要求比较或重新加载 |
| 模型不可用 | 文件树和预览仍可使用 |
| AI 输出非法操作 | 拒绝并执行一次格式修复 |
| 自动应用验证失败 | 原文件不变；保留候选和诊断 |

## 14. 持久化

SQLite 保存：

- 最近工作区。
- Qt Kits 与项目 Profile。
- 打开的 `.ui` Tab。
- 每个 Tab 的 Preview Profile 和面板状态。
- AI 会话与上下文模式。
- 应用模式。
- Revision、验证结果和资源清单。

API Key 继续使用 Electron `safeStorage` 密文保存。Prompt、模型响应和日志默认不保存敏感文件全文；会话存储遵循用户的数据保留设置。

## 15. 测试与验收

### 15.1 自动测试

- Workspace 扫描、过滤、监听和冲突处理。
- Tab 打开、预览 Tab、去重、关闭和恢复。
- 快速预览与增强预览的 Profile 和缓存失效。
- Qt5/Qt6 工具隔离。
- AI 专注界面和整体模式的上下文边界。
- 工具读取审批。
- 审批模式和自动应用模式。
- Revision、撤销、重做和外部修改重基线。
- 自定义窗口、分栏拖拽和独立滚动区域。
- Electron E2E、Qt5.9.6 和 Qt6.x 原生矩阵。

### 15.2 产品验收

1. 打开 Qt 项目文件夹后正确展示 `.ui`、QSS、QRC 和源码树。
2. 双击 `.ui` 打开唯一文件 Tab，相同文件不重复。
3. 每个文件独立切换快速预览和增强预览。
4. Qt 5.9.6 和 Qt 6.x 使用各自的 `uic`、`rcc` 和 PreviewHost。
5. QSS/QRC 变化后增强预览自动刷新并准确失效缓存。
6. 专注界面模式不默认读取整个项目。
7. 整体模式可检索项目代码，但不自动修改 C++。
8. 审批和自动应用经过相同的确定性验证。
9. AI 修改失败时原文件保持不变。
10. 每次成功修改可撤销、重做并查看 Diff。
11. Explorer、预览、AI 面板和底部面板支持独立调整尺寸。
12. Windows 125%、150%、200% 缩放下布局和截图坐标正确。
13. 核心演示流程连续执行 10 次至少成功 9 次。

## 16. V2 迁移策略

保留并复用：

- Electron Main 安全边界。
- Qt Kit 管理。
- `.ui` 解析和 `UiOperation`。
- PreviewHost、QRC/QSS 和字体加载。
- 组件库。
- AI Provider 和安全存储。
- QtUiProbe、语义路线和真实运行验证。
- SQLite 任务与证据数据。

替换：

- V2 左侧产品导航。
- 工作台三栏卡片布局。
- 项目、任务和报告仪表盘页面。
- 以任务为中心的顶部 Tab。

迁移后，已有任务和报告数据可在底部历史/运行视图中查询，但不会决定 V3 的主界面结构。

## 17. 可行性结论

V3 比 V2 更适合比赛和实际使用。它将差异化能力集中在“真实 Qt 预览 + AI 受控修改 + 即时验证”，用户一眼即可理解价值，且大部分高风险后端能力已经在 V2 中实现。

主要风险是 Renderer 重构、每文件会话状态、文件冲突和增强预览缓存；这些风险均可通过复用现有服务、类型化 Tab 状态和独立 Preview Session 控制。V3 不需要重写 PreviewHost、QtUiProbe 或 `.ui` 修改引擎。

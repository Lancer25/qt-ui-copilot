# Qt UI Copilot 设计文档

日期：2026-08-21
状态：待用户书面复核
目标周期：3 周比赛 MVP

## 1. 产品目标

Qt UI Copilot 是一个面向已有 Qt Widgets 项目的 AI 界面开发应用。它修改由 Qt Designer `.ui` 文件描述的界面，并通过两种互补方式验证结果：

1. 增强快速预览：加载 `.ui`、QSS、QRC、字体、Qt Style 和可用的 Designer 插件，提供秒级反馈。
2. 真实应用验证：增量构建并启动真实 EXE，按用户指导的路线进入目标页面，通过测试构建中的 QtUiProbe 采集真实 Widget 状态和截图。

产品必须建立以下可审计关系：

```text
自然语言需求
  -> 检索已有组件
  -> .ui 结构化变更
  -> 快速预览
  -> 真实 EXE
  -> 运行时 Widget
  -> 截图与检查结果
  -> 接受或回滚
```

核心价值不是替代 Qt Designer，而是让 AI 能观察并验证自己对真实 Qt 界面的修改。

## 2. MVP 范围

### 2.1 支持范围

- Qt Widgets。
- 由 Qt Designer `.ui` 文件描述的界面。
- `QWidget`、`QDialog`、`QMainWindow` 及其嵌套页面。
- Qt 5.15+ 和 Qt 6.x；QtUiProbe 以源码形式随目标项目编译，避免 ABI 绑定。
- Windows 和 Linux 的核心预览、Probe 和语义路线。
- Windows 上的 UI-TARS 指导式导航；Linux UI-TARS 标记为实验性。
- CMake 自动接入；qmake 和自定义系统通过用户配置命令接入。
- 标准 Qt Layout、Widget 属性、Tab Order、Buddy、已有 Signal/Slot 连接。
- Qt 界面组件库的本地索引与复用；用户现有云端代码向量库仅作为后续可插拔增强，不是 MVP 依赖。

### 2.2 非目标

- QML。
- 完全由 C++ 动态创建的界面。
- 自动开发新的复杂 C++ 业务逻辑。
- 不经验证直接让模型覆盖 `.ui` XML。
- 完全自主探索任意大型应用。
- 保证所有自定义 Widget 在独立预览中完全还原。
- 将 UI-TARS 的 `finished` 输出当作测试通过依据。
- 首版自动新增二进制资源并重构 `.qrc`；现有资源引用可以复用。

## 3. 用户工作流

### 3.1 项目接入

1. 用户导入源码目录。
2. 应用扫描 `.ui`、`.qrc`、`.qss`、字体、CMake Preset 和构建目标。
3. 用户确认 Qt 工具链、构建命令、运行程序和测试数据初始化方式。
4. 应用为 `.ui` 文件建立结构指纹，并为组件库建立本地检索索引。
5. 若需要真实应用验证，项目以测试选项接入 QtUiProbe。

### 3.2 创建或修改界面

1. 用户选择目标 `.ui`，输入需求并可附带参考截图。
2. 系统查询组件库，返回最多 3 个高相关候选及其截图、来源和依赖。
3. 用户可以选择复用候选、继续纯生成或组合使用。
4. AI 生成受 JSON Schema 约束的 `UiOperation` 计划。
5. 用户审核计划；源文件尚未被覆盖。
6. 应用在候选补丁中修改 `.ui`，执行 XML 和 `uic` 校验。
7. 增强快速预览加载资源和样式，执行确定性检查与视觉评审。
8. 最多自动修正 2 轮。
9. 对中高风险变更，增量构建真实 EXE 并执行最终验证。
10. 用户查看 XML Diff、前后截图、组件来源、构建日志和验证报告后接受或回滚。

### 3.3 建立真实页面路线

首次进入页面可选择：

1. 用户给出文字步骤和参考图，由 UI-TARS 逐步执行。
2. 用户亲自演示一次，QtUiProbe 记录语义操作。
3. 用户手动进入目标页面后直接绑定。

任何 AI 导航步骤都由 QtUiProbe 验证。失败时允许用户接管；接管结果用于更新语义路线。后续构建优先重放语义路线，不重复依赖视觉坐标探索。

## 4. 总体架构

```text
Electron Application
├── React Renderer
│   ├── Project & UI Explorer
│   ├── Requirement/Reference Input
│   ├── Component Candidate Gallery
│   ├── Before/After Runtime View
│   ├── Task Timeline
│   ├── Monaco XML Diff
│   └── Evidence Report
│
├── Electron Main Orchestrator
│   ├── Project Manager
│   ├── Build & Process Manager
│   ├── UI Document Engine
│   ├── Component Library Service
│   ├── Preview Session Manager
│   ├── Runtime Session Manager
│   ├── Route Recorder/Replayer
│   ├── AI Planner
│   ├── Visual Critic
│   └── Evidence Store
│
├── Isolated UI-TARS Worker
│   └── @ui-tars/sdk + WindowScopedOperator
│
├── QtUiPreviewHost
│   └── QUiLoader + QResource + QSS + Fonts + Plugins
│
└── Target Qt Application
    └── QtUiProbe + QLocalServer
```

### 4.1 进程边界

- Renderer 不具有 Node 文件系统或进程权限。
- Electron Main 只暴露白名单 IPC。
- UI-TARS 在独立 Utility Process 中运行，可独立停止和回收。
- QtUiPreviewHost 是短生命周期子进程。
- 目标 Qt 应用是独立测试实例，使用隔离配置和数据目录。

## 5. 技术选型

| 领域 | 选择 |
|---|---|
| 桌面外壳 | Electron Forge + Vite |
| UI | React + TypeScript |
| 组件库 | shadcn/ui 或 Base UI |
| 编辑与 Diff | Monaco Editor |
| 状态 | Zustand；异步数据使用 TanStack Query |
| 本地持久化 | SQLite + Drizzle |
| 数据校验 | Zod |
| AI 接口 | Vercel AI SDK + OpenAI-compatible Provider |
| GUI Agent | `@ui-tars/sdk`、`@ui-tars/operator-nut-js`、显式 `uuid` 依赖 |
| Qt 预览 | C++、Qt Widgets、Qt UiTools |
| 真实运行探针 | C++、Qt Core/Gui/Widgets/Network |
| 单元测试 | Vitest、Qt Test |
| 应用 E2E | Playwright for Electron |
| 可选外部接入 | MCP TypeScript SDK v1 |

不在 MVP 中引入 LangGraph 或 Mastra。工作流步骤已知，采用显式、可持久化的类型化状态机更容易测试、恢复和展示。模型只用于需求理解、组件检索重排、变更规划和视觉评审。

## 6. UI Document Engine

### 6.1 语义模型

解析器保留原 XML 的空白、属性顺序、注释和未知节点，同时生成 Qt 专用语义索引：

```ts
interface UiDocument {
  filePath: string;
  formClass: string;
  rootWidget: WidgetNode;
  widgetsByName: Map<string, WidgetNode>;
  layoutsByName: Map<string, LayoutNode>;
  connections: ConnectionNode[];
  tabStops: string[];
  resources: ResourceRef[];
  customWidgets: CustomWidgetDef[];
}
```

未修改子树保持原始文本，减少无关 Diff。

### 6.2 受控操作

模型不能直接写 XML，只能产生以下操作：

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

所有操作先解析目标，检查名称冲突和父子关系，再生成候选 Patch。

### 6.3 校验顺序

1. XML well-formed。
2. `objectName` 唯一性和引用完整性。
3. Layout 结构规则。
4. 自定义 Widget 声明完整性。
5. 使用项目 Qt 工具链执行 `uic`。
6. 增强预览加载。
7. 需要时执行完整增量构建。

## 7. Qt 组件库检索与可选向量增强

### 7.1 目标

创建新页面或区域时，优先复用团队已有 Qt 界面组件、布局习惯和视觉规范，避免模型重新发明相似控件。

MVP 默认使用本地 SQLite 全文检索、元数据过滤和 Qt 结构相似度，不依赖网络或向量数据库。系统定义 `ComponentRetriever` 接口，为后续接入用户已有的云端代码向量服务保留边界；云端接口、鉴权、Schema、数据同步和网络策略不在当前设计中预设，待后续单独对齐。

```ts
interface ComponentRetriever {
  search(query: ComponentQuery): Promise<ComponentCandidate[]>;
  index(component: ComponentRecord): Promise<void>;
  remove(componentId: string): Promise<void>;
}
```

### 7.2 组件记录

```ts
interface ComponentRecord {
  id: string;
  name: string;
  description: string;
  tags: string[];
  sourceProject: string;
  sourceUiFile: string;
  rootObjectName: string;
  uiFragment: string;
  structureSummary: string;
  screenshotPaths: string[];
  widgetClasses: string[];
  layoutTypes: string[];
  qssDependencies: string[];
  qrcDependencies: string[];
  customWidgets: CustomWidgetDependency[];
  connections: ConnectionSummary[];
  qtVersionRange?: string;
  usageNotes?: string;
}
```

可索引对象包括完整 `.ui` 页面、GroupBox、工具栏区域、表单区、查询条件区、空状态、分页区和按钮区。

### 7.3 索引流水线

1. 扫描挂载的 Qt UI 库。
2. 解析 `.ui` 并选择完整页面或用户标记的子树。
3. 使用增强预览生成固定尺寸截图。
4. 提取结构摘要、Widget 类型、Layout、文本、QSS/QRC 和自定义控件依赖。
5. 将名称、描述、标签、结构摘要和依赖写入本地 SQLite/全文索引。
6. 保存原始结构、截图和依赖清单到本地组件清单。
7. 若未来配置云端向量 Adapter，再异步生成并上传文本/图像向量；该步骤失败不得阻断本地索引。

本地全文检索或可选向量服务只负责召回。最终排序综合：

- 语义相似度。
- 所需 Widget/Layout 匹配度。
- 当前项目是否已具备依赖。
- Qt 版本兼容性。
- 视觉风格相似度。
- 组件复用成本。

### 7.4 复用流程

1. 用户提出“创建账户设置页”或“增加统一的查询条件区”。
2. Planner 生成结构化检索条件。
3. 系统召回并展示最多 3 个候选，显示截图和来源。
4. 用户选择候选，或允许 AI 自动选择最高分候选。
5. `insertComponent` 复制 XML 子树。
6. 引擎重命名冲突的 `objectName`，并同步修正 Buddy、Tab Order 和 Connection 引用。
7. 检查 QSS、QRC、自定义控件和 C++ 行为依赖。
8. 缺失依赖不自动猜测；在计划中列出并请求用户确认。
9. 快速预览和真实 EXE 验证按正常闭环执行。

MVP 首先可靠复用标准 Qt Widget 和 Layout 组成的静态片段。包含自定义 Widget 或强业务连接的组件可以召回和展示，但插入前必须明确依赖。

## 8. 增强快速预览

### 8.1 Preview Profile

```yaml
preview:
  uiFile: src/settings/NetworkSettings.ui
  qt:
    uic: C:/Qt/6.8.0/msvc2022_64/bin/uic.exe
    rcc: C:/Qt/6.8.0/msvc2022_64/bin/rcc.exe
    style: Fusion
    pluginPaths:
      - build/designer-plugins
  resources:
    autoDiscoverFromUi: true
    qrc:
      - resources/common.qrc
  stylesheets:
    - resources/styles/base.qss
    - resources/styles/dark.qss
  fonts:
    - resources/fonts/SourceHanSansCN-Regular.otf
  locale: zh_CN
  size: [900, 640]
```

### 8.2 资源加载

1. 从 `.ui` 和 Profile 收集 `.qrc`。
2. 使用项目 Qt 版本对应的 `rcc -binary` 生成缓存 `.rcc`。
3. 缓存键包含 `.qrc` 及全部引用资源的内容摘要。
4. `QResource::registerResource()` 注册资源。
5. 注册应用字体。
6. 设置 Qt Style、Palette 和 QSS。
7. 设置 `QUiLoader` 工作目录和插件路径。
8. 加载 `.ui`、设置尺寸并等待事件队列稳定。
9. 输出截图、Widget 几何和降级信息。

### 8.3 可信度

预览报告列出已加载资源和降级项。自定义 Widget 无插件时使用 promoted base 占位，并降低可信度。动态业务状态、运行时代码属性、OpenGL 和 QtWebEngine 不由快速预览保证，必须进入真实应用验证。

## 9. QtUiProbe

### 9.1 接入

Probe 以源码模块随目标应用编译，只在测试选项启用：

```cmake
option(ENABLE_QT_UI_COPILOT "Enable Qt UI development probe" OFF)

if (ENABLE_QT_UI_COPILOT)
  add_subdirectory(tools/qt-ui-probe)
  target_link_libraries(MyApp PRIVATE QtUiProbe)
  target_compile_definitions(MyApp PRIVATE QT_UI_COPILOT_ENABLED)
endif()
```

应用在 `QApplication` 创建后显式调用 `QtUiProbe::install()`。显式调用优先于静态库中的自动启动宏，避免链接器消除。

### 9.2 IPC

使用 `QLocalServer`：Windows 为 Named Pipe，Linux 为 Unix Domain Socket。会话名包含随机 Token，权限限制为当前用户。

只读命令：

- `listWindows`
- `dumpWidgetTree`
- `findWidget`
- `hitTest`
- `identifyVisibleUi`
- `captureWindow`
- `captureWidget`
- `getActiveModal`
- `getFocusWidget`

受限动作：

- `activateWindow`
- `resizeWindow`
- `invokeButton`
- `triggerAction`
- `selectTab`
- `selectComboItem`
- `setLineEditText`
- `setCheckState`
- `waitForWidget`
- `waitForUi`

不提供任意 Slot、任意反射调用或任意文件访问。

### 9.3 页面映射

静态 `.ui` 指纹与运行时 Widget 指纹按根 `objectName`、子控件集合、层级、Layout、类名和文本计算匹配度：

- `>= 0.90`：自动绑定。
- `0.70–0.90`：请求用户确认。
- `< 0.70`：不自动绑定。

用户确认结果持久化，后续优先使用固定绑定。

## 10. 指导式导航与 UI-TARS

### 10.1 Route 输入

用户可以提供：

- 自然语言进入步骤。
- 每一步的参考截图。
- 前置数据或登录说明。
- 成功页面对应的 `.ui`。

```yaml
route:
  description: |
    启动后点击左下角“设置”；
    在设置窗口选择“网络”；
    打开“代理设置”标签。
  imageHints:
    - settings-button.png
    - network-category.png
  targetUi: src/settings/NetworkSettings.ui
```

### 10.2 路线学习

UI-TARS 每次产生坐标动作后，QtUiProbe 通过 `hitTest` 将坐标映射到实际 Widget。用户接管产生的操作也由全局事件过滤器观察。成功进入页面后生成语义 Route：

```yaml
steps:
  - invoke: settingsButton
  - waitFor: settingsDialog
  - selectTab:
      objectName: settingsTabs
      text: 网络
  - waitForUi:
      file: src/settings/NetworkSettings.ui
      confidence: 0.9
```

后续迭代优先重放语义 Route。失败时依次降级为 UI-TARS 重新探索和用户手动进入。

### 10.3 UI-TARS 边界

- 集成发布包而不是 fork 完整 Electron 项目。
- 版本锁定，并显式加入其缺失的 `uuid` 运行依赖。
- 在独立 Utility Process 中运行。
- 采用 WindowScopedOperator，截图和动作限制在目标应用窗口。
- 最大动作数、单步超时和全局停止必须配置。
- UI-TARS 的完成声明不能替代 Probe 的页面识别和最终检查。
- Windows 为正式插件；Linux 首版为实验性。

## 11. Agent 工作流

```text
IMPORT_PROJECT
  -> SELECT_UI
  -> CAPTURE_BASELINE
  -> RETRIEVE_COMPONENTS
  -> UNDERSTAND_REQUIREMENT
  -> GENERATE_UI_PLAN
  -> USER_APPROVAL
  -> APPLY_CANDIDATE_PATCH
  -> XML_VALIDATE
  -> UIC_VALIDATE
  -> ENHANCED_PREVIEW
  -> DETERMINISTIC_CHECKS
  -> VISUAL_REVIEW
  -> OPTIONAL_REPAIR (最多 2 轮)
  -> INCREMENTAL_BUILD
  -> LAUNCH_ISOLATED_EXE
  -> NAVIGATE_TO_TARGET
  -> PROBE_VERIFY_PAGE
  -> CAPTURE_REAL_RESULT
  -> FINAL_CHECKS
  -> REPORT
  -> ACCEPT_OR_ROLLBACK
```

每个节点将结构化输入、输出、耗时、错误和产物写入 SQLite。应用重启后可以从安全节点恢复，但不会自动重放文件写入或用户批准。

## 12. 验证与错误处理

最终通过条件：

```text
XML 有效
AND uic 成功
AND 快速预览的阻断性规则通过
AND 增量构建成功
AND 真实应用启动成功
AND 目标页面匹配成功
AND 真实运行确定性检查通过
AND 视觉评分超过阈值或用户确认
```

主要错误策略：

| 错误 | 行为 |
|---|---|
| XML 或 `uic` 失败 | 拒绝候选 Patch，允许重新规划 |
| QRC 编译失败 | 显示缺失资源，不伪造预览 |
| 自定义 Widget 预览失败 | 使用基类占位并降低可信度 |
| 构建失败 | 保留日志，回滚候选或修正 `.ui` 一次 |
| EXE 启动或 Probe 连接失败 | 停止最终验证，不归因于 UI 设计 |
| Route 失败 | UI-TARS/人工接管，不归因于 UI 修改 |
| 页面匹配不确定 | 请求确认 |
| UI-TARS 失败 | 回退语义路线或人工模式 |
| 视觉判断不确定 | 不自动判定通过 |
| 两轮修正仍失败 | 停止并展示证据 |

## 13. 应用界面

```text
┌──────────────┬─────────────────────────┬──────────────────────┐
│ 项目/.ui树   │ 快速预览 / 真实运行     │ AI 计划与执行时间线  │
│ 组件库       │ Before / After          │ 用户审批与接管       │
│ 检索候选     │ 尺寸/语言/主题切换      │                      │
├──────────────┴─────────────────────────┴──────────────────────┤
│ XML Diff | 依赖 | 检查 | 构建日志 | Route | UI-TARS | 报告  │
└──────────────────────────────────────────────────────────────┘
```

核心展示元素：

- 组件库候选截图和来源。
- 快速预览与真实运行的清晰标识。
- 修改前后截图同步缩放。
- 每个 Agent 步骤的输入证据和输出摘要。
- 确定性错误与 AI 建议分栏。
- 用户批准、接管、接受和回滚按钮。

## 14. 三周实施里程碑

### 第一周：确定性纵向链路

- Electron 应用骨架和安全 IPC。
- 项目/Profile 导入。
- `.ui` 解析、语义树和基础操作。
- QSS/QRC/字体增强预览。
- QtUiProbe IPC、Widget 树和真实截图。
- 真实页面到 `.ui` 的绑定。

周验收：同一个 `.ui` 在增强预览中显示项目 QSS/QRC，并可在真实 EXE 中识别和捕获对应页面。

### 第二周：AI 与组件复用

- `UiOperation` 全集和最小 Patch。
- 组件库清单、本地全文/结构检索、候选界面。
- 保留云端向量库 Adapter 接口，但不把具体云服务接入列为 MVP 验收项。
- `insertComponent` 和依赖检查。
- 结构化 AI 计划与用户批准。
- 多尺寸检查、Visual Critic 和两轮修正。
- 用户文字/图片指导的导航与语义 Route。

周验收：10 个固定 UI 任务中至少 8 个一次完成、9 个两轮内完成；所有候选均通过 `uic`。

### 第三周：真实闭环与演示

- 增量构建、隔离启动和状态恢复。
- UI-TARS Worker、窗口限制和人工接管。
- Route 重放和最终真实验证。
- 报告、打包、故障注入、Windows/Linux 验证。
- 演示脚本和录屏。

周验收：核心演示连续运行 10 次至少成功 9 次；UI-TARS 导航达不到 8/10 时退出核心现场链路，但指导式或语义路线仍可完成演示。

## 15. 比赛演示

推荐场景：

1. 挂载团队 Qt 组件库并建立本地索引；云端向量数据库可以在后续对齐后作为增强接入。
2. 用户要求为网络设置页增加统一的“连接测试区”，并上传参考图。
3. 系统召回已有查询/操作组件，展示 3 个候选。
4. 用户选择一个候选，AI 将其安全插入目标 `.ui`。
5. 增强预览加载 RCC 图标和项目 QSS。
6. 第一轮发现英文文本在小窗口被截断。
7. AI 调整 Layout、Stretch 和 SizePolicy。
8. 增量构建真实 EXE。
9. 根据用户提供的步骤和参考图进入网络设置；必要时用户接管一次。
10. QtUiProbe 确认目标页面，保存语义 Route。
11. 真实截图通过确定性与视觉检查。
12. 展示组件来源、XML Diff、前后截图、执行轨迹和证据报告。

这个演示同时覆盖创意、完成度、AI 深度和实际研发价值。

## 16. 风险与退出策略

| 风险 | 控制措施 |
|---|---|
| `.ui` 重写产生大 Diff | 保留原 XML 节点和最小文本 Patch |
| 自定义 Widget 无法预览 | 插件路径、promoted base 占位、真实 EXE 验收 |
| 组件复用携带隐式依赖 | 依赖清单、用户确认、缺失依赖阻断 |
| 本地或可选向量召回不准确 | 结构和兼容性重排、最多 3 个候选、允许跳过 |
| 大项目构建慢 | 快速预览作为内循环，真实构建只在最终阶段执行 |
| 应用状态复杂 | 隔离 Profile、用户步骤、人工接管、保存 Route |
| UI-TARS 坐标/DPI 问题 | WindowScopedOperator、Probe hitTest、语义路线替代重复视觉操作 |
| Linux UI-TARS 不成熟 | Linux 核心使用 Probe/语义路线，UI-TARS 仅实验性 |
| Agent 误修改 | JSON Schema、用户批准、候选 Patch、可恢复回滚 |

## 17. 可行性结论

接受测试构建中的 QtUiProbe，并采用增强预览、用户指导导航和真实 EXE 最终验收后，三周 MVP 的总体可行性约为 8/10。

成败优先级：

1. `.ui` 最小 Patch 和 `uic` 校验。
2. QSS/QRC 增强预览。
3. QtUiProbe 与真实页面映射。
4. 用户批准和可恢复任务状态。
5. 组件库检索与安全复用。
6. 指导式导航和语义路线。
7. UI-TARS 自主探索。

前五项构成比赛的可靠核心；UI-TARS 是体现多模态和页面探索的加分能力，不得成为核心成功路径的单点依赖。

## 18. 主要参考

- [Qt Designer UI 文件](https://doc.qt.io/qt-6/designer-using-a-ui-file.html)
- [Qt UI 文件格式](https://doc.qt.io/qt-6/designer-ui-file-format.html)
- [QUiLoader](https://doc.qt.io/qt-6/quiloader.html)
- [Qt Resource System](https://doc.qt.io/qt-6.11/resources.html)
- [QResource](https://doc.qt.io/qt-6/qresource.html)
- [Qt Style Sheets](https://doc.qt.io/qt-6/stylesheet.html)
- [QObject](https://doc.qt.io/qt-6/qobject.html)
- [QLocalServer](https://doc.qt.io/qt-6/qlocalserver.html)
- [UI-TARS Desktop](https://github.com/bytedance/UI-TARS-desktop)
- [UI-TARS SDK](https://github.com/bytedance/UI-TARS-desktop/blob/main/docs/sdk.md)

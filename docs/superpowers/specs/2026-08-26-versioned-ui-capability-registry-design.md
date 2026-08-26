# Qt UI 版本化能力注册中心设计

## 目标

建立统一的 UI 能力注册中心，替代分散的 Qt 控件白名单。注册中心同时管理 Qt 5.9.6、Qt 6.x 官方控件、本地 `.ui` 组件片段和 Promoted Widget，并为 AI 生成、依赖检查、降级和预览验证提供唯一数据源。

第一阶段不复制 C++ 源码、不修改 CMake、不生成业务逻辑。远程代码向量数据库是可选候选来源，不构成硬依赖。

## 能力模型

```ts
interface UiCapability {
  id: string;
  kind: 'qt_widget' | 'ui_fragment' | 'promoted_widget';
  displayName: string;
  description: string;
  tags: string[];
  qt: {
    minVersion: string;
    maxVersion?: string;
    modules: string[];
    verifiedKitIds: string[];
  };
  designer: {
    className: string;
    baseClass?: string;
    header?: string;
    container: boolean;
  };
  dependencies: {
    qss: string[];
    qrc: string[];
    fonts: string[];
    promotedWidgets: string[];
  };
  fallback?: {
    capabilityId: string;
    reason: string;
  };
  source: {
    type: 'builtin' | 'local_library' | 'project' | 'remote';
    path?: string;
    adapterId?: string;
  };
}
```

能力 ID 在来源内稳定且全局唯一。AI 只返回 capability ID，不返回任意 Qt 类名、头文件路径或 XML。

## 能力来源

### Qt 官方控件

内置目录按 Qt Widgets 官方模块整理，只收录具体可实例化的 Designer 控件。抽象类、模型类、item 类、action 类和可选 QML/OpenGL 控件不进入默认目录。

每个官方控件记录最低 Qt 版本、所需模块、容器属性和可降级基类。默认能力基线为 Qt 5.9.6；Qt 6-only 能力仅在目标 Qt Kit 满足版本和模块要求时出现。

### 本地 `.ui` 组件片段

复用现有 `component-library` 的组件记录、全文检索、向量检索、依赖检测和安全插入能力。注册中心通过 adapter 将 `ComponentRecord` 转换为 `UiCapability`，不复制索引实现。

片段必须包含可解析的单一根 item 或 widget，并通过 objectName 重写、连接引用检查和目标 Qt Kit `uic` 校验。

### Promoted Widget

Promoted Widget 能力记录 class、extends、header 和 container。插入时由程序生成 `<customwidgets>`，模型不能直接提供这些字段。

第一阶段只复用项目中已经存在的头文件和类。若头文件、基类或 Qt 版本不满足要求，则自动降级为 baseClass。

### 远程能力来源

远程代码向量数据库通过 `RemoteCapabilityAdapter` 返回候选 metadata。候选必须经过本地 schema、路径、依赖和 Qt Kit 验证后才能进入注册中心。远程服务不可用时不影响本地生成。

## Qt 版本和模块解析

目标项目绑定的 Qt Kit 是能力筛选依据：

1. 比较 `minVersion`、`maxVersion`。
2. 检查所需 Qt 模块。
3. 优先使用 `verifiedKitIds` 包含当前 Kit 的能力。
4. 未声明版本的第三方组件不得自动用于 Qt 5.9.6。
5. Qt 6 项目默认仍优先选择跨 Qt 5/6 能力，除非需求明确需要 Qt 6 特性。

模块不可用时能力不会交给 AI；若能力已经被选择但运行时发现依赖缺失，则执行 fallback。

## 检索与 AI 选择

检索输入包括：

- 自然语言需求。
- 参考图片视觉摘要。
- 当前 Qt Kit。
- 当前项目已存在控件、布局、QSS/QRC。
- 专注界面或整体项目上下文。

检索结果向 AI 暴露以下有限信息：

```ts
interface UiCapabilityCandidate {
  capabilityId: string;
  displayName: string;
  kind: UiCapability['kind'];
  description: string;
  tags: string[];
  dependencyStatus: 'ready' | 'degraded' | 'blocked';
  reasons: string[];
}
```

AI 的 Canonical UI Intent 节点可选携带 `capabilityId`。未选择能力时使用现有语义控件映射。

## 生成与插入

### 官方控件

由确定性生成器根据 capability className 生成标准 widget 节点。属性仍由受控基础属性和视觉增强操作处理。

### `.ui` 片段

使用现有安全插入流程：解析片段、重写 objectName、更新内部 connection/tab order、检查依赖，再插入目标布局。片段失败不会破坏基础候选。

### Promoted Widget

生成标准基类 widget 节点，并追加：

```xml
<customwidgets>
  <customwidget>
    <class>NetworkSettingsPanel</class>
    <extends>QWidget</extends>
    <header>widgets/NetworkSettingsPanel.h</header>
    <container>1</container>
  </customwidget>
</customwidgets>
```

同一个 class 只生成一个 customwidget 声明。

## 依赖和降级

- Promoted Widget 头文件缺失：降级为 baseClass。
- 基类不兼容当前 Qt Kit：使用 capability fallback；无 fallback 时跳过。
- QSS 缺失：保留结构，记录视觉降级。
- QRC 或图片缺失：移除对应资源属性并使用占位。
- 字体缺失：使用系统默认字体。
- `.ui` 片段解析或 `uic` 失败：回退到插入前候选。
- 远程候选验证失败：从本次候选集中移除，不影响本地能力。

所有降级进入 Problems 面板，并记录 capability ID、目标 objectName、原因和最终 fallback。

## V3 交互

组件库面板显示：

- 名称、来源和类型。
- Qt 版本及模块。
- 匹配理由。
- 依赖状态。
- 将使用的 fallback。

AI 创建流程显示“正在检索可复用组件”和“正在验证组件依赖”阶段。候选结果中列出实际采用、跳过和降级的能力。

## 模块边界

- `QtWidgetCapabilitySource`：内置 Qt 5/6 官方控件目录。
- `LocalComponentCapabilityAdapter`：适配现有 component-library。
- `ProjectPromotedWidgetScanner`：扫描项目 `.ui` customwidgets 和头文件声明。
- `RemoteCapabilityAdapter`：可选远程候选来源。
- `UiCapabilityRegistry`：合并、去重、版本过滤和查询。
- `UiCapabilityResolver`：依赖检查与 fallback 决策。
- `CapabilityAwareIntentPlanner`：向 AI 暴露有限候选。
- `CapabilityInsertionService`：官方控件、片段和 promoted widget 的确定性插入。

## 测试策略

- Qt 5.9.6 和 Qt 6.x 版本过滤测试。
- 抽象类、item 类、action 类排除测试。
- `.ui` 片段 objectName 重写和连接保持测试。
- Promoted Widget customwidgets 去重和 header 检查测试。
- QSS、QRC、字体缺失降级测试。
- 当前 Qt Kit `uic` 验证门禁。
- 远程 adapter 超时和无结果回退测试。
- V3 组件候选展示和生成流程 E2E 测试。

## 非目标

- 不复制或生成 C++ 实现。
- 不自动修改 CMake、qmake 或链接模块。
- 不自动安装 Qt 模块或 Designer 插件。
- 不支持 QML/Qt Quick 组件。
- 不让模型直接写 customwidgets XML。

## 成功标准

- Qt 5.9.6 项目不会收到 Qt 6-only 能力。
- Qt 6 项目可以选择满足版本和模块要求的能力。
- 本地 `.ui` 片段和 Promoted Widget 可被检索、插入、验证和降级。
- 组件问题不会导致基础 UI 整体失败。
- 现有 component-library 和未来远程向量库都通过 adapter 接入，无需修改生成器主体。

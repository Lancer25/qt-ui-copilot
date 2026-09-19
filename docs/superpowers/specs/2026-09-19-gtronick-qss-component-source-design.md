# GTRONICK/QSS 基础控件源集成设计

## 目标

将 MIT 许可的 GTRONICK/QSS 作为独立、受保护的外部组件源内置到 Qt UI Copilot。该来源提供由标准 Qt Widgets 构成的基础控件 `.ui` 示例，并通过独立 QSS 文件提供样式。用户可在组件库中筛选、搜索、预览和加入任务。

## 来源与许可证

- 上游仓库：`https://github.com/GTRONICK/QSS`
- 上游许可证：MIT
- 固定引入 `MaterialDark.qss` 及 MIT `LICENSE`，同时记录上游仓库、版权人和获取日期。
- 不修改上游 QSS 内容；Qt UI Copilot 自建的 `.ui`、manifest 和适配元数据与上游文件分开放置。
- 组件详情展示上游 MIT 许可证，而不是“Qt UI Copilot Bundled Components”。

## 目录结构

```text
resources/external-component-libraries/gtronick-qss/
├─ LICENSE
├─ UPSTREAM.md
├─ styles/
│  └─ MaterialDark.qss
└─ components/
   ├─ buttons/
   ├─ labels/
   ├─ text-inputs/
   ├─ selection-controls/
   ├─ numeric-date-inputs/
   ├─ progress-slider/
   └─ tabs/
```

每个组件目录包含 `component.json` 和一个 Qt Designer `.ui`。manifest 通过 `qssDependencies` 指向共享 `styles/MaterialDark.qss`，并声明 `>=5.9.6 <7.0.0`。

## 组件范围

首批包含七个可复用模块：

1. 按钮组：普通、主操作、禁用按钮和 `QToolButton`。
2. 文本标签：标题、副标题、正文和辅助说明 `QLabel`。
3. 文本输入：`QLineEdit`、密码输入和 `QTextEdit`。
4. 选择控件：`QCheckBox`、`QRadioButton`、`QComboBox`。
5. 数值与日期：`QSpinBox`、`QDoubleSpinBox`、`QDateEdit`。
6. 进度与滑块：`QProgressBar`、水平 `QSlider`。
7. 标签页：带两个页面的 `QTabWidget`。

这些模块只使用 Qt 标准控件，不引入 promoted widget 或额外 C++ 依赖。

## 组件源服务

`ComponentSourceService` 从单一内置根目录扩展为多个受保护源配置：

```ts
interface ProtectedComponentSourceDefinition {
  id: string;
  name: string;
  rootDir: string;
  licenseName?: string;
}
```

- 现有 `bundled` 来源继续加载当前内置组件，并覆盖许可证名为 `Qt UI Copilot Bundled Components`。
- 新增 `gtronick-qss` 来源，名称为 `GTRONICK/QSS 基础控件`，保留本地适配器解析出的 MIT 许可证。
- 两个来源均为 `kind: bundled`、`protected: true`，不能被用户删除或禁用。
- 启动时一次性同步所有受保护源；单个来源失败时记录自身健康状态，不污染另一来源的索引。
- 搜索结果使用来源自己的名称、数量和许可证。

## 运行时与打包

- 开发环境从仓库 `resources/external-component-libraries/gtronick-qss` 解析。
- 便携包准备阶段将外部组件库复制到 `qt-ui-copilot-assets/component-libraries/gtronick-qss`。
- 打包环境优先从 `process.resourcesPath` 查找，兼容当前便携目录向上两级的开发式资源回退。
- 主进程把解析后的受保护源列表传给 `ComponentSourceService`。

## 数据流

1. 应用启动或首次组件源请求时同步两个受保护源。
2. 本地适配器读取 `.ui`、manifest、MaterialDark QSS 和根目录 LICENSE。
3. 索引项保存 `sourceId=gtronick-qss`、MIT 许可证和 QSS 资产。
4. 用户选中组件后，当前自动预览流程使用 Qt Kit 渲染 `.ui + MaterialDark.qss`。
5. 用户加入任务后，现有物化流程读取组件片段和 QSS 文本。

## 错误处理

- 上游资源目录缺失时，`gtronick-qss` 来源显示失败健康状态，现有内置组件继续可用。
- 非法 UI、路径越界或缺失 QSS 由本地适配器拒绝。
- 许可证文件缺失视为集成测试失败。
- 打包校验必须确认 LICENSE、QSS 和七个组件 manifest 均进入输出目录。

## 验证

- 本地适配器发现七个组件并识别 MIT 许可证与 QSS 资产。
- 组件源服务注册两个独立受保护来源，数量和健康状态正确。
- 搜索可按 `sourceId=gtronick-qss` 返回结果。
- GTRONICK 组件预览请求包含 MaterialDark QSS。
- QSS 物化接口能按能力 ID 返回上游样式文本。
- 打包资产测试验证上游许可证和资源完整。
- 运行相关包测试、桌面完整测试、类型检查和便携包构建。

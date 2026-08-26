# Qt UI Copilot 两阶段界面生成设计

## 目标

将“根据图片和自然语言创建 Qt Widgets `.ui`”从一次性自由生成改为两阶段受控生成。第一阶段优先保证生成、保存和 `uic` 校验成功；第二阶段再逐步提高视觉还原度。

最低兼容版本为 Qt 5.9.6，仅支持 Qt Widgets 和 Qt Designer `.ui` 文件。

## 设计原则

- 首次生成成功率优先于首次视觉还原度。
- 模型不直接生成 XML，也不直接决定任意 Qt 属性结构。
- 基础界面与视觉增强分别验证、分别回退。
- 单个增强属性失败不能推翻已经通过验证的基础界面。
- 用户始终能够保存一个可在 Qt Designer 中继续编辑的候选 `.ui`。

## 总体流程

1. 收集参考图片、界面需求、目标 Qt 版本和上下文模式。
2. 模型生成受限的 `CanonicalUiIntent`。
3. 应用层对意图执行默认值补全、控件降级和名称修复。
4. 确定性生成基础 `.ui`。
5. 执行 XML、语义、objectName 和目标 Qt Kit `uic` 校验。
6. 基础界面通过后立即形成可审批候选和基础预览。
7. 模型基于基础结果生成 `VisualEnhancementPlan`。
8. 应用层逐项应用增强操作，每项都经过协议校验。
9. 执行 `uic` 和预览校验；失败时回退到最后一个有效候选。
10. 用户审批保存，或继续通过对话迭代。

## 第一阶段：Canonical UI Intent

第一阶段只表达稳定的结构信息：

- 根窗口类型：`QWidget`、`QDialog`、`QMainWindow`。
- 标准控件白名单。
- `QVBoxLayout`、`QHBoxLayout`、`QGridLayout`、`QFormLayout`。
- 控件层级、顺序和布局归属。
- objectName、文本、标题、占位文字。
- 基础宽高、stretch 和视觉角色。
- 预期界面结果。

第一阶段禁止模型输出：

- 原始 `.ui XML`。
- 任意 Qt property 对象。
- 字体、sizePolicy、复杂尺寸约束。
- QSS 源码和任意 QRC 路径。
- 信号槽、C++ 业务逻辑和脚本。

### 确定性降级

- 未知控件降级为 `QWidget`；纯文本语义降级为 `QLabel`。
- 未知布局降级为 `QVBoxLayout`。
- 非法 objectName 由应用层净化并去重。
- 缺失尺寸使用根窗口和控件类型的默认值。
- 非核心未知字段被记录为 warning 后忽略。

降级后仍必须通过基础协议和 `uic`，否则不产生可保存候选。

## 第二阶段：Visual Enhancement Plan

第二阶段以受控操作表达视觉增强：

- 字体、字号、粗体、斜体和下划线。
- minimumSize、maximumSize、sizePolicy。
- margins、spacing、stretch。
- 对齐、边框、颜色和有限 QSS token。
- 已验证的图片、QSS 和 QRC 资源引用。
- 图标和视觉角色映射。

每个操作包含目标 objectName、操作类型、规范化值和失败策略。应用层逐项执行：

- 属性合法且 `uic` 通过：保留。
- 属性不支持或格式不合法：跳过并记录 warning。
- 导致 `uic` 失败：撤销该操作，继续后续操作。
- 导致 PreviewHost 失败但 `uic` 通过：保留基础候选，将预览标记为降级。

## 验证与回退

验证分为四级：

1. 协议校验：字段类型、白名单、数量和大小限制。
2. 文档校验：XML、对象名称、层级、连接引用。
3. Qt 校验：使用项目绑定 Qt Kit 的 `uic`。
4. 视觉校验：PreviewHost 截图和可选视觉模型评审。

系统维护三个不可变快照：

- `baseCandidate`：第一阶段通过 `uic` 的基础版本。
- `lastValidCandidate`：最近一次通过 `uic` 的增强版本。
- `workingCandidate`：正在尝试增强的临时版本。

任何增强失败只回退到 `lastValidCandidate`，不会重新执行第一阶段，也不会丢失已验证结果。

## 错误分类与交互

错误分为：

- `provider_retryable`：408、429、5xx；自动重试五次，之后允许人工继续。
- `provider_configuration`：401、403、404；提示检查模型设置，不自动重试。
- `intent_repaired`：第一阶段可自动修复的问题；生成继续，记录 warning。
- `intent_blocked`：无法形成有效结构；显示错误卡片并允许重新生成。
- `enhancement_skipped`：单项增强被跳过；不阻断候选。
- `uic_blocked`：基础候选无法通过 `uic`；阻止保存并展示诊断。
- `preview_degraded`：预览不可用；允许保存已通过 `uic` 的候选。

AI 面板使用 IDE 风格状态卡片显示阶段、摘要、重试和详情。Toast 只用于短时成功或状态提示。完整诊断进入 Problems 面板。

## 状态与进度

创建任务状态为：

- `preparing_context`
- `generating_intent`
- `normalizing_intent`
- `building_base_ui`
- `validating_base_ui`
- `generating_enhancements`
- `applying_enhancements`
- `validating_preview`
- `waiting_approval`
- `failed`
- `cancelled`

进度是阶段型而非虚假百分比。界面显示当前阶段、已完成步骤和可取消状态。

## 模块边界

- `UiIntentPlanner`：模型输入输出，只负责第一阶段意图。
- `UiIntentNormalizer`：默认值、名称修复、白名单和降级。
- `BaseUiGenerator`：确定性生成基础 `.ui`。
- `EnhancementPlanner`：生成受控视觉操作。
- `EnhancementApplier`：逐项应用并维护快照。
- `UiCandidateValidator`：协议、文档、`uic` 和预览验证。
- `UiCreationTaskService`：状态机、取消、重试和事件发布。
- Renderer 状态卡片：进度、警告、错误、重试、审批和详情。

## 测试策略

- Canonical Intent Schema 单元测试。
- 控件与布局降级测试。
- objectName 净化和去重测试。
- 基础 UI 确定性快照测试。
- Qt 5.9.6 与 Qt 6.10.2 `uic` 门禁。
- 每类增强属性的应用和单项回退测试。
- 429 自动重试与人工继续测试。
- PreviewHost 缺失和失败的降级测试。
- 图片创建端到端流程：基础候选、增强候选、审批保存和文件树刷新。

## 非目标

- 不生成 C++ 业务逻辑。
- 不支持 QML。
- 不允许模型写任意 XML、脚本或文件路径。
- 不在本阶段追求像素级一次性复刻。
- 不要求新项目提前配置完整构建和运行链路。

## 成功标准

- 常见参考图在第一阶段稳定生成可被目标 Qt Kit `uic` 接受的 `.ui`。
- 字体、尺寸、QSS 等增强失败不会导致整个任务失败。
- 自动降级和跳过行为在 UI 中可解释、可追踪。
- 用户可在基础候选生成后立即保存，也可等待第二阶段增强。
- Qt 5.9.6 和 Qt 6.10.2 的验证门禁持续通过。

# Qt UI Copilot

面向既有 Qt Widgets / Qt Designer `.ui` 项目的 AI 界面开发与验证应用。

它将受约束的 `.ui` 修改、组件复用、QSS/QRC 增强预览、真实 EXE 运行验证、QtUiProbe、语义导航和可选 UI-TARS 探索串成可审计闭环。

## 当前能力

- 支持最低 Qt 5.9.6，以及后续 Qt 5.x / Qt 6.x 的设计与原生接口。
- `.ui` XML 无损解析、受控操作、候选补丁和字节级回滚。
- 本地 SQLite/FTS 组件库检索；云端向量库是后续可选增强。
- 使用目标 Qt Kit 的 `uic` / `rcc` 做验证和资源预览。
- 测试构建可接入 token 保护的 QtUiProbe，采集真实 Widget 树、截图和语义操作。
- 通过 Electron 界面导入项目、查看组件候选、审批计划、对比截图、查看 XML Diff 并导出证据报告。
- UI-TARS 在独立进程中运行，只用于受窗口范围限制的页面探索；它不是通过判定器。

## 启动开发版本

前提：Node.js 24、Corepack。

```powershell
cd E:\workspace\AI
corepack pnpm@10.15.0 install --ignore-scripts
corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop start
```

首次运行需要 Electron 运行时。如官方源不稳定，可使用镜像：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop rebuild electron
```

开发启动器不会依赖 Forge 的 `start` 进程；正式打包仍使用 Forge。

## 模型配置

应用内的“模型设置”仅在 Electron Main 进程保存 OpenAI-compatible 服务的 `baseUrl`、模型名和 API Key；Renderer 不可读取 API Key。

未配置模型时，应用会返回“需要配置模型服务”，不会伪造计划或修改结果。

## 验证命令

```powershell
corepack pnpm@10.15.0 test
corepack pnpm@10.15.0 typecheck
corepack pnpm@10.15.0 lint
corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop exec playwright test --list
```

Qt 原生矩阵需要实际 Kit。设置对应前缀后执行：

```powershell
$env:QT59_CMAKE_PREFIX_PATH = 'C:\Qt\5.9.6\msvc2017_64'
$env:QT6_CMAKE_PREFIX_PATH = 'C:\Qt\6.8.3\msvc2022_64'
node scripts/verify-qt-matrix.mjs --required
```

没有 Qt Kit 时，该脚本会明确失败，不能将其视为原生验证通过。

## 文档

- [设计文档](docs/superpowers/specs/2026-08-21-qt-ui-copilot-design.md)
- [实施计划](docs/superpowers/plans/2026-08-21-qt-ui-copilot-implementation.md)
- [兼容性与资格门槛](docs/compatibility.md)
- [比赛演示脚本](docs/demo-script.md)
# Qt UI Copilot

Qt Widgets UI development assistant for Qt 5.9.6 and Qt 6.x projects.

## V2

V2 provides a product-style Electron shell with multi-tab navigation, an AI workbench, project/component/task/report pages, unified model and Qt Kit settings, project binding, and real Qt runtime verification. See [the V2 user guide](docs/v2-user-guide.md) and [the implementation plan](docs/superpowers/plans/2026-08-24-qt-ui-copilot-v2-implementation.md).

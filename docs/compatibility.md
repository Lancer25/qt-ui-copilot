# 兼容性与资格门槛

Qt UI Copilot 的 MVP 只支持 Qt Widgets 和 Qt Designer `.ui` 文件；最低 Qt 版本为 **Qt 5.9.6**。QML、纯 C++ 动态界面与任意 Release 应用注入不在支持范围内。

| 能力 | Qt 5.9.6 | Qt 6.x | 资格要求 |
| --- | --- | --- | --- |
| `.ui` 解析、受控修改、`uic` 校验 | 支持 | 支持 | 必须使用项目自身 Kit 的 `uic`/`rcc` |
| 增强预览 | 支持 | 支持 | 每个 Qt Kit、ABI、架构、构建类型独立构建 PreviewHost |
| QtUiProbe | 支持 | 支持 | 仅测试构建、C++11、随机 token、本地 IPC |
| 真实应用验证 | 支持 | 支持 | 需要可重复启动状态与 Probe 接入 |
| UI-TARS 导航 | Windows 实验性 | Windows 实验性 | 成功到达率低于 8/10 时不得作为演示主链路 |

## 本地 Qt 资格验证

不要在没有 Qt Kit 的机器上把原生测试标为通过。每个可用 Kit 的资格验证都会独立配置、构建并运行 QtUiPreviewHost 测试，再构建 Fixture 与 QtUiProbe 测试。明确设置对应 Kit 的 CMake 前缀后执行：

```powershell
$env:QT59_CMAKE_PREFIX_PATH = 'C:\Qt\5.9.6\msvc2017_64'
$env:QT6_CMAKE_PREFIX_PATH = 'C:\Qt\6.8.3\msvc2022_64'
node scripts/verify-qt-matrix.mjs --required
```

脚本退出码：`0` 表示所有要求的 Kit 已通过；`1` 表示配置、构建或测试失败；`2` 表示 Kit 未配置（本地信息状态，**不是通过**）。Qt 5.9.6 资格任务应在具备该遗留 Kit 的 Windows 自托管 runner 上运行；GitHub 托管 runner 不能替代这一证据。

## 打包资产

Windows 包将 `qt-ui-copilot-assets` 放在 `resources` 目录、ASAR 外部。它包含：

- `preview-host/`：按目标 Qt Kit 编译的 PreviewHost 源码；
- `probe/`：目标测试构建要链接的 QtUiProbe C++11 源码和 qmake `.pri`；
- `ui-tars-worker/`：隔离导航 Worker 源码。

发布前自动生成 SHA-256 清单；打包应用启动时逐项校验。校验失败时应用拒绝启动，避免使用不完整或被篡改的辅助资产。它们不是随 Electron 预编译的 Qt 二进制，因而不会错误跨用 Qt ABI。

# Qt UI Copilot V2 使用指南

## 第一次使用

1. 启动应用后，在左侧进入“设置”。
2. 在“模型服务”填写 OpenAI-compatible Base URL、模型 ID 和 API Key。
3. 分别执行文本、JSON 输出和图片理解能力检测。
4. 进入“Qt Kits”，扫描本机 Qt 安装并对目标 Kit 执行健康检查。
5. 进入“项目绑定”，选择项目、Qt Kit、构建目录和目标程序，保存并检查绑定。

## AI 工作台

1. 在“项目”页面导入 Qt Widgets 工程。
2. 打开目标 `.ui` 文件或返回“AI 工作台”选择目标界面。
3. 用自然语言描述修改需求，可附加参考图或复用组件。
4. 查看结构化修改计划，确认风险和操作后点击“批准并应用”。
5. 查看 XML、`uic`、快速预览、视觉评审、构建、Probe 和真实运行状态。
6. 最终结果可接受或回滚，并从“报告”页面导出 HTML 证据。

## 页面与 Tab

- 左侧导航：AI 工作台、项目、组件库、任务、报告、设置。
- `.ui`、任务、报告和设置会以 Tab 打开；同一资源不会重复打开。
- `Ctrl+1` 到 `Ctrl+6` 切换主导航，关闭按钮只出现在可关闭 Tab 上。

## Qt 版本

Qt 5.9.6 和 Qt 6.x 应分别登记为独立 Kit。不要在一个项目中混用不同 Kit 的 `uic`、`rcc` 或 PreviewHost。项目绑定的健康检查失败时，应先修复工具链，再执行真实验证。

## 安全与故障定位

- API Key 只在 Electron Main 进程加密保存，界面和日志不会显示明文。
- 视觉模型响应异常会显示“视觉评审不可用”，但不会伪造视觉通过；确定性检查和真实运行验证仍会继续。
- 构建、启动或路线失败时，打开任务时间线和报告中的对应节点查看脱敏日志。

## 便携打包

在仓库根目录运行：

```powershell
corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop package:portable
```

输出目录为 `apps/desktop/out/qt-ui-copilot-portable-win32-x64`。该命令使用本地 Electron runtime 和校验后的 native assets，不依赖 Forge 在线下载运行时。

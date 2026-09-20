# Windows 一键打包脚本设计

## 目标

在仓库根目录提供 PowerShell 主脚本与 BAT 双击入口，复用现有 `@qt-ui-copilot/desktop` 便携包构建链路，稳定生成可直接运行的 Windows EXE。

## 文件

- `package-windows.ps1`：参数处理、环境检查、测试、类型检查、打包和结果验证。
- `package-windows.bat`：双击入口，调用 PowerShell 脚本并透传参数。

## PowerShell 接口

```powershell
.\package-windows.ps1 `
  [-OutputDirectory <路径>] `
  [-SkipTests] `
  [-Launch] `
  [-OpenFolder]
```

- 默认输出：`dist/qt-ui-copilot-win32-x64`。
- 相对输出路径基于仓库根目录解析；绝对路径保持不变。
- 默认运行 desktop 测试和 TypeScript 类型检查。
- `-SkipTests` 仅跳过测试，不跳过类型检查。
- `-Launch` 在成功后启动生成的 `qt-ui-copilot.exe`。
- `-OpenFolder` 在成功后打开输出目录。

## 构建流程

1. 根据 `$PSScriptRoot` 定位仓库根目录并切换工作目录。
2. 检查 `node`、`pnpm` 和 `dotnet` 是否可用。
3. 检查根目录 `node_modules` 是否存在；缺失时给出 `pnpm install` 指引，不自动联网安装。
4. 验证输出目录不是仓库根目录、磁盘根目录或其它明显危险目标。
5. 默认执行 desktop 测试，再执行 desktop 类型检查。
6. 临时设置 `PORTABLE_OUTPUT`，调用现有 `pnpm --filter @qt-ui-copilot/desktop package:portable`。
7. 恢复调用前的 `PORTABLE_OUTPUT` 环境变量。
8. 验证输出目录中的 `qt-ui-copilot.exe` 和 `runtime/electron.exe` 均存在。
9. 输出成果物路径，并按参数启动程序或打开文件夹。

任何外部命令返回非零退出码时立即停止，打印失败阶段，并向 BAT 返回非零退出码。

## BAT 行为

- 使用 `%~dp0` 定位同目录的 `package-windows.ps1`。
- 通过 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File` 调用。
- 使用 `%*` 原样透传参数。
- 失败时显示退出码并 `pause`，便于双击运行时查看错误。
- 成功时输出 EXE 路径并正常退出。

## 验收

1. 从仓库根目录和其它当前目录调用脚本均可成功打包。
2. 默认目录生成 `qt-ui-copilot.exe` 与 Electron runtime。
3. `-SkipTests`、自定义输出目录和 `-Launch` 参数正常工作。
4. 无效工具或危险输出路径会明确失败。
5. BAT 能调用 PowerShell 脚本并正确传递退出码。

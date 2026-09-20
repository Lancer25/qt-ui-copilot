# 便携版 Qt Kit 扫描修复设计

## 问题

新设备点击“扫描 Qt Kits”后，IPC `settings:qtKits:scan` 抛出 Zod `invalid_union`。扫描器会把无法推断的可选字段显式写成 `undefined`，例如不含 `64` 的 ABI 目录产生 `architecture: undefined`，缺少 `qmake.exe` 时产生 `qmake: undefined`。设置仓库只接受合法 JSON 值，因此拒绝保存该 Kit。

## 数据修复

- `QtKitService.scan()` 只在值存在时添加 `qmake` 和 `architecture` 属性。
- `compilerAbi`、`cmakePrefixPath` 等确定字段保持不变。
- 不放宽设置仓库的 JSON Schema，也不在仓库层静默清理错误数据。
- 扫描器返回的每个 Kit 都必须能通过 `JSON.stringify` 往返且不包含 `undefined`。

## 扫描目录

生产默认根目录按去重后的顺序包含：

1. `QT_ROOT`
2. `QTDIR` 推导出的 Qt 安装根目录
3. `C:/Qt`
4. `D:/Qt`
5. `E:/Qt`
6. 现有兼容目录 `D:/Qt5.9.6` 与 `D:/Qt6.10.2`
7. 非 Windows 的 `/opt/Qt`

不存在或不可读取的根目录继续安全跳过，不视为错误。

## 界面错误处理

- `QtKitsPanel` 捕获加载、扫描和健康检查异常。
- 扫描按钮在失败后恢复可用。
- 面板内显示简短中文错误，例如“扫描 Qt Kits 失败：……”。
- 不把完整 IPC 堆栈直接展示给用户；保留有帮助的末端错误信息。
- 成功重新扫描后清除旧错误。

## 测试

1. ABI 目录不含 `64` 时，扫描结果不拥有 `architecture` 属性，并可保存到 `SettingsRepository`。
2. 缺少 `qmake.exe` 时，扫描结果不拥有 `qmake` 属性，并可保存。
3. Windows 混合目录结构仍发现 Qt 5 和 Qt 6 Kit。
4. 渲染器扫描失败时显示友好错误并恢复按钮。
5. 便携包重新构建并从仓库外目录启动验证。

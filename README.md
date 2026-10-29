# Qt UI Copilot

面向 Qt Widgets / Qt Designer 项目的桌面开发助手，支持 AI 界面调整、组件复用、QSS/QRC 预览和构建验证。

## 功能

- 导入 Qt 项目，浏览界面、样式、资源和源码。
- 生成和调整 `.ui`，审核 Diff 后保存。
- UI 与 QSS 分离，维护既有项目时沿用原结构。
- 本地控件库与只读 MCP 组件来源接入。
- Qt Kit 管理、原生预览、构建运行及任务历史。

源码控件预览需要完整依赖与兼容编译器。扫描结果不等同于原生构建验证通过。

## 开发

需要 Node.js 24、pnpm 10.15，以及原生预览所需的 Qt/C++ 工具链。

```powershell
git clone https://github.com/Lancer25/qt-ui-copilot.git
cd qt-ui-copilot
corepack pnpm@10.15.0 install
corepack pnpm@10.15.0 --filter @qt-ui-copilot/desktop start
```

模型服务和 Qt Kit 请在应用内自行配置。仓库不包含个人模型配置、API 密钥、运行数据库和本机工具缓存。

## 验证与打包

```powershell
pnpm typecheck
pnpm test
.\package-windows.bat
.\make-windows-installer.bat
```

便携版须复制整个输出目录。原生测试需要本机实际安装的 Qt Kit。

## 文档与许可

- [用户指南](docs/v3-user-guide.md)
- [兼容性说明](docs/compatibility.md)
- [MIT 许可证](LICENSE)
- [第三方资源声明](resources/component-library/THIRD_PARTY_NOTICES.md)

第三方资源和依赖继续适用各自许可证。

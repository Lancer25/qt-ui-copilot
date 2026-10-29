# 新应用 UI/QSS 分离设计

## 目标

新建 Qt 应用时将界面结构与样式分离；维护已有项目时识别并沿用原项目的 UI、QSS、QRC 和构建结构。

## 新应用产物

- `ui/<name>.ui`：控件、布局和必要属性，移除内联 `styleSheet`。
- `styles/app.qss`：全局色彩、字体、间距、圆角及控件状态。
- `resources/app.qrc`：以 `:/styles/app.qss` 嵌入样式。
- `main.cpp`：启动时读取嵌入的 QSS 并调用 `QApplication::setStyleSheet`。
- `.pro`：登记 `FORMS` 和 `RESOURCES`。

候选预览直接加载暂存目录中的 QSS/QRC；审批保存后，将资源路径登记到项目预览配置。

## 已有项目规则

检测到 `.pro`、`CMakeLists.txt`、`.sln` 或 `.vcxproj` 时视为已有工程。创建或修改 UI 时保留现有目录和样式方式；存在 QSS/QRC 则复用，没有则不自动引入新样式体系。

## 校验

覆盖脚手架文件、内联样式清理、QRC 引用、QMake 资源登记、候选预览资源和已有项目不新增 QSS 的测试。

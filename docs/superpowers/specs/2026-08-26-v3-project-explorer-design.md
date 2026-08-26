# Qt UI Copilot V3 Project Explorer 设计

## 目标

将 V3 Explorer 从扁平 `.ui` 文件列表升级为 VS Code 风格项目目录树，支持安全的文件管理、状态装饰和 AI 上下文操作。所有文件系统操作由 Main 进程执行并验证工作区边界。

## 范围

第一阶段支持：

- 目录层级浏览。
- 新建文件、新建文件夹。
- 重命名。
- 删除到系统回收站。
- 永久删除。
- 刷新、全部折叠、名称过滤。
- 复制相对/绝对路径、系统资源管理器定位。
- 加入/移除 AI 上下文。
- Git、AI、活动文件和诊断状态装饰。
- 键盘导航和可访问性。

暂不支持跨目录拖拽移动、多选批量操作、多根工作区和内置 Git 提交。

## 数据模型

```ts
interface WorkspaceTreeNode {
  id: string;
  workspaceId: string;
  name: string;
  relativePath: string;
  kind: 'directory' | 'file';
  fileKind?: WorkspaceFileKind;
  size?: number;
  modifiedAt?: number;
  children?: WorkspaceTreeNode[];
  decorations: Array<'active' | 'git_modified' | 'git_untracked' | 'ai_created' | 'ai_modified' | 'warning' | 'error'>;
}
```

节点 ID 由 workspace ID 和规范化相对路径生成。目录在 Main 中构建并稳定排序：目录优先，其次文件，名称按不区分大小写排序并以原始名称稳定决胜。

## 默认隐藏规则

默认隐藏：

- `.git`
- `.svn`
- `node_modules`
- 常见 build 目录
- `.qt-ui-copilot/candidates`
- `.qt-ui-copilot/preview-cache`
- `.qt-ui-copilot/tasks`
- 临时预览图和生成中间文件

`.qt-ui-copilot/project.json` 不计入普通项目文件总数，也不在默认树中展示。设置页仍可读写它。用户可以打开“显示隐藏文件”，但受保护文件仍不能删除。

## 界面布局

```text
EXPLORER                 ＋  ⟳  ⊟  ⋯
────────────────────────────────
⌕ 按名称过滤文件

▾ qtDemo
  ▾ src
      main.cpp                 M
      MainWindow.cpp           AI
      MainWindow.h
  ▾ ui
      MainWindow.ui            ●
      Settings.ui
  ▸ resources
  ▸ styles
```

顶部工具栏：新建、刷新、全部折叠、更多。新建按钮默认创建文件，旁边菜单可创建目录。

长文件名单行省略；悬停展示完整相对路径。目录树使用虚拟滚动的接口边界，首版可先使用普通渲染，在节点超过 2000 时启用窗口化。

## 打开行为

- 单击文件：临时预览 Tab。
- 双击文件：固定 Tab。
- Enter：打开或切换目录。
- Left：折叠当前目录；已折叠时移动到父目录。
- Right：展开当前目录；已展开时移动到第一个子节点。
- Up/Down：移动焦点。
- 当前活动文件显示 `●` 和高亮背景。

仅 `.ui` 文件进入 Qt 预览编辑器。文本、QSS、QRC、CMake 和源码可进入只读文本 Tab，后续再提供编辑能力。

## 工具栏和右键菜单

工具栏：

- 新建文件。
- 新建文件夹。
- 刷新。
- 全部折叠。
- 显示/隐藏内部文件。

右键菜单：

- 打开。
- 在新 Tab 打开。
- 新建文件/文件夹。
- 重命名。
- 删除到回收站。
- 永久删除。
- 复制相对路径。
- 复制绝对路径。
- 在系统资源管理器中定位。
- 加入 AI 上下文。
- 从 AI 上下文移除。
- 将文件作为创建界面参考。
- 刷新此目录。

## Main 文件操作 API

```ts
createFile(input: { workspaceId: string; parentPath: string; name: string }): Promise<WorkspaceTreeNode>;
createDirectory(input: { workspaceId: string; parentPath: string; name: string }): Promise<WorkspaceTreeNode>;
renameEntry(input: { workspaceId: string; sourcePath: string; newName: string }): Promise<{ oldPath: string; newPath: string }>;
trashEntry(input: { workspaceId: string; relativePath: string }): Promise<void>;
deleteEntryPermanently(input: { workspaceId: string; relativePath: string; confirmation: string }): Promise<void>;
revealEntry(input: { workspaceId: string; relativePath: string }): Promise<void>;
listTree(input: { workspaceId: string; showInternal?: boolean }): Promise<WorkspaceTreeNode>;
```

Renderer 不直接使用 Node 文件系统。

## 路径安全

所有操作必须：

1. 拒绝绝对路径、空路径、`..` 和 NUL。
2. 解析为绝对路径后验证仍位于 workspace root 内。
3. 对每个路径段执行 `lstat`，拒绝符号链接逃逸。
4. 禁止覆盖现有文件。
5. 禁止操作工作区根目录和 `.git`。
6. 禁止删除 `.qt-ui-copilot/project.json`。
7. 禁止删除正在生成、验证或提交的候选。

## 删除到回收站

- 使用 Electron `shell.trashItem`。
- 删除文件前确认名称。
- 删除目录前显示包含的文件和子目录数量。
- 成功提示“已移动到系统回收站，可从回收站恢复”。
- 删除已打开文件后关闭对应 Tab。
- 清理对应 AI 上下文引用。

## 永久删除

- 菜单使用危险样式并与普通删除分组。
- `Shift+Delete` 触发永久删除。
- 文件永久删除需要二次确认。
- 非空目录需要输入目录名称确认。
- 确认值必须与节点 name 完全一致。
- Main 在确认后再次检查路径、类型和保护规则。
- 删除文件使用 `unlink`；目录使用受控递归删除。
- 永久删除无法撤销，应用不得显示误导性的撤销操作。

## 文件创建与重命名

- 创建采用树内输入框，Enter 提交、Escape 取消。
- 文件名禁止 Windows 保留名、路径分隔符和尾随点/空格。
- 新建 `.ui` 可选择空 QWidget/QDialog/QMainWindow 模板。
- 重命名目录后更新子节点路径、打开 Tab、AI 上下文和 watcher 基线。
- 目标已存在时拒绝操作，不自动覆盖或追加数字。

## 过滤和刷新

- 过滤仅匹配名称和相对路径，不读取文件内容。
- 命中子节点时保留其祖先目录。
- 清除过滤后恢复此前展开状态。
- 文件 watcher 自动刷新。
- 手动刷新重新扫描并保留仍存在节点的展开状态和焦点。

## 状态装饰

- `M`：Git modified。
- `U`：Git untracked。
- `AI`：AI 创建或修改。
- `●`：活动文件。
- 黄色：资源/依赖警告。
- 红色：不可访问、解析或校验失败。

Git 状态通过只读 `git status --porcelain=v1 -z` 获取。Git 不可用或目录不是仓库时不显示装饰，不影响 Explorer。

AI 状态由任务和 revision 事件维护。AI 标记在用户保存、接受或外部修改后按明确规则清除。

## AI 上下文

- 文件加入上下文时记录路径、类型、hash 和显式选择状态。
- 目录加入上下文只记录 scope，不立即读取所有文件。
- 模型请求时再按上下文模式和 token 限制读取。
- 删除或重命名时同步更新上下文。
- 图片、`.ui`、QSS、QRC 可拖入创建界面附件区。

## 错误交互

- 文件操作错误显示节点附近的内联提示和 IDE 错误卡片。
- 路径冲突保留输入框，允许用户修改。
- watcher 外部删除不弹确认，只关闭/标记失效 Tab。
- 权限错误显示系统错误摘要，详细信息可展开和复制。

## 测试

- 目录树排序和过滤。
- 默认隐藏内部目录。
- 创建/重命名路径安全。
- 回收站调用测试。
- 永久删除文件和非空目录确认测试。
- `.git`、根目录、project.json 和候选保护测试。
- symlink/junction 逃逸测试。
- Tab 和 AI 上下文同步测试。
- 自动/手动刷新与展开状态保持。
- 键盘导航和可访问性测试。
- Windows/Linux E2E 文件操作测试。

## 成功标准

- Explorer 展示真实项目层级，不显示候选临时文件。
- 常用文件操作无需离开应用。
- 普通删除可恢复，永久删除具有明确确认和安全边界。
- 文件变化能正确同步 Tab、AI 上下文和状态装饰。
- 大型项目中交互保持可用且过滤结果稳定。

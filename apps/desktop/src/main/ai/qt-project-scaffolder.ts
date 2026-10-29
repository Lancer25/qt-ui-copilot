import path from 'node:path';
import type { BinaryComponentBuildMetadata } from '@qt-ui-copilot/contracts';

export interface QtProjectScaffoldInput {
  appName: string;
  uiRelativePath: string;
  uiSource: string;
  rootType: 'QWidget' | 'QDialog' | 'QMainWindow';
  backend: 'qmake' | 'msbuild';
  additionalQss?: string[];
  /** Approved binary widgets selected for this generated application. */
  binaryComponents?: BinaryComponentBuildMetadata[];
}

export const stripUiInlineStyles = (source: string): string => source.replace(/\s*<property\s+name=["']styleSheet["']>[\s\S]*?<\/property>/gi, '');

const qmakePath = (value: string): string => value.replaceAll('\\', '/').replaceAll('"', '\\"');
const sourceFile = (component: BinaryComponentBuildMetadata, relativePath: string): string => qmakePath(path.resolve(component.sourceRoot, relativePath));

function qmakeBinaryIntegration(components: readonly BinaryComponentBuildMetadata[]): string {
  if (!components.length) return '';
  const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];
  const includes = unique(components.map((component) => sourceFile(component, component.includeDir ?? path.dirname(component.headerPath))));
  const headers = unique(components.map((component) => sourceFile(component, component.headerPath)));
  const sources = unique(components.flatMap((component) => (component.sourcePaths ?? []).map((relative) => sourceFile(component, relative))));
  const libraries = unique(components.flatMap((component) => component.libPath ? [sourceFile(component, component.libPath)] : []));
  const qrc = unique(components.flatMap((component) => component.qrcPath ? [sourceFile(component, component.qrcPath)] : []));
  const qss = unique(components.flatMap((component) => component.qssPath ? [sourceFile(component, component.qssPath)] : []));
  const runtimeDlls = unique(components.flatMap((component) => [component.dllPath, ...component.runtimeDllPaths].filter((value): value is string => Boolean(value)).map((value) => sourceFile(component, value))));
  const modules = unique(components.flatMap((component) => component.qtModules)).filter((module) => module.toLowerCase() !== 'widgets' && module.toLowerCase() !== 'uitools');
  const quote = (value: string) => `$$quote(${value})`;
  const lines = [
    '',
    '# Approved Qt binary component libraries (generated; paths remain external to the project).',
    ...(modules.length ? [`QT += ${modules.join(' ')}`] : []),
    ...(includes.length ? [`INCLUDEPATH += ${includes.map(quote).join(' ')}`] : []),
    ...(headers.length ? [`HEADERS += ${headers.map(quote).join(' ')}`] : []),
    ...(sources.length ? [`SOURCES += ${sources.map(quote).join(' ')}`] : []),
    ...(libraries.length ? [`LIBS += ${libraries.map(quote).join(' ')}`, `PRE_TARGETDEPS += ${libraries.map(quote).join(' ')}`] : []),
    ...(qrc.length ? [`RESOURCES += ${qrc.map(quote).join(' ')}`] : []),
    ...(qss.length ? [`QT_UI_COPILOT_COMPONENT_QSS += ${qss.map(quote).join(' ')}`] : []),
    ...runtimeDlls.map((dll) => `QMAKE_POST_LINK += $$quote(copy /Y "${dll.replaceAll('/', '\\')}" "$$OUT_PWD\\")`),
  ];
  return `${lines.join('\n')}\n`;
}

export function createQtProjectScaffold(input: QtProjectScaffoldInput): Record<string, string> {
  const uiPath = input.uiRelativePath.replaceAll('\\', '/').replace(/^\.\//, '');
  if (!uiPath || uiPath.startsWith('/') || uiPath.split('/').includes('..') || !uiPath.toLowerCase().endsWith('.ui')) throw new Error('uiRelativePath must be a relative .ui path');
  const appName = input.appName.replace(/[^A-Za-z0-9_-]/g, '_').replace(/^[-_]+$/, 'App') || 'QtApp';
  const proPath = `${appName}.pro`;
  const uiSource = stripUiInlineStyles(input.uiSource);
  const binaryComponents = input.binaryComponents ?? [];
  const qss = `QWidget {
    background-color: #f5f7fb;
    color: #1f2937;
    font-family: "Segoe UI", "Microsoft YaHei UI";
    font-size: 14px;
}
QMainWindow, QDialog { background-color: #f5f7fb; }
QPushButton {
    min-height: 32px;
    padding: 0 14px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background-color: #ffffff;
}
QPushButton:hover { border-color: #4f7ee8; color: #315fca; }
QPushButton:pressed { background-color: #e8eefc; }
QLineEdit, QTextEdit, QPlainTextEdit, QComboBox, QSpinBox, QDoubleSpinBox {
    min-height: 32px;
    padding: 0 9px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background-color: #ffffff;
    selection-background-color: #4f7ee8;
}
QLineEdit:focus, QTextEdit:focus, QPlainTextEdit:focus, QComboBox:focus { border-color: #4f7ee8; }
QHeaderView::section { padding: 7px; border: 0; border-bottom: 1px solid #dbe2ea; background-color: #eef2f7; font-weight: 600; }
QTableView, QListView, QTreeView { border: 1px solid #dbe2ea; border-radius: 6px; background-color: #ffffff; alternate-background-color: #f8fafc; }
QToolTip { border: 1px solid #cbd5e1; padding: 5px; background-color: #ffffff; color: #1f2937; }
QFrame[componentRole="card"], QGroupBox[componentRole="card"] { background-color: #ffffff; border: 1px solid #dbe3ef; border-radius: 8px; }
QFrame[componentRole="toolbar"] { background-color: #f8fafc; border: 1px solid #dbe3ef; border-radius: 7px; }
QFrame[finderTone="success"] { background-color: #ecfdf5; border: 1px solid #86efac; border-radius: 7px; }
QFrame[finderTone="warning"] { background-color: #fffbeb; border: 1px solid #fcd34d; border-radius: 7px; }
QLabel[heading="true"] { color: #172033; font-size: 18px; font-weight: 600; }
QLabel[muted="true"] { color: #64748b; }
QLabel[metric="true"] { color: #245eea; font-size: 24px; font-weight: 700; }
QPushButton[primary="true"] { color: #ffffff; background-color: #356fe5; border-color: #356fe5; }
QPushButton[primary="true"]:hover { background-color: #285fcf; }
${(input.additionalQss ?? []).map((stylesheet, index) => `\n/* Reused component stylesheet ${index + 1} */\n${stylesheet.trim()}\n`).join('')}${binaryComponents.flatMap((component) => component.qssPath ? [`\n/* External component QSS: ${component.qssPath} (declared in ${appName}.pro) */\n`] : []).join('')}`;
  const files: Record<string, string> = {
    [uiPath]: uiSource,
    'styles/app.qss': qss,
    'resources/app.qrc': `<RCC>\n  <qresource prefix="/">\n    <file alias="styles/app.qss">../styles/app.qss</file>\n  </qresource>\n</RCC>\n`,
    'main.cpp': `#include <QApplication>\n#include <QFile>\n#include <QWidget>\n#include <QtUiTools/QUiLoader>\n\nint main(int argc, char *argv[]) {\n    QApplication app(argc, argv);\n    QFile style(QStringLiteral(":/styles/app.qss"));\n    if (style.open(QIODevice::ReadOnly | QIODevice::Text))\n        app.setStyleSheet(QString::fromUtf8(style.readAll()));\n    QUiLoader loader;\n    QFile file(QStringLiteral("${uiPath}"));\n    if (!file.open(QIODevice::ReadOnly)) return 1;\n    QWidget *window = loader.load(&file, nullptr);\n    file.close();\n    if (!window) return 2;\n    window->show();\n    return app.exec();\n}\n`,
    [proPath]: `QT += widgets uitools\nCONFIG += c++17\nSOURCES += main.cpp\nFORMS += ${uiPath}\nRESOURCES += resources/app.qrc\nTARGET = ${appName}\n${qmakeBinaryIntegration(binaryComponents)}`,
  };
  if (input.backend === 'msbuild') files['BUILD-MSBUILD.md'] = `# MSBuild 构建说明\n\n先使用 Qt Kit 的 qmake 将项目转换为 Visual Studio 工程：\n\n    qmake -tp vc ${proPath}\n`;
  return files;
}

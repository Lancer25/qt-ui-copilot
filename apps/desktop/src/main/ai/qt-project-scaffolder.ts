export interface QtProjectScaffoldInput {
  appName: string;
  uiRelativePath: string;
  uiSource: string;
  rootType: 'QWidget' | 'QDialog' | 'QMainWindow';
  backend: 'qmake' | 'msbuild';
}

export function createQtProjectScaffold(input: QtProjectScaffoldInput): Record<string, string> {
  const uiPath = input.uiRelativePath.replaceAll('\\', '/').replace(/^\.\//, '');
  if (!uiPath || uiPath.startsWith('/') || uiPath.split('/').includes('..') || !uiPath.toLowerCase().endsWith('.ui')) throw new Error('uiRelativePath must be a relative .ui path');
  const appName = input.appName.replace(/[^A-Za-z0-9_-]/g, '_').replace(/^[-_]+$/, 'App') || 'QtApp';
  const proPath = `${appName}.pro`;
  const files: Record<string, string> = {
    [uiPath]: input.uiSource,
    'main.cpp': `#include <QApplication>\n#include <QFile>\n#include <QWidget>\n#include <QtUiTools/QUiLoader>\n\nint main(int argc, char *argv[]) {\n    QApplication app(argc, argv);\n    QUiLoader loader;\n    QFile file(QStringLiteral("${uiPath}"));\n    if (!file.open(QIODevice::ReadOnly)) return 1;\n    QWidget *window = loader.load(&file, nullptr);\n    file.close();\n    if (!window) return 2;\n    window->show();\n    return app.exec();\n}\n`,
    [proPath]: `QT += widgets uitools\nCONFIG += c++11\nSOURCES += main.cpp\nFORMS += ${uiPath}\nTARGET = ${appName}\n`,
  };
  if (input.backend === 'msbuild') files['BUILD-MSBUILD.md'] = `# MSBuild 构建说明\n\n先使用 Qt Kit 的 qmake 将项目转换为 Visual Studio 工程：\n\n    qmake -tp vc ${proPath}\n`;
  return files;
}

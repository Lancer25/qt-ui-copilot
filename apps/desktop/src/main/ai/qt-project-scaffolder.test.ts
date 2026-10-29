import { describe, expect, it } from 'vitest';
import { createQtProjectScaffold } from './qt-project-scaffolder';

describe('Qt project scaffolder', () => {
  it('creates a qmake widgets project and launcher', () => {
    const files = createQtProjectScaffold({ appName: 'Demo', uiRelativePath: 'ui/Main.ui', uiSource: '<ui/>', rootType: 'QWidget', backend: 'qmake' });
    expect(files['Demo.pro']).toContain('QT += widgets uitools');
    expect(files['Demo.pro']).toContain('SOURCES += main.cpp');
    expect(files['Demo.pro']).toContain('FORMS += ui/Main.ui');
    expect(files['Demo.pro']).toContain('RESOURCES += resources/app.qrc');
    expect(files['main.cpp']).toContain('QApplication');
    expect(files['main.cpp']).toContain('ui/Main.ui');
    expect(files['main.cpp']).toContain(':/styles/app.qss');
    expect(files['styles/app.qss']).toContain('QPushButton');
    expect(files['resources/app.qrc']).toContain('../styles/app.qss');
  });

  it('keeps appearance out of the generated ui source', () => {
    const files = createQtProjectScaffold({ appName: 'Demo', uiRelativePath: 'ui/Main.ui', uiSource: '<ui><widget><property name="styleSheet"><string>color:red</string></property></widget></ui>', rootType: 'QWidget', backend: 'qmake' });
    expect(files['ui/Main.ui']).not.toContain('styleSheet');
    expect(files['styles/app.qss']).toContain('color: #1f2937');
  });

  it('merges selected component rules into the separate application QSS', () => {
    const files = createQtProjectScaffold({ appName: 'Demo', uiRelativePath: 'ui/Main.ui', uiSource: '<ui/>', rootType: 'QWidget', backend: 'qmake', additionalQss: ['QFrame#card { border: 0; }'] });
    expect(files['styles/app.qss']).toContain('Reused component stylesheet 1');
    expect(files['styles/app.qss']).toContain('QFrame#card { border: 0; }');
    expect(files['ui/Main.ui']).not.toContain('QFrame#card');
  });

  it('marks msbuild projects for qmake vc conversion', () => {
    const files = createQtProjectScaffold({ appName: 'Demo', uiRelativePath: 'Main.ui', uiSource: '<ui/>', rootType: 'QMainWindow', backend: 'msbuild' });
    expect(files['Demo.pro']).toContain('QT += widgets uitools');
    expect(files['BUILD-MSBUILD.md']).toContain('qmake -tp vc');
  });

  it('adds approved binary component include, link, resource and runtime DLL metadata to qmake projects', () => {
    const files = createQtProjectScaffold({ appName: 'Demo', uiRelativePath: 'ui/Main.ui', uiSource: '<ui/>', rootType: 'QWidget', backend: 'qmake', binaryComponents: [{ className: 'FancyCard', baseClass: 'QWidget', headerPath: 'include/FancyCard.hpp', includeDir: 'include', libPath: 'lib/FancyCard.lib', libDir: 'lib', dllPath: 'bin/FancyCard.dll', runtimeDllPaths: ['bin/FancySupport.dll'], qssPath: 'styles/fancy.qss', qrcPath: 'resources/fancy.qrc', qtModules: ['Widgets', 'Network'], sourceRoot: 'C:/Components/Fancy' }] });
    expect(files['Demo.pro']).toContain('INCLUDEPATH += $$quote(C:/Components/Fancy/include)');
    expect(files['Demo.pro']).toContain('LIBS += $$quote(C:/Components/Fancy/lib/FancyCard.lib)');
    expect(files['Demo.pro']).toContain('PRE_TARGETDEPS += $$quote(C:/Components/Fancy/lib/FancyCard.lib)');
    expect(files['Demo.pro']).toContain('RESOURCES += $$quote(C:/Components/Fancy/resources/fancy.qrc)');
    expect(files['Demo.pro']).toContain('QT_UI_COPILOT_COMPONENT_QSS += $$quote(C:/Components/Fancy/styles/fancy.qss)');
    expect(files['Demo.pro']).toContain('copy /Y "C:\\Components\\Fancy\\bin\\FancyCard.dll"');
    expect(files['styles/app.qss']).toContain('External component QSS: styles/fancy.qss');
  });

  it('adds source and header-only Qt controls without requiring a DLL or LIB', () => {
    const files = createQtProjectScaffold({ appName: 'SourceDemo', uiRelativePath: 'ui/Main.ui', uiSource: '<ui/>', rootType: 'QWidget', backend: 'qmake', binaryComponents: [{ className: 'IconButton', baseClass: 'QWidget', headerPath: 'include/IconButton.h', includeDir: 'include', sourcePaths: ['src/IconButton.cpp'], runtimeDllPaths: [], qtModules: ['Widgets'], sourceRoot: 'C:/Components/Controls' }, { className: 'BadgeLabel', baseClass: 'QWidget', headerPath: 'include/BadgeLabel.hpp', includeDir: 'include', sourcePaths: [], runtimeDllPaths: [], qtModules: ['Widgets'], sourceRoot: 'C:/Components/Controls' }] });

    expect(files['SourceDemo.pro']).toContain('HEADERS += $$quote(C:/Components/Controls/include/IconButton.h)');
    expect(files['SourceDemo.pro']).toContain('SOURCES += $$quote(C:/Components/Controls/src/IconButton.cpp)');
    expect(files['SourceDemo.pro']).not.toContain('LIBS +=');
  });
});

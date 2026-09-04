import { describe, expect, it } from 'vitest';
import { createQtProjectScaffold } from './qt-project-scaffolder';

describe('Qt project scaffolder', () => {
  it('creates a qmake widgets project and launcher', () => {
    const files = createQtProjectScaffold({ appName: 'Demo', uiRelativePath: 'ui/Main.ui', uiSource: '<ui/>', rootType: 'QWidget', backend: 'qmake' });
    expect(files['Demo.pro']).toContain('QT += widgets uitools');
    expect(files['Demo.pro']).toContain('SOURCES += main.cpp');
    expect(files['Demo.pro']).toContain('FORMS += ui/Main.ui');
    expect(files['main.cpp']).toContain('QApplication');
    expect(files['main.cpp']).toContain('ui/Main.ui');
  });

  it('marks msbuild projects for qmake vc conversion', () => {
    const files = createQtProjectScaffold({ appName: 'Demo', uiRelativePath: 'Main.ui', uiSource: '<ui/>', rootType: 'QMainWindow', backend: 'msbuild' });
    expect(files['Demo.pro']).toContain('QT += widgets uitools');
    expect(files['BUILD-MSBUILD.md']).toContain('qmake -tp vc');
  });
});

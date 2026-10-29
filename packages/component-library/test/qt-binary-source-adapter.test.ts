import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { QtBinarySourceAdapter } from '../src/qt-binary-source-adapter.js';

describe('QtBinarySourceAdapter', () => {
  it('conservatively discovers QWidget classes and associates same-stem binaries and resources', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'qt-binary-source-'));
    await mkdir(path.join(root, 'styles'));
    await mkdir(path.join(root, 'resources'));
    await writeFile(path.join(root, 'FancyCard.hpp'), `
      class FancyCard : public QWidget {
        Q_OBJECT
        Q_PROPERTY(QString title READ title WRITE setTitle)
      };
    `);
    await writeFile(path.join(root, 'FancyCard.lib'), 'fixture import library');
    await writeFile(path.join(root, 'FancyCard.dll'), 'fixture dynamic library');
    await writeFile(path.join(root, 'styles', 'fancy.qss'), 'FancyCard { color: #fff; }');
    await writeFile(path.join(root, 'resources', 'fancy.qrc'), '<RCC/>');

    const items = await new QtBinarySourceAdapter().discover({ sourceId: 'binary', rootDir: root, discovery: 'scan' });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ componentId: 'fancycard.hpp-fancycard', className: 'FancyCard', baseClass: 'QWidget', headerPath: 'FancyCard.hpp', dllPath: 'FancyCard.dll', libPath: 'FancyCard.lib', qssPath: 'styles/fancy.qss', qrcPath: 'resources/fancy.qrc', hasQObject: true, status: 'needs_mapping' });
    for (const item of items) for (const relative of [item.headerPath, item.dllPath, item.libPath, item.qssPath, item.qrcPath]) if (relative) expect(relative).not.toMatch(/(^[\\/]|\.\.[\\/]|^[A-Za-z]:)/);
  });

  it('skips symlinked trees and rejects unsafe roots', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'qt-binary-source-safe-'));
    const outside = await mkdtemp(path.join(tmpdir(), 'qt-binary-source-outside-'));
    await writeFile(path.join(outside, 'Outside.hpp'), 'class Outside : public QWidget { Q_OBJECT };');
    await symlink(outside, path.join(root, 'linked'), 'junction');
    await writeFile(path.join(root, 'Safe.hpp'), 'class Safe : public QWidget { Q_OBJECT };');
    const adapter = new QtBinarySourceAdapter();
    const items = await adapter.discover({ sourceId: 'binary', rootDir: root, discovery: 'scan' });
    expect(items.map((item) => item.className)).toEqual(['Safe']);
    await expect(adapter.discover({ sourceId: 'binary', rootDir: path.join(root, 'linked'), discovery: 'scan' })).rejects.toThrow(/symbolic link|not a directory/i);
  });

  it('uses a safe component-library.json manifest and hybrid-deduplicates declared headers', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'qt-binary-manifest-'));
    await writeFile(path.join(root, 'FancyCard.hpp'), 'class FancyCard : public QWidget { Q_OBJECT };');
    await writeFile(path.join(root, 'FancyCard.lib'), 'fixture import library');
    await writeFile(path.join(root, 'FancyCard.dll'), 'fixture dynamic library');
    await writeFile(path.join(root, 'LooseDialog.hpp'), 'class LooseDialog : public QDialog { Q_OBJECT };');
    await writeFile(path.join(root, 'component-library.json'), JSON.stringify({ components: [{
      componentId: 'fancycard', className: 'FancyCard', baseClass: 'QWidget', headerPath: 'FancyCard.hpp',
      dllPath: 'FancyCard.dll', libPath: 'FancyCard.lib', qtModules: ['widgets'],
    }] }));

    const adapter = new QtBinarySourceAdapter();
    const manifest = await adapter.discover({ sourceId: 'binary', rootDir: root, discovery: 'manifest' });
    expect(manifest).toHaveLength(1);
    expect(manifest[0]).toMatchObject({ className: 'FancyCard', status: 'needs_mapping', headerPath: 'FancyCard.hpp' });
    const hybrid = await adapter.discover({ sourceId: 'binary', rootDir: root, discovery: 'hybrid' });
    expect(hybrid.map((item) => item.componentId)).toEqual(['fancycard', 'loosedialog.hpp-loosedialog']);

    await writeFile(path.join(root, 'component-library.json'), JSON.stringify({ components: [{ componentId: 'unsafe', className: 'Unsafe', baseClass: 'QWidget', headerPath: '../outside.hpp', qtModules: [] }] }));
    await expect(adapter.discover({ sourceId: 'binary', rootDir: root, discovery: 'manifest' })).rejects.toThrow(/relative|escapes source root/i);
  });

  it('follows in-library custom base classes and retains unresolved Q_OBJECT candidates', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'qt-binary-inheritance-'));
    await writeFile(path.join(root, 'HuiBase.hpp'), 'class HuiBase : public QWidget { Q_OBJECT };');
    await writeFile(path.join(root, 'HuiButton.hpp'), 'class HUI_EXPORT HuiButton : public HuiBase { Q_OBJECT };');
    await writeFile(path.join(root, 'ExternalWidget.hpp'), 'class ExternalWidget : public VendorWidget { Q_OBJECT };');

    const items = await new QtBinarySourceAdapter().discover({ sourceId: 'hui', rootDir: root, discovery: 'scan' });
    const button = items.find((item) => item.className === 'HuiButton');
    const external = items.find((item) => item.className === 'ExternalWidget');

    expect(button).toMatchObject({ directBaseClass: 'HuiBase', inferredQtBaseClass: 'QWidget', status: 'needs_mapping' });
    expect(external).toMatchObject({ directBaseClass: 'VendorWidget', hasQObject: true, status: 'needs_mapping' });
    expect(external?.inferredQtBaseClass).toBeUndefined();
  });

  it('recognizes ordinary controls through the wider Qt Widgets hierarchy without requiring Q_OBJECT', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'qt-binary-control-hierarchy-'));
    await writeFile(path.join(root, 'IconButton.hxx'), 'class IconButton : public QPushButton {};');
    await writeFile(path.join(root, 'IconButton.cpp'), '#include "IconButton.hxx"');
    await writeFile(path.join(root, 'TextEditor.hh'), 'class TextEditor : public QPlainTextEdit {};');
    await writeFile(path.join(root, 'RangeControl.hpp'), 'class RangeControl : public QAbstractSlider {};');

    const items = await new QtBinarySourceAdapter().discover({ sourceId: 'controls', rootDir: root, discovery: 'scan' });

    expect(items.map((item) => item.className)).toEqual(['IconButton', 'RangeControl', 'TextEditor']);
    expect(items.find((item) => item.className === 'IconButton')?.sourcePaths).toEqual(['IconButton.cpp']);
    expect(items.every((item) => item.inferredQtBaseClass === 'QWidget')).toBe(true);
  });

  it('preserves namespace-qualified control class names for generated factories', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'qt-binary-namespace-'));
    await writeFile(path.join(root, 'CardWidget.h'), 'namespace ExampleControls {\nclass CCardWidget : public QFrame { Q_OBJECT };\n}');
    await writeFile(path.join(root, 'CardWidget.cpp'), '#include "CardWidget.h"');
    const items = await new QtBinarySourceAdapter().discover({ sourceId: 'controls', rootDir: root, discovery: 'scan' });
    expect(items[0]).toMatchObject({ className: 'ExampleControls::CCardWidget', sourcePaths: ['CardWidget.cpp'] });
  });

  it('does not expose controls excluded by the current platform preprocessor guard', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'qt-binary-platform-'));
    await writeFile(path.join(root, 'PlatformControls.h'), '#ifdef __linux__\nclass LinuxOnly : public QWidget { Q_OBJECT };\n#endif\n#ifdef _WIN32\nclass WindowsOnly : public QWidget { Q_OBJECT };\n#endif');
    const items = await new QtBinarySourceAdapter().discover({ sourceId: 'controls', rootDir: root, discovery: 'scan' });
    expect(items.map((item) => item.className)).toEqual(process.platform === 'win32' ? ['WindowsOnly'] : process.platform === 'linux' ? ['LinuxOnly'] : []);
  });

  it('uses header-qualified IDs and merges only identical declarations', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'qt-binary-duplicate-'));
    await mkdir(path.join(root, 'one'));
    await mkdir(path.join(root, 'two'));
    await writeFile(path.join(root, 'one', 'Widget.hpp'), 'class Widget : public QWidget { Q_OBJECT };');
    await writeFile(path.join(root, 'two', 'Widget.hpp'), 'class Widget : public QWidget { Q_OBJECT };');
    await writeFile(path.join(root, 'Repeated.hpp'), 'class Repeated : public QWidget { Q_OBJECT };\nclass Repeated : public QWidget { Q_OBJECT };');

    const items = await new QtBinarySourceAdapter().discover({ sourceId: 'binary', rootDir: root, discovery: 'scan' });

    expect(items.filter((item) => item.className === 'Widget')).toHaveLength(2);
    expect(new Set(items.map((item) => item.componentId)).size).toBe(items.length);
    expect(items.filter((item) => item.className === 'Repeated')).toHaveLength(1);
  });

  it('indexes more than the legacy 256-control ceiling', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'qt-binary-many-controls-'));
    await Promise.all(Array.from({ length: 300 }, async (_, index) => {
      const className = `Button${index + 1}`;
      await writeFile(path.join(root, `${className}.hpp`), `class ${className} : public QWidget { Q_OBJECT };`);
    }));

    const items = await new QtBinarySourceAdapter().discover({ sourceId: 'binary', rootDir: root, discovery: 'scan', limit: 2_048 });

    expect(items).toHaveLength(300);
    expect(items[299]).toMatchObject({ className: 'Button99' });
  });
});

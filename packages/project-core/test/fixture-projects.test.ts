import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../../fixtures');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

describe('real-application fixture projects', () => {
  it('keeps Qt 5.9.6 CMake and qmake entrypoints aligned with the probe, RCC, and QSS', () => {
    expect(read('qt59-app/CMakeLists.txt')).toContain('find_package(Qt5 5.9 REQUIRED');
    expect(read('qt59-app/CMakeLists.txt')).toContain('qt-ui-probe');
    expect(read('qt59-app/app.pro')).toContain('qt-ui-probe.pri');
    expect(read('qt59-app/resources/common.qrc')).toContain('network.svg');
    expect(read('qt59-app/resources/common.qrc')).toContain('dark.qss');
    expect(read('qt59-app/src/main.cpp')).toContain(':/styles/dark.qss');
  });

  it('uses two semantic navigation targets before opening the network settings form on both Qt kits', () => {
    const window = read('qt59-app/src/MainWindow.cpp');
    expect(window).toContain('settingsButton');
    expect(window).toContain('networkButton');
    expect(window).toContain('Ui::NetworkSettings');
    expect(read('qt59-app/ui/NetworkSettings.ui')).toContain('networkSettingsDialog');
    expect(read('qt6-app/CMakeLists.txt')).toContain('find_package(Qt6 REQUIRED');
    expect(read('qt6-app/CMakeLists.txt')).toContain('QT_MAJOR_VERSION 6');
  });
});

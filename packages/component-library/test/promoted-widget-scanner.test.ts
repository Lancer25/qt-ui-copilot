import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanPromotedWidgets } from '../src/index.js';

describe('scanPromotedWidgets', () => {
  it('scans declared widgets only when their project header exists', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'qt-promoted-'));
    mkdirSync(path.join(root, 'widgets'));
    const ui = path.join(root, 'MainWindow.ui');
    const header = path.join(root, 'widgets', 'NetworkPanel.h');
    writeFileSync(header, '#pragma once\n');
    writeFileSync(ui, `<?xml version="1.0"?><ui version="4.0"><class>MainWindow</class><widget class="QWidget" name="MainWindow"/><customwidgets><customwidget><class>NetworkPanel</class><extends>QWidget</extends><header>widgets/NetworkPanel.h</header><container>1</container></customwidget></customwidgets></ui>`);
    const result = scanPromotedWidgets([{ absolutePath: ui }, { absolutePath: header }], { projectRoot: root, qtVersion: '6.10.2', verifiedKitIds: ['qt6'] });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'project.promoted.NetworkPanel', kind: 'promoted_widget', source: { type: 'project', path: 'MainWindow.ui' }, qt: { minVersion: '6.10.2', verifiedKitIds: ['qt6'] }, designer: { className: 'NetworkPanel', baseClass: 'QWidget', header: 'widgets/NetworkPanel.h', container: true } });
  });

  it('deduplicates declarations across UI files and excludes missing headers', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'qt-promoted-'));
    const first = path.join(root, 'a.ui');
    const second = path.join(root, 'b.ui');
    const body = (name: string) => `<ui version="4.0"><class>${name}</class><widget class="QWidget" name="${name}"/><customwidgets><customwidget><class>MissingPanel</class><extends>QWidget</extends><header>missing/Panel.h</header></customwidget></customwidgets></ui>`;
    writeFileSync(first, body('A')); writeFileSync(second, body('B'));
    expect(scanPromotedWidgets([first, second], { projectRoot: root })).toEqual([]);
  });
});


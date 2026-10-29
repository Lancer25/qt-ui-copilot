import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadProjectConfig } from '@qt-ui-copilot/project-core';
import type { ComponentPreviewInput } from '@qt-ui-copilot/contracts';
import type { PreviewSessionService, V3PreviewResult } from '../preview/preview-session-service';
import type { WorkspaceService } from '../workspace/workspace-service';
import type { ComponentSourceService, SourceComponentPreviewBuild } from './component-source-service';

export interface ComponentPreviewServiceOptions {
  sources: Pick<ComponentSourceService, 'getItem'> & Partial<Pick<ComponentSourceService, 'getPreviewBuild'>>;
  workspace: Pick<WorkspaceService, 'getRoot'>;
  preview: Pick<PreviewSessionService, 'render'>;
  cacheRoot?: string;
  loadConfig?: typeof loadProjectConfig;
  defaultQtKit?: () => DefaultQtKit | undefined;
  sourceDirectory?: string;
}

export interface DefaultQtKit {
  version: string;
  rootDir: string;
  binDirectory: string;
  uic: string;
  rcc: string;
  cmakePrefixPath?: string;
  compilerAbi?: string;
  architecture?: string;
}

function target(root: string, relativePath: string): string {
  const absolute = path.resolve(root, relativePath);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Component asset escapes preview cache: ${relativePath}`);
  return absolute;
}

function decodeDataUrl(dataUrl: string): Buffer {
  const match = /^data:[^;,]+;base64,(.+)$/s.exec(dataUrl);
  if (!match) throw new Error('Component binary asset is not a base64 data URL');
  return Buffer.from(match[1], 'base64');
}

function escapeCppString(value: string): string { return value.replaceAll('\\', '/').replaceAll('"', '\\"'); }

function customWidgetUi(build: SourceComponentPreviewBuild): string {
  const objectName = `preview${build.className}`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ui version="4.0">\n <class>ComponentPreview</class>\n <widget class="QWidget" name="componentPreviewRoot">\n  <property name="minimumSize"><size><width>640</width><height>360</height></size></property>\n  <layout class="QVBoxLayout" name="previewLayout">\n   <property name="leftMargin"><number>32</number></property><property name="topMargin"><number>32</number></property><property name="rightMargin"><number>32</number></property><property name="bottomMargin"><number>32</number></property>\n   <item><widget class="${build.className}" name="${objectName}"><property name="minimumSize"><size><width>320</width><height>48</height></size></property></widget></item>\n  </layout>\n </widget>\n <customwidgets>\n  <customwidget><class>${build.className}</class><extends>${build.baseClass}</extends><header>${build.headerInclude}</header><container>0</container></customwidget>\n </customwidgets>\n <resources/>\n <connections/>\n</ui>`;
}

function customWidgetFactory(build: SourceComponentPreviewBuild): string {
  return `#include "CustomWidgetFactory.h"\n#include "${escapeCppString(build.headerInclude)}"\n\nQWidget *createGeneratedCustomWidget(const QString &className, QWidget *parent)\n{\n    if (className == QStringLiteral("${escapeCppString(build.className)}")) {\n        QWidget *widget = new ${build.className}(parent);\n        widget->setProperty("text", QStringLiteral("Component preview"));\n        widget->setProperty("placeholderText", QStringLiteral("Enter text"));\n        return widget;\n    }\n    return nullptr;\n}\n`;
}

export class ComponentPreviewService {
  constructor(private readonly options: ComponentPreviewServiceOptions) {}

  async render(input: ComponentPreviewInput): Promise<V3PreviewResult> {
    const item = this.options.sources.getItem(input.sourceId, input.componentId);
    if (!item) throw new Error('组件尚未同步，无法预览');
    const build = this.options.sources.getPreviewBuild?.(input.sourceId, input.componentId);
    let config;
    try {
      config = input.workspaceId
        ? (this.options.loadConfig ?? loadProjectConfig)(this.options.workspace.getRoot(input.workspaceId))
        : undefined;
    } catch {
      // A partial or stale project profile must not hide the explicitly
      // selected application/default Kit from component preview.
      config = undefined;
    }
    const fallbackKit = this.options.defaultQtKit?.();
    const projectQtUsable = Boolean(config?.qt && existsSync(config.qt.uic) && existsSync(config.qt.rcc));
    if (!projectQtUsable && !fallbackKit) throw new Error('请先在设置中绑定 Qt Kit，再预览组件');
    const cacheRoot = this.options.cacheRoot ?? path.join(tmpdir(), 'qt-ui-copilot-component-preview');
    const stage = path.join(cacheRoot, input.sourceId, item.contentHash.slice(0, 20));
    await mkdir(stage, { recursive: true });
    const uiFile = path.join(stage, 'component.ui');
    await writeFile(uiFile, build ? customWidgetUi(build) : item.uiSource, 'utf8');
    const qssFiles: string[] = []; const qrcFiles: string[] = []; const fonts: string[] = [];
    for (const asset of item.assets) {
      const filePath = target(stage, asset.path);
      await mkdir(path.dirname(filePath), { recursive: true });
      if (asset.text !== undefined) await writeFile(filePath, asset.text, 'utf8');
      else if (asset.dataUrl) await writeFile(filePath, decodeDataUrl(asset.dataUrl));
      if (asset.kind === 'qss') qssFiles.push(filePath);
      else if (asset.kind === 'qrc') qrcFiles.push(filePath);
      else if (asset.kind === 'font') fonts.push(filePath);
    }
    if (build?.qssPath) qssFiles.push(build.qssPath);
    if (build?.qrcPath) qrcFiles.push(build.qrcPath);
    let componentBuild: { factory: string; sources: string[]; headers: string[]; includeDirs: string[] } | undefined;
    if (build) {
      const factory = path.join(stage, 'component-preview-factory.cpp');
      const stagedHeaders = path.join(stage, 'component-headers');
      await writeFile(factory, customWidgetFactory(build), 'utf8');
      const headers: string[] = [];
      for (const dependency of build.dependencyHeaders) { const stagedHeader = target(stagedHeaders, dependency.relative); await mkdir(path.dirname(stagedHeader), { recursive: true }); await writeFile(stagedHeader, await readFile(dependency.absolute)); headers.push(stagedHeader); }
      componentBuild = { factory, sources: build.sources, headers, includeDirs: [stagedHeaders, ...build.includeDirs] };
    }
    const qt = projectQtUsable ? config!.qt : {
      version: fallbackKit!.version,
      compilerAbi: fallbackKit!.compilerAbi ?? fallbackKit!.architecture ?? 'unknown',
      architecture: fallbackKit!.architecture ?? process.arch,
      binDirectory: fallbackKit!.binDirectory,
      uic: fallbackKit!.uic,
      rcc: fallbackKit!.rcc,
      cmake: 'cmake',
      cmakePrefixPath: fallbackKit!.cmakePrefixPath ?? fallbackKit!.rootDir,
    };
    const profile = config?.preview ?? { width: 900, height: 640, locale: 'zh_CN', style: 'Fusion', pluginPaths: [] };
    return this.options.preview.render({
      uiFile,
      profile: { qtKitId: qt.version, mode: 'enhanced', width: profile.width, height: profile.height, locale: profile.locale, style: profile.style, qrcFiles, stylesheets: qssFiles, fonts, pluginPaths: profile.pluginPaths, highDpiMode: 'project-default' },
      qt: { version: qt.version, compilerAbi: qt.compilerAbi, architecture: qt.architecture, binDirectory: qt.binDirectory, uic: qt.uic, rcc: qt.rcc, cmake: qt.cmake, cmakePrefixPath: qt.cmakePrefixPath, ...(qt.cmakeGenerator ? { cmakeGenerator: qt.cmakeGenerator } : {}) },
      sourceDirectory: 'sourceDirectory' in profile ? profile.sourceDirectory : (this.options.sourceDirectory ?? process.cwd()),
      cacheDirectory: path.join(stage, 'preview-host'),
      outputImage: path.join(stage, 'preview.png'),
      ...(componentBuild ? { componentBuild } : {}),
    });
  }
}

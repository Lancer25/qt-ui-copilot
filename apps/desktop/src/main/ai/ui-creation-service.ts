import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { UiCreationRequestSchema, type UiCreationBlueprint, type UiCreationCandidate, type UiCreationRequest } from '@qt-ui-copilot/contracts';
import { generateUiFromBlueprint } from '@qt-ui-copilot/ui-document';
import { createQtProjectScaffold, stripUiInlineStyles } from './qt-project-scaffolder';
import { loadProjectConfig, profileFromConfig, validateUiWithUic, type ProjectQtToolchain } from '@qt-ui-copilot/project-core';
import type { ProjectProfile } from '@qt-ui-copilot/contracts';
import type { WorkspaceService } from '../workspace/workspace-service';
import type { PreviewSessionService, V3PreviewInput } from '../preview/preview-session-service';
import type { AttachmentService, ValidatedAttachment } from './attachment-service';
import type { UiCreationPlanner } from './ui-creation-planner';
import type { UiCreationTaskService } from './ui-creation-task-service';
import type { UiCreationProgress, UiCreationTaskResult } from './ui-creation-task-service';
import type { BinaryComponentBuildMetadata } from '@qt-ui-copilot/contracts';

export interface UiCreationServiceDeps {
  workspace: WorkspaceService;
  planner: UiCreationPlanner;
  attachments: AttachmentService;
  preview?: PreviewSessionService;
  /** Optional semantic two-stage generator. The legacy blueprint planner remains the fallback. */
  taskService?: UiCreationTaskService;
  /** Injectable for deterministic service tests. */
  validateUic?: (rootDir: string, uiFile: string) => Promise<{ valid: boolean; stdout?: string; stderr?: string }>;
  /** Supplies the machine-local Qt tool paths that a portable project profile omits. */
  localQt?: (rootDir: string) => ProjectQtToolchain | undefined;
}

type StoredCandidate = UiCreationCandidate & { candidatePath: string; candidateRoot: string; source: string; projectRoot?: string; baseSource?: string };

/** Stages generated UI files and commits only after all validation gates pass. */
export class UiCreationService {
  private readonly candidates = new Map<string, StoredCandidate>();
  private readonly taskCandidates = new Map<string, string>();
  constructor(private readonly deps: UiCreationServiceDeps) {}

  async createCandidate(raw: UiCreationRequest, onProgress?: (progress: UiCreationProgress) => void, signal?: AbortSignal, taskId?: string): Promise<UiCreationCandidate> {
    if (signal?.aborted) throw new Error('UI creation cancelled');
    const request = UiCreationRequestSchema.parse(raw);
    if (taskId) {
      const previousId = this.taskCandidates.get(taskId);
      const previous = previousId ? this.candidates.get(previousId) : undefined;
      if (previous) {
        onProgress?.({ stage: previous.validation.preview ? 'preview_ready' : 'validating_preview', message: previous.validation.preview ? '已恢复上次生成的预览' : '继续生成预览', warnings: [] });
        if (!previous.validation.preview) void this.finishPreview(previous.id, resolve(this.deps.workspace.getRoot(request.workspaceId)), previous.candidatePath, onProgress);
        return this.publicCandidate(previous);
      }
    }
    const rootDir = resolve(this.deps.workspace.getRoot(request.workspaceId));
    const targetPath = this.resolveTarget(rootDir, request.directory, request.fileName);
    if (!request.createProject && await exists(targetPath)) throw new Error(`target already exists: ${targetPath}`);
    const attachments = this.deps.attachments.validate(request.attachments);
    let blueprint: UiCreationBlueprint;
    let source: string;
    let componentStylesheets: string[] = [];
    let binaryComponents: BinaryComponentBuildMetadata[] = [];
    if (this.deps.taskService) {
      try {
        const result = await this.deps.taskService.runBase({
          requirement: request.requirement,
          targetQtVersion: request.qtKitId,
          fileName: request.fileName,
          rootType: request.rootType,
          referenceImages: attachments.filter((item) => item.kind === 'image' && item.dataUrl).map((item) => ({ name: item.name, mimeType: item.mimeType, dataUrl: item.dataUrl! })),
          capabilityCandidates: request.capabilityCandidates,
        }, onProgress);
        if (signal?.aborted) throw new Error('UI creation cancelled');
        if (result.intent.fileName.toLowerCase() !== request.fileName.toLowerCase()) throw new Error('planner returned a different file name');
        if (result.intent.rootType !== request.rootType) throw new Error('planner returned a different root type');
        blueprint = { ...intentToBlueprint(result.intent), componentIds: result.componentIds };
        source = result.baseSource;
        componentStylesheets = result.componentStylesheets;
        binaryComponents = result.binaryComponents;
      } catch (error) {
        // Do not turn an outage or authentication failure into another model
        // request. For local semantic/format failures, retain the old path.
        if (isTransientModelError(error)) throw error;
        blueprint = await this.planLegacy(request, attachments);
        source = generateUiFromBlueprint(blueprint).source;
      }
    } else {
      blueprint = await this.planLegacy(request, attachments);
      source = generateUiFromBlueprint(blueprint).source;
    }
    const id = `ui-creation-${randomUUID()}`;
    const candidateDir = join(rootDir, '.qt-ui-copilot', 'candidates', id);
    const uiRelativePath = relative(rootDir, targetPath).replaceAll('\\', '/');
    const candidatePath = join(candidateDir, uiRelativePath);
    await mkdir(candidateDir, { recursive: true });
    try {
      const scaffoldProject = Boolean(request.createProject) && !await hasExistingQtProject(rootDir);
      const scaffold = scaffoldProject ? createQtProjectScaffold({ appName: rootDir.split(/[\\/]/).pop() || 'QtApp', uiRelativePath, uiSource: source, rootType: request.rootType, backend: request.buildBackend === 'msbuild' ? 'msbuild' : 'qmake', additionalQss: componentStylesheets, binaryComponents }) : { [uiRelativePath]: source };
      const projectFiles = scaffoldProject ? await Promise.all(Object.entries(scaffold).map(async ([relativePath, content]) => ({ relativePath, content, existing: await exists(join(rootDir, relativePath)), conflict: await exists(join(rootDir, relativePath)) }))) : undefined;
      for (const [relativePath, content] of Object.entries(scaffold)) {
        const stagedFile = join(candidateDir, relativePath);
        await mkdir(dirname(stagedFile), { recursive: true });
        await writeFile(stagedFile, content, { encoding: 'utf8', flag: 'wx' });
      }
      if (signal?.aborted) throw new Error('UI creation cancelled');
      const validation = await this.validateBase(rootDir, candidatePath);
      if (!validation.uic) throw new Error(`无法验证新界面：${validation.findings.find((finding) => finding.code === 'uic_failed')?.message ?? '请先在项目设置中选择 Qt Kit（需要 uic）'}`);
      const candidate: StoredCandidate = {
        id, workspaceId: request.workspaceId, targetPath, blueprint, source,
        sourceHash: createHash('sha256').update(source).digest('hex'),
        
        validation: { xml: true, semantic: true, uic: validation.uic, preview: validation.preview, findings: validation.findings },
        createdAt: Date.now(), candidatePath, candidateRoot: candidateDir, ...(scaffoldProject ? { projectRoot: rootDir } : {}),
        ...(projectFiles ? { files: projectFiles, buildBackend: request.buildBackend ?? 'auto', buildDirectory: '.qt-ui-copilot/build', executable: `.qt-ui-copilot/build/${rootDir.split(/[\\/]/).pop() || 'QtApp'}.exe` } : {}),
      };
      this.candidates.set(id, candidate);
      if (taskId) this.taskCandidates.set(taskId, id);
      if (!request.createProject) void this.finishPreview(id, rootDir, candidatePath, onProgress);
      return this.publicCandidate(candidate);
    } catch (error) {
      await rm(candidateDir, { recursive: true, force: true });
      throw error;
    }
  }

  async finishCandidatePreview(candidateId: string, onProgress?: (progress: UiCreationProgress) => void): Promise<void> {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) throw new Error('unknown UI creation candidate');
    await this.finishPreview(candidateId, resolve(this.deps.workspace.getRoot(candidate.workspaceId)), candidate.candidatePath, onProgress);
  }

  async replaceCandidateSource(candidateId: string, source: string): Promise<UiCreationCandidate> {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) throw new Error('unknown UI creation candidate');
    const separatedSource = candidate.files?.some((file) => file.relativePath.toLowerCase().endsWith('.qss')) ? stripUiInlineStyles(source) : source;
    await mkdir(dirname(candidate.candidatePath), { recursive: true });
    await writeFile(candidate.candidatePath, separatedSource, 'utf8');
    const check = await this.validateBase(resolve(this.deps.workspace.getRoot(candidate.workspaceId)), candidate.candidatePath);
    if (!check.uic) { await writeFile(candidate.candidatePath, candidate.source, 'utf8'); throw new Error('调整未通过 uic 校验'); }
    const updated: StoredCandidate = { ...candidate, saved: false, source: separatedSource, sourceHash: createHash('sha256').update(separatedSource).digest('hex'), validation: { ...candidate.validation, preview: false, findings: [...candidate.validation.findings.filter((finding) => finding.code !== 'preview_pending'), { severity: 'info', code: 'preview_pending', message: '调整已应用，预览正在重新生成。' }] }, ...(candidate.files ? { files: candidate.files.map((file) => file.relativePath.toLowerCase().endsWith(candidate.blueprint.fileName.toLowerCase()) ? { ...file, content: separatedSource } : file) } : {}) };
    this.candidates.set(candidateId, updated);
    return this.publicCandidate(updated);
  }

  getCandidate(candidateId: string): UiCreationCandidate | undefined { const candidate = this.candidates.get(candidateId); return candidate ? this.publicCandidate(candidate) : undefined; }

  private async planLegacy(request: UiCreationRequest, attachments: ValidatedAttachment[]): Promise<UiCreationBlueprint> {
    const blueprint = await this.deps.planner.plan({
      requirement: request.requirement, contextMode: request.contextMode, attachments, targetQtVersion: request.qtKitId,
      fileName: request.fileName, rootType: request.rootType,
      useProjectResources: request.useProjectResources, useComponentLibrary: request.useComponentLibrary,
    });
    if (blueprint.fileName.toLowerCase() !== request.fileName.toLowerCase()) throw new Error('planner returned a different file name');
    if (blueprint.rootType !== request.rootType) throw new Error('planner returned a different root type');
    return blueprint;
  }

  async commit(candidateId: string): Promise<{ uiFile: string }> {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) throw new Error('unknown UI creation candidate');
    if (candidate.saved) return { uiFile: candidate.targetPath };
    if (candidate.baseSource !== undefined) {
      if (await readFile(candidate.targetPath, 'utf8') !== candidate.baseSource) throw new Error('文件已被外部修改，请重新打开后调整');
      await writeFile(candidate.targetPath, candidate.source, 'utf8');
      this.candidates.set(candidateId, { ...candidate, saved: true, baseSource: candidate.source });
      return { uiFile: candidate.targetPath };
    }
    if (await exists(candidate.targetPath)) throw new Error(`target already exists: ${candidate.targetPath}`);
    if (candidate.files?.some((file) => file.conflict)) throw new Error('project file conflicts require explicit approval');
    await mkdir(dirname(candidate.targetPath), { recursive: true });
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      if (candidate.files?.length) {
        for (const file of candidate.files) {
          const target = join(candidate.projectRoot ?? dirname(candidate.targetPath), file.relativePath);
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, file.content, { encoding: 'utf8', flag: 'wx' });
        }
        await registerGeneratedResources(candidate.projectRoot ?? dirname(candidate.targetPath), candidate.files);
      } else {
        handle = await open(candidate.targetPath, 'wx');
        await handle!.writeFile(candidate.source, 'utf8');
      }
      await handle?.close(); handle = undefined;
      await rm(dirname(candidate.candidatePath), { recursive: true, force: true });
      this.candidates.set(candidateId, { ...candidate, saved: true, baseSource: candidate.source, files: undefined });
      for (const [taskId, id] of this.taskCandidates) if (id === candidateId) this.taskCandidates.delete(taskId);
      return { uiFile: candidate.targetPath };
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await rm(candidate.targetPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  reject(candidateId: string): void {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) return;
    this.candidates.delete(candidateId);
    for (const [taskId, id] of this.taskCandidates) if (id === candidateId) this.taskCandidates.delete(taskId);
    void rm(dirname(candidate.candidatePath), { recursive: true, force: true });
  }

  cancel(candidateId: string): void { this.reject(candidateId); }

  private resolveTarget(rootDir: string, directory: string, fileName: string): string {
    const target = resolve(rootDir, directory, fileName);
    const rel = relative(rootDir, target);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('target directory escapes workspace');
    return target;
  }

  private async validate(rootDir: string, uiFile: string, files?: UiCreationCandidate['files'], candidateRoot?: string): Promise<{ uic: boolean; preview: boolean; previewDataUrl?: string; findings: Array<{ severity: 'info' | 'warning' | 'error'; code: string; message: string }> }> {
    const findings: Array<{ severity: 'info' | 'warning' | 'error'; code: string; message: string }> = [];
    let config: ReturnType<typeof loadProjectConfig>;
    try { config = loadProjectConfig(rootDir, this.deps.localQt?.(rootDir)); } catch { config = undefined; }
    // New projects commonly have only the Qt kit persisted. Keep uic
    // validation available in that state; the enhanced PreviewHost path is
    // intentionally optional until the user configures it.
    const qtOnlyProfile = config?.qt ? undefined : await loadQtOnlyProfile(rootDir);
    const uic = this.deps.validateUic
      ? await this.deps.validateUic(rootDir, uiFile)
        : config
        ? await validateUiWithUic(profileFromConfig(rootDir, config), uiFile)
        : qtOnlyProfile
        ? await validateUiWithUic(qtOnlyProfile, uiFile)
        : { valid: false, stderr: '请先在项目设置中选择 Qt Kit（需要 uic）' };
    if (!uic.valid) { findings.push({ severity: 'error', code: 'uic_failed', message: (uic.stderr || uic.stdout || 'uic validation failed').slice(0, 1000) }); return { uic: false, preview: false, findings }; }
    if (!this.deps.preview) return { uic: true, preview: false, findings: [{ severity: 'info', code: 'preview_not_configured', message: 'PreviewHost 未配置，已完成 UI XML 与 uic 校验。' }] };
    const qtOnly = qtOnlyProfile?.qt;
    if (!config && !qtOnly) return { uic: true, preview: false, findings: [{ severity: 'info', code: 'preview_not_configured', message: '未找到 Qt Kit，已完成 UI XML 校验。' }] };
    const qt = config?.qt ?? { version: qtOnly!.version, compilerAbi: 'unknown', architecture: process.arch, binDirectory: qtOnly!.binDirectory ?? dirname(qtOnly!.uic), uic: qtOnly!.uic, rcc: qtOnly!.rcc, cmake: 'cmake', cmakePrefixPath: dirname(dirname(qtOnly!.uic)) };
    const p = config?.preview ?? { sourceDirectory: rootDir, cacheDirectory: join(rootDir, '.qt-ui-copilot', 'preview-cache'), width: 900, height: 640, locale: 'zh_CN', style: 'Fusion', qrcFiles: [], stylesheets: [], fonts: [], pluginPaths: [] };
    const staged = (extension: string) => candidateRoot ? (files ?? []).filter((file) => file.relativePath.toLowerCase().endsWith(extension)).map((file) => join(candidateRoot, file.relativePath)) : [];
    const qrcFiles = [...new Set([...p.qrcFiles, ...staged('.qrc')])];
    const stylesheets = [...new Set([...p.stylesheets, ...staged('.qss')])];
    try {
      const result = await this.deps.preview.render({ uiFile, profile: { qtKitId: qt.version, mode: 'enhanced', width: p.width, height: p.height, locale: p.locale, style: p.style, qrcFiles, stylesheets, fonts: p.fonts, pluginPaths: p.pluginPaths, highDpiMode: 'project-default' }, qt: { version: qt.version, compilerAbi: qt.compilerAbi, architecture: qt.architecture, binDirectory: qt.binDirectory, uic: qt.uic, rcc: qt.rcc, cmake: qt.cmake, cmakePrefixPath: qt.cmakePrefixPath, ...(qt.cmakeGenerator ? { cmakeGenerator: qt.cmakeGenerator } : {}) }, sourceDirectory: p.sourceDirectory, cacheDirectory: p.cacheDirectory, outputImage: join(dirname(uiFile), 'candidate.png') } as V3PreviewInput);
      return { uic: true, preview: true, previewDataUrl: result.imageDataUrl, findings };
    } catch (error) {
      findings.push({ severity: 'warning', code: 'preview_unavailable', message: error instanceof Error ? error.message : 'PreviewHost 暂不可用，已保留 UI 草稿。' });
      return { uic: true, preview: false, findings };
    }
  }

  private async validateBase(rootDir: string, uiFile: string): Promise<{ uic: boolean; preview: boolean; findings: Array<{ severity: 'info' | 'warning' | 'error'; code: string; message: string }> }> {
    let config: ReturnType<typeof loadProjectConfig>;
    try { config = loadProjectConfig(rootDir, this.deps.localQt?.(rootDir)); } catch { config = undefined; }
    const qtOnlyProfile = config?.qt ? undefined : await loadQtOnlyProfile(rootDir);
    const uic = this.deps.validateUic
      ? await this.deps.validateUic(rootDir, uiFile)
      : config ? await validateUiWithUic(profileFromConfig(rootDir, config), uiFile)
        : qtOnlyProfile ? await validateUiWithUic(qtOnlyProfile, uiFile)
          : { valid: false, stderr: '请先在项目设置中选择 Qt Kit（需要 uic）' };
    if (!uic.valid) return { uic: false, preview: false, findings: [{ severity: 'error', code: 'uic_failed', message: (uic.stderr || uic.stdout || 'uic validation failed').slice(0, 1000) }] };
    return { uic: true, preview: false, findings: [{ severity: 'info', code: 'preview_pending', message: '基础 UI 已通过 uic，预览正在后台生成。' }] };
  }

  private async finishPreview(id: string, rootDir: string, candidatePath: string, onProgress?: (progress: UiCreationProgress) => void): Promise<void> {
    onProgress?.({ stage: 'validating_preview', message: '后台正在生成预览', warnings: [] });
    try {
      const candidate = this.candidates.get(id);
      if (!candidate) return;
      const preview = await this.validate(rootDir, candidatePath, candidate.files, candidate.candidateRoot);
      this.candidates.set(id, { ...candidate, ...(preview.previewDataUrl ? { previewDataUrl: preview.previewDataUrl } : {}), validation: { ...candidate.validation, preview: preview.preview, findings: [...candidate.validation.findings.filter((finding) => finding.code !== 'preview_pending'), ...preview.findings] } });
      onProgress?.(preview.previewDataUrl ? { stage: 'preview_ready', message: '预览已生成', warnings: [], previewDataUrl: preview.previewDataUrl, previewStatus: 'ready' } : { stage: 'preview_ready', message: '预览已完成但没有截图', warnings: preview.findings.map((finding) => ({ code: finding.code, message: finding.message })), previewStatus: 'warning' });
    } catch (error) {
      const candidate = this.candidates.get(id);
      if (!candidate) return;
      this.candidates.set(id, { ...candidate, validation: { ...candidate.validation, preview: false, findings: [...candidate.validation.findings.filter((finding) => finding.code !== 'preview_pending'), { severity: 'warning', code: 'preview_unavailable', message: error instanceof Error ? error.message : 'PreviewHost 暂不可用' }] } });
      onProgress?.({ stage: 'preview_ready', message: '预览生成失败，但基础候选仍可保存', warnings: [{ code: 'preview_unavailable', message: error instanceof Error ? error.message : 'PreviewHost 暂不可用' }], previewStatus: 'failed' });
    }
  }

  private publicCandidate(candidate: StoredCandidate): UiCreationCandidate { const { candidatePath, candidateRoot: _candidateRoot, projectRoot: _projectRoot, baseSource: _baseSource, ...publicValue } = candidate; return { ...publicValue, stagedPath: candidatePath }; }
}

function isTransientModelError(error: unknown): boolean {
  return error instanceof Error && /HTTP\s+(?:401|403|404|408|429|5\d\d)/i.test(error.message);
}

function intentToBlueprint(intent: import('@qt-ui-copilot/contracts').CanonicalUiIntent): UiCreationBlueprint {
  const widgetClass: Record<string, string> = { container: 'QWidget', label: 'QLabel', button: 'QPushButton', lineEdit: 'QLineEdit', textEdit: 'QTextEdit', checkBox: 'QCheckBox', comboBox: 'QComboBox', list: 'QListWidget', table: 'QTableWidget' };
  const layoutClass: Record<string, string> = { vertical: 'QVBoxLayout', horizontal: 'QHBoxLayout', grid: 'QGridLayout', form: 'QFormLayout' };
  const convert = (node: import('@qt-ui-copilot/contracts').CanonicalUiNode): import('@qt-ui-copilot/contracts').UiBlueprintNode => {
    const properties: Record<string, import('@qt-ui-copilot/contracts').UiValue> = {};
    if (node.text !== undefined) properties.text = node.text;
    if (node.placeholder !== undefined) properties.placeholderText = node.placeholder;
    if (node.kind === 'layout') return { kind: 'layout', className: layoutClass[node.layout ?? 'vertical'], objectName: node.objectName ?? node.role, properties: {}, children: node.children.map(convert) };
    if (node.kind === 'spacer') return { kind: 'spacer', className: 'QSpacerItem', objectName: node.objectName ?? node.role, properties: {}, children: [] };
    return { kind: 'widget', className: widgetClass[node.widget ?? 'container'], objectName: node.objectName ?? node.role, properties, children: [] };
  };
  return { fileName: intent.fileName, rootType: intent.rootType, rootObjectName: intent.rootObjectName, windowTitle: intent.windowTitle, size: intent.size ?? { width: 900, height: 640 }, layoutTree: convert(intent.tree), tabOrder: [], connections: [], resourceRefs: [], componentIds: [], expectedResults: intent.expectedResults };
}

async function loadQtOnlyProfile(rootDir: string): Promise<ProjectProfile | undefined> {
  try {
    const raw = JSON.parse(await readFile(join(rootDir, '.qt-ui-copilot', 'project.json'), 'utf8')) as Record<string, unknown>;
    const qt = raw.qt as Record<string, unknown> | undefined;
    if (!qt || typeof qt.version !== 'string' || typeof qt.uic !== 'string' || typeof qt.rcc !== 'string') return undefined;
    const resolved = (value: string): string => resolve(rootDir, value.replaceAll('${projectRoot}', rootDir));
    return {
      id: typeof raw.id === 'string' ? raw.id : `workspace-${createHash('sha256').update(rootDir).digest('hex').slice(0, 12)}`,
      rootDir,
      qt: { version: qt.version, uic: resolved(qt.uic), rcc: resolved(qt.rcc), ...(typeof qt.binDirectory === 'string' ? { binDirectory: resolved(qt.binDirectory) } : {}) },
      build: { command: { executable: 'cmake', args: [] }, backend: 'auto' },
      run: { executable: process.platform === 'win32' ? 'cmd.exe' : 'sh', args: [], environment: {} },
    };
  } catch { return undefined; }
}

async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }

async function hasExistingQtProject(rootDir: string): Promise<boolean> {
  if (await exists(join(rootDir, 'CMakeLists.txt'))) return true;
  try { return (await readdir(rootDir)).some((name) => /\.(?:pro|sln|vcxproj)$/i.test(name)); } catch { return false; }
}

async function registerGeneratedResources(rootDir: string, files: NonNullable<UiCreationCandidate['files']>): Promise<void> {
  const qss = files.filter((file) => file.relativePath.toLowerCase().endsWith('.qss')).map((file) => `\${projectRoot}/${file.relativePath.replaceAll('\\', '/')}`);
  const qrc = files.filter((file) => file.relativePath.toLowerCase().endsWith('.qrc')).map((file) => `\${projectRoot}/${file.relativePath.replaceAll('\\', '/')}`);
  if (!qss.length && !qrc.length) return;
  const profilePath = join(rootDir, '.qt-ui-copilot', 'project.json');
  let current: Record<string, unknown> = {};
  try { current = JSON.parse(await readFile(profilePath, 'utf8')) as Record<string, unknown>; } catch { /* create a resource-aware profile when missing */ }
  const preview = current.preview && typeof current.preview === 'object' ? current.preview as Record<string, unknown> : {};
  const merge = (old: unknown, additions: string[]) => [...new Set([...(Array.isArray(old) ? old.map(String) : []), ...additions])];
  await mkdir(dirname(profilePath), { recursive: true });
  await writeFile(profilePath, `${JSON.stringify({ ...current, preview: { sourceDirectory: '${projectRoot}', cacheDirectory: '${projectRoot}/.qt-ui-copilot/preview-cache', width: 900, height: 640, locale: 'zh_CN', style: 'Fusion', fonts: [], pluginPaths: [], ...preview, stylesheets: merge(preview.stylesheets, qss), qrcFiles: merge(preview.qrcFiles, qrc) } }, null, 2)}\n`, 'utf8');
}

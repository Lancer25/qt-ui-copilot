import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { UiCreationRequestSchema, type UiCreationBlueprint, type UiCreationCandidate, type UiCreationRequest } from '@qt-ui-copilot/contracts';
import { generateUiFromBlueprint } from '@qt-ui-copilot/ui-document';
import { loadProjectConfig, profileFromConfig, validateUiWithUic } from '@qt-ui-copilot/project-core';
import type { ProjectProfile } from '@qt-ui-copilot/contracts';
import type { WorkspaceService } from '../workspace/workspace-service';
import type { PreviewSessionService, V3PreviewInput } from '../preview/preview-session-service';
import type { AttachmentService, ValidatedAttachment } from './attachment-service';
import type { UiCreationPlanner } from './ui-creation-planner';
import type { UiCreationTaskService } from './ui-creation-task-service';
import type { UiCreationTaskResult } from './ui-creation-task-service';

export interface UiCreationServiceDeps {
  workspace: WorkspaceService;
  planner: UiCreationPlanner;
  attachments: AttachmentService;
  preview?: PreviewSessionService;
  /** Optional semantic two-stage generator. The legacy blueprint planner remains the fallback. */
  taskService?: UiCreationTaskService;
  /** Injectable for deterministic service tests. */
  validateUic?: (rootDir: string, uiFile: string) => Promise<{ valid: boolean; stdout?: string; stderr?: string }>;
}

type StoredCandidate = UiCreationCandidate & { candidatePath: string; source: string };

/** Stages generated UI files and commits only after all validation gates pass. */
export class UiCreationService {
  private readonly candidates = new Map<string, StoredCandidate>();
  constructor(private readonly deps: UiCreationServiceDeps) {}

  async createCandidate(raw: UiCreationRequest): Promise<UiCreationCandidate> {
    const request = UiCreationRequestSchema.parse(raw);
    const rootDir = resolve(this.deps.workspace.getRoot(request.workspaceId));
    const targetPath = this.resolveTarget(rootDir, request.directory, request.fileName);
    if (await exists(targetPath)) throw new Error(`target already exists: ${targetPath}`);
    const attachments = this.deps.attachments.validate(request.attachments);
    let blueprint: UiCreationBlueprint;
    let source: string;
    if (this.deps.taskService) {
      try {
        const result = await this.deps.taskService.run({
          requirement: request.requirement,
          targetQtVersion: request.qtKitId,
          fileName: request.fileName,
          rootType: request.rootType,
          referenceImages: attachments.filter((item) => item.kind === 'image' && item.dataUrl).map((item) => ({ name: item.name, mimeType: item.mimeType, dataUrl: item.dataUrl! })),
        });
        if (result.intent.fileName.toLowerCase() !== request.fileName.toLowerCase()) throw new Error('planner returned a different file name');
        if (result.intent.rootType !== request.rootType) throw new Error('planner returned a different root type');
        blueprint = intentToBlueprint(result.intent);
        source = result.enhancedSource;
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
    const candidatePath = join(candidateDir, request.fileName);
    await mkdir(candidateDir, { recursive: true });
    try {
      await writeFile(candidatePath, source, { encoding: 'utf8', flag: 'wx' });
      const validation = await this.validate(rootDir, candidatePath);
      if (!validation.uic) throw new Error(`无法验证新界面：${validation.findings.find((finding) => finding.code === 'uic_failed')?.message ?? '请先在项目设置中选择 Qt Kit（需要 uic）'}`);
      const candidate: StoredCandidate = {
        id, workspaceId: request.workspaceId, targetPath, blueprint, source,
        sourceHash: createHash('sha256').update(source).digest('hex'),
        ...(validation.previewDataUrl ? { previewDataUrl: validation.previewDataUrl } : {}),
        validation: { xml: true, semantic: true, uic: validation.uic, preview: validation.preview, findings: validation.findings },
        createdAt: Date.now(), candidatePath,
      };
      this.candidates.set(id, candidate);
      return this.publicCandidate(candidate);
    } catch (error) {
      await rm(candidateDir, { recursive: true, force: true });
      throw error;
    }
  }

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
    if (await exists(candidate.targetPath)) throw new Error(`target already exists: ${candidate.targetPath}`);
    await mkdir(dirname(candidate.targetPath), { recursive: true });
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(candidate.targetPath, 'wx');
      await handle.writeFile(candidate.source, 'utf8');
      await handle.close(); handle = undefined;
      await rm(dirname(candidate.candidatePath), { recursive: true, force: true });
      this.candidates.delete(candidateId);
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
    void rm(dirname(candidate.candidatePath), { recursive: true, force: true });
  }

  cancel(candidateId: string): void { this.reject(candidateId); }

  private resolveTarget(rootDir: string, directory: string, fileName: string): string {
    const target = resolve(rootDir, directory, fileName);
    const rel = relative(rootDir, target);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('target directory escapes workspace');
    return target;
  }

  private async validate(rootDir: string, uiFile: string): Promise<{ uic: boolean; preview: boolean; previewDataUrl?: string; findings: Array<{ severity: 'info' | 'warning' | 'error'; code: string; message: string }> }> {
    const findings: Array<{ severity: 'info' | 'warning' | 'error'; code: string; message: string }> = [];
    let config: ReturnType<typeof loadProjectConfig>;
    try { config = loadProjectConfig(rootDir); } catch { config = undefined; }
    // New projects commonly have only the Qt kit persisted. Keep uic
    // validation available in that state; the enhanced PreviewHost path is
    // intentionally optional until the user configures it.
    const qtOnlyProfile = config ? undefined : await loadQtOnlyProfile(rootDir);
    const uic = this.deps.validateUic
      ? await this.deps.validateUic(rootDir, uiFile)
        : config
        ? await validateUiWithUic(profileFromConfig(rootDir, config), uiFile)
        : qtOnlyProfile
        ? await validateUiWithUic(qtOnlyProfile, uiFile)
        : { valid: false, stderr: '请先在项目设置中选择 Qt Kit（需要 uic）' };
    if (!uic.valid) { findings.push({ severity: 'error', code: 'uic_failed', message: (uic.stderr || uic.stdout || 'uic validation failed').slice(0, 1000) }); return { uic: false, preview: false, findings }; }
    if (!this.deps.preview || !config) return { uic: true, preview: false, findings: [{ severity: 'info', code: 'preview_not_configured', message: 'PreviewHost 未配置，已完成 UI XML 与 uic 校验。' }] };
    const qt = config.qt; const p = config.preview;
    try {
      const result = await this.deps.preview.render({ uiFile, profile: { qtKitId: qt.version, mode: 'enhanced', width: p.width, height: p.height, locale: p.locale, style: p.style, qrcFiles: p.qrcFiles, stylesheets: p.stylesheets, fonts: p.fonts, pluginPaths: p.pluginPaths, highDpiMode: 'project-default' }, qt: { version: qt.version, compilerAbi: qt.compilerAbi, architecture: qt.architecture, binDirectory: qt.binDirectory, uic: qt.uic, rcc: qt.rcc, cmake: qt.cmake, cmakePrefixPath: qt.cmakePrefixPath, ...(qt.cmakeGenerator ? { cmakeGenerator: qt.cmakeGenerator } : {}) }, sourceDirectory: p.sourceDirectory, cacheDirectory: p.cacheDirectory, outputImage: join(dirname(uiFile), 'candidate.png') } as V3PreviewInput);
      return { uic: true, preview: true, previewDataUrl: result.imageDataUrl, findings };
    } catch (error) {
      findings.push({ severity: 'warning', code: 'preview_unavailable', message: error instanceof Error ? error.message : 'PreviewHost 暂不可用，已保留 UI 草稿。' });
      return { uic: true, preview: false, findings };
    }
  }

  private publicCandidate(candidate: StoredCandidate): UiCreationCandidate { const { candidatePath: _candidatePath, ...publicValue } = candidate; return publicValue; }
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
      build: { command: { executable: 'cmake', args: [] } },
      run: { executable: process.platform === 'win32' ? 'cmd.exe' : 'sh', args: [], environment: {} },
    };
  } catch { return undefined; }
}

async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }

import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, open, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { UiCreationRequestSchema, type UiCreationBlueprint, type UiCreationCandidate, type UiCreationRequest } from '@qt-ui-copilot/contracts';
import { generateUiFromBlueprint } from '@qt-ui-copilot/ui-document';
import { loadProjectConfig, profileFromConfig, validateUiWithUic } from '@qt-ui-copilot/project-core';
import type { WorkspaceService } from '../workspace/workspace-service';
import type { PreviewSessionService, V3PreviewInput } from '../preview/preview-session-service';
import type { AttachmentService, ValidatedAttachment } from './attachment-service';
import type { UiCreationPlanner } from './ui-creation-planner';

export interface UiCreationServiceDeps {
  workspace: WorkspaceService;
  planner: UiCreationPlanner;
  attachments: AttachmentService;
  preview?: PreviewSessionService;
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
    const blueprint = await this.deps.planner.plan({
      requirement: request.requirement, attachments, targetQtVersion: request.qtKitId,
      fileName: request.fileName, rootType: request.rootType,
      useProjectResources: request.useProjectResources, useComponentLibrary: request.useComponentLibrary,
    });
    if (blueprint.fileName.toLowerCase() !== request.fileName.toLowerCase()) throw new Error('planner returned a different file name');
    if (blueprint.rootType !== request.rootType) throw new Error('planner returned a different root type');
    const source = generateUiFromBlueprint(blueprint).source;
    const id = `ui-creation-${randomUUID()}`;
    const candidateDir = join(rootDir, '.qt-ui-copilot', 'candidates', id);
    const candidatePath = join(candidateDir, request.fileName);
    await mkdir(candidateDir, { recursive: true });
    try {
      await writeFile(candidatePath, source, { encoding: 'utf8', flag: 'wx' });
      const validation = await this.validate(rootDir, candidatePath);
      if (!validation.uic) throw new Error(validation.findings.find((finding) => finding.code === 'uic_failed')?.message ?? 'uic validation failed');
      if (!validation.preview && this.deps.preview) throw new Error('preview validation failed');
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
    const config = loadProjectConfig(rootDir);
    const uic = this.deps.validateUic
      ? await this.deps.validateUic(rootDir, uiFile)
      : config
        ? await validateUiWithUic(profileFromConfig(rootDir, config), uiFile)
        : { valid: false, stderr: 'project profile missing' };
    if (!uic.valid) { findings.push({ severity: 'error', code: 'uic_failed', message: (uic.stderr || uic.stdout || 'uic validation failed').slice(0, 1000) }); return { uic: false, preview: false, findings }; }
    if (!this.deps.preview || !config) return { uic: true, preview: false, findings };
    const qt = config.qt; const p = config.preview;
    const result = await this.deps.preview.render({ uiFile, profile: { qtKitId: qt.version, mode: 'enhanced', width: p.width, height: p.height, locale: p.locale, style: p.style, qrcFiles: p.qrcFiles, stylesheets: p.stylesheets, fonts: p.fonts, pluginPaths: p.pluginPaths, highDpiMode: 'project-default' }, qt: { version: qt.version, compilerAbi: qt.compilerAbi, architecture: qt.architecture, binDirectory: qt.binDirectory, uic: qt.uic, rcc: qt.rcc, cmake: qt.cmake, cmakePrefixPath: qt.cmakePrefixPath, ...(qt.cmakeGenerator ? { cmakeGenerator: qt.cmakeGenerator } : {}) }, sourceDirectory: p.sourceDirectory, cacheDirectory: p.cacheDirectory, outputImage: join(dirname(uiFile), 'candidate.png') } as V3PreviewInput);
    return { uic: true, preview: true, previewDataUrl: result.imageDataUrl, findings };
  }

  private publicCandidate(candidate: StoredCandidate): UiCreationCandidate { const { candidatePath: _candidatePath, ...publicValue } = candidate; return publicValue; }
}

async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }

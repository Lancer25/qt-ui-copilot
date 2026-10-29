import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkspaceService } from '../workspace/workspace-service';
import { AttachmentService } from './attachment-service';
import { UiCreationService } from './ui-creation-service';

const blueprint = { fileName: 'Main.ui', rootType: 'QWidget' as const, rootObjectName: 'widget', windowTitle: 'Demo', size: { width: 400, height: 240 }, layoutTree: { kind: 'layout' as const, className: 'QVBoxLayout', objectName: 'mainLayout', properties: {}, children: [{ kind: 'widget' as const, className: 'QLabel', objectName: 'titleLabel', properties: { text: 'Demo', styleSheet: 'color:red' }, children: [] }] }, tabOrder: [], connections: [], resourceRefs: [], componentIds: [], expectedResults: ['显示'] };
const request = (workspaceId: string) => ({ workspaceId, contextMode: 'focused_ui' as const, requirement: '创建应用', attachments: [], fileName: 'Main.ui', rootType: 'QWidget' as const, directory: 'ui', qtKitId: '6.10.2', useProjectResources: true, useComponentLibrary: true, createProject: true, buildBackend: 'qmake' as const, capabilityCandidates: [] });

async function setup(root: string, preview?: { render(input: unknown): Promise<{ imageDataUrl: string }> }) {
  const workspace = new WorkspaceService(); const opened = await workspace.open(root);
  const service = new UiCreationService({ workspace, planner: { plan: async () => blueprint } as never, attachments: new AttachmentService(), validateUic: async () => ({ valid: true }), preview: preview as never });
  return { service, workspaceId: opened.id };
}

describe('UiCreationService project structure', () => {
  it('stages separate QSS and QRC files for a new application', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'qt-ui-new-app-'));
    try {
      const { service, workspaceId } = await setup(root);
      const candidate = await service.createCandidate(request(workspaceId));
      expect(candidate.files?.map((file) => file.relativePath)).toEqual(expect.arrayContaining(['ui/Main.ui', 'styles/app.qss', 'resources/app.qrc', 'main.cpp']));
      expect(candidate.files?.find((file) => file.relativePath === 'ui/Main.ui')?.content).not.toContain('styleSheet');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('keeps an existing Qt project structure unchanged', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'qt-ui-existing-app-'));
    try {
      await writeFile(path.join(root, 'Existing.pro'), 'QT += widgets');
      const { service, workspaceId } = await setup(root);
      const candidate = await service.createCandidate(request(workspaceId));
      expect(candidate.files).toBeUndefined();
      expect(candidate.source).toContain('styleSheet');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('loads staged QSS and QRC resources in candidate preview', async () => {    const root = await mkdtemp(path.join(tmpdir(), 'qt-ui-preview-style-')); let previewInput: { profile?: { qrcFiles?: string[]; stylesheets?: string[] } } | undefined;
    try {
      await mkdir(path.join(root, '.qt-ui-copilot'), { recursive: true });
      await writeFile(path.join(root, '.qt-ui-copilot', 'project.json'), JSON.stringify({ id: 'demo', qt: { version: '6.10.2', uic: 'uic', rcc: 'rcc', binDirectory: 'bin', compilerAbi: 'msvc2022_64', architecture: 'x86_64', cmake: 'cmake', cmakePrefixPath: 'qt' } }));
      const preview = { render: async (input: unknown) => { previewInput = input as typeof previewInput; return { imageDataUrl: 'data:image/png;base64,AA==' }; } };
      const { service, workspaceId } = await setup(root, preview);
      const candidate = await service.createCandidate(request(workspaceId));
      await service.finishCandidatePreview(candidate.id);
      expect(previewInput?.profile?.stylesheets?.some((file) => file.endsWith(path.join('styles', 'app.qss')))).toBe(true);
      expect(previewInput?.profile?.qrcFiles?.some((file) => file.endsWith(path.join('resources', 'app.qrc')))).toBe(true);
      await service.commit(candidate.id);
      const profile = JSON.parse(await readFile(path.join(root, '.qt-ui-copilot', 'project.json'), 'utf8')) as { preview: { stylesheets: string[]; qrcFiles: string[] } };
      expect(profile.preview.stylesheets).toContain('${projectRoot}/styles/app.qss');
      expect(profile.preview.qrcFiles).toContain('${projectRoot}/resources/app.qrc');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('previews a portable project with the locally bound Qt Kit instead of reporting it as unconfigured', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'qt-ui-portable-preview-')); let previewInput: { qt?: { uic?: string } } | undefined;
    try {
      // The portable profile the app writes records the Qt identity only; the
      // tool paths live in the local binding. Preview must not give up on it.
      await mkdir(path.join(root, '.qt-ui-copilot'), { recursive: true });
      await writeFile(path.join(root, '.qt-ui-copilot', 'project.json'), JSON.stringify({ id: 'demo', qt: { version: '6.10.2', qtMajor: 6, compilerAbi: 'msvc2022_64', architecture: 'x86_64' }, build: { backend: 'auto', directory: '.qt-ui-copilot/build' }, run: { executable: '.qt-ui-copilot/build/Debug/demo.exe' } }));
      const localQt = { version: '6.10.2', uic: path.join(root, 'Qt', 'bin', 'uic.exe'), rcc: path.join(root, 'Qt', 'bin', 'rcc.exe'), binDirectory: path.join(root, 'Qt', 'bin'), compilerAbi: 'msvc2022_64', architecture: 'x86_64', cmake: 'cmake', cmakePrefixPath: path.join(root, 'Qt') };
      const preview = { render: async (input: unknown) => { previewInput = input as typeof previewInput; return { imageDataUrl: 'data:image/png;base64,AA==' }; } };
      const workspace = new WorkspaceService(); const opened = await workspace.open(root);
      const service = new UiCreationService({ workspace, planner: { plan: async () => blueprint } as never, attachments: new AttachmentService(), validateUic: async () => ({ valid: true }), preview: preview as never, localQt: () => localQt });
      const candidate = await service.createCandidate(request(opened.id));
      await service.finishCandidatePreview(candidate.id);
      expect(previewInput?.qt?.uic).toBe(localQt.uic);
      const findings = service.getCandidate(candidate.id)?.validation.findings ?? [];
      expect(findings.some((finding) => finding.code === 'preview_not_configured')).toBe(false);
      expect(candidate.validation.findings.map((finding) => finding.code)).toEqual(['preview_pending']);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

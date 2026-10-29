import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { qtToolchainFromKit, resolveLocalQtToolchain, type LocalQtBindingStore } from './project-qt-binding';

const qtRoot = path.join('D:', 'Qt5.9.6', '5.9.6', 'msvc2015_64');
const bin = path.join(qtRoot, 'bin');
const kit = (id: string, version: string, overrides: Record<string, unknown> = {}) => ({
  id, displayName: `Qt ${version}`,
  config: { version, qtMajor: 5, rootDir: qtRoot, binDirectory: bin, uic: path.join(bin, 'uic.exe'), rcc: path.join(bin, 'rcc.exe'), compilerAbi: 'msvc2015_64', architecture: 'x86_64', ...overrides },
});
const store = (kits: ReturnType<typeof kit>[], binding?: { projectId: string; qtKitId: string }): LocalQtBindingStore => ({
  listQtKits: () => kits,
  getProjectBinding: (projectId) => binding && binding.projectId === projectId ? { qtKitId: binding.qtKitId } : undefined,
});
const installed = { exists: () => true };
const project = (root: string, profile?: unknown) => {
  mkdirSync(path.join(root, '.qt-ui-copilot'), { recursive: true });
  if (profile !== undefined) writeFileSync(path.join(root, '.qt-ui-copilot', 'project.json'), JSON.stringify(profile));
};

describe('local Qt Kit resolution', () => {
  it('reports no toolchain when nothing is saved or when no saved Kit is installed', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'qt-binding-'));
    try {
      project(root, { id: 'demo' });
      expect(resolveLocalQtToolchain(root, undefined)).toBeUndefined();
      expect(resolveLocalQtToolchain(root, store([]))).toBeUndefined();
      expect(resolveLocalQtToolchain(root, store([kit('old', '5.9.6')]), { exists: () => false })).toBeUndefined();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('maps a saved Kit onto the execution toolchain shape', () => {
    expect(qtToolchainFromKit(kit('qt-5', '5.9.6').config)).toEqual({
      version: '5.9.6', uic: path.join(bin, 'uic.exe'), rcc: path.join(bin, 'rcc.exe'), binDirectory: bin,
      compilerAbi: 'msvc2015_64', architecture: 'x86_64', cmake: 'cmake', cmakePrefixPath: qtRoot,
    });
    expect(qtToolchainFromKit({ version: '5.9.6' })).toBeUndefined();
  });

  it('uses the Kit the project binding names before any inferred match', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'qt-binding-'));
    try {
      // The project asks for Qt 6 while the user explicitly bound the Qt 5 Kit.
      project(root, { id: 'project-1', qt: { version: '6.10.2', qtMajor: 6, compilerAbi: 'msvc2022_64', architecture: 'x86_64' } });
      const resolved = resolveLocalQtToolchain(root, store([kit('qt-6', '6.10.2', { compilerAbi: 'msvc2022_64' }), kit('qt-5', '5.9.6')], { projectId: 'project-1', qtKitId: 'qt-5' }), installed);
      expect(resolved).toMatchObject({ kitId: 'qt-5', origin: 'project_binding', fingerprint: { version: '6.10.2' } });
      expect(resolved?.qt.uic).toBe(path.join(bin, 'uic.exe'));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('falls back to the Kit matching the Qt identity the portable project declares', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'qt-binding-'));
    try {
      project(root, { id: 'project-1', qt: { version: '6.10.2', qtMajor: 6, compilerAbi: 'msvc2022_64', architecture: 'x86_64' } });
      const resolved = resolveLocalQtToolchain(root, store([kit('qt-5', '5.9.6'), kit('qt-6', '6.10.2', { compilerAbi: 'msvc2022_64' })]), installed);
      expect(resolved).toMatchObject({ kitId: 'qt-6', origin: 'matching_kit' });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('still resolves a bound Kit for a project that declares no Qt identity', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'qt-binding-'));
    try {
      project(root, { id: 'project-1', qt: { version: '5.9.6', qtMajor: 5 } });
      const resolved = resolveLocalQtToolchain(root, store([kit('qt-5', '5.9.6')]), installed);
      expect(resolved).toMatchObject({ kitId: 'qt-5', origin: 'default_kit' });
      expect(resolved?.fingerprint).toBeUndefined();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('prefers the Kit marked as default when the project asks for a different one', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'qt-binding-'));
    try {
      project(root, { id: 'project-1', qt: { version: '6.10.2', qtMajor: 6, compilerAbi: 'msvc2022_64', architecture: 'x86_64' } });
      const resolved = resolveLocalQtToolchain(root, store([kit('qt-5', '5.9.6'), kit('qt-59b', '5.9.6', { isDefault: true })]), installed);
      expect(resolved).toMatchObject({ kitId: 'qt-59b', origin: 'default_kit' });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('resolves a project that has no profile file from the saved default Kit', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'qt-binding-'));
    try {
      project(root);
      expect(resolveLocalQtToolchain(root, store([kit('qt-5', '5.9.6')]), installed)).toMatchObject({ kitId: 'qt-5', origin: 'default_kit' });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_CONFIG_RELATIVE_PATH, type ProjectQtToolchain } from '@qt-ui-copilot/project-core';
import { localQtToolchainFromKit, portableQtFingerprint, type PortableQtKitFingerprint } from '../../shared/portable-qt-kit-match';

/** Only the durable, machine-local half of the settings store is required. */
export interface LocalQtBindingStore {
  listQtKits(): Array<{ id: string; displayName: string; config: Record<string, unknown> }>;
  getProjectBinding?(projectId: string): { qtKitId: string } | undefined;
}

export interface LocalQtToolchainOptions {
  /** Injectable for deterministic tests. */
  exists?(path: string): boolean;
}

export type LocalQtToolchainOrigin = 'project_binding' | 'matching_kit' | 'default_kit';

export interface ResolvedLocalQtToolchain {
  qt: ProjectQtToolchain;
  kitId: string;
  kitName: string;
  /** Why this Kit was chosen, so the UI can explain an implicit fallback. */
  origin: LocalQtToolchainOrigin;
  /** The Qt identity the project file asks for, when it declares one. */
  fingerprint?: PortableQtKitFingerprint;
}

const asText = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;

/**
 * Converts a saved Qt Kit into the execution toolchain shape. The path
 * defaults live in the shared helper so the renderer gates preview on the same
 * answer Main would compute.
 */
export function qtToolchainFromKit(config: Record<string, unknown>): ProjectQtToolchain | undefined {
  return localQtToolchainFromKit(config);
}

function readProjectProfile(rootDir: string): Record<string, unknown> | undefined {
  try {
    const raw: unknown = JSON.parse(readFileSync(join(rootDir, PROJECT_CONFIG_RELATIVE_PATH), 'utf8'));
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : undefined;
  } catch { return undefined; }
}

/** A saved Kit whose tools are actually present on this computer. */
interface InstalledKit {
  id: string;
  name: string;
  isDefault: boolean;
  qt: ProjectQtToolchain;
}

/**
 * Resolves the Qt tool paths for a project on *this* computer. A portable
 * project profile deliberately omits them, so the verified chain is: the Kit
 * the user explicitly bound to the project, then the Kit matching the Qt
 * identity the project declares, then the configured default Kit. Kits whose
 * tools are no longer installed are never returned.
 */
export function resolveLocalQtToolchain(rootDir: string, store: LocalQtBindingStore | undefined, options: LocalQtToolchainOptions = {}): ResolvedLocalQtToolchain | undefined {
  if (!store) return undefined;
  const exists = options.exists ?? existsSync;
  const kits: InstalledKit[] = [];
  for (const record of store.listQtKits()) {
    const qt = qtToolchainFromKit(record.config);
    if (!qt || !exists(qt.uic) || !exists(qt.rcc)) continue;
    kits.push({ id: record.id, name: record.displayName, isDefault: record.config.isDefault === true, qt });
  }
  if (!kits.length) return undefined;
  const profile = readProjectProfile(rootDir);
  const fingerprint = portableQtFingerprint(profile);
  const resolve = (kit: InstalledKit, origin: LocalQtToolchainOrigin): ResolvedLocalQtToolchain => ({ qt: kit.qt, kitId: kit.id, kitName: kit.name, origin, ...(fingerprint ? { fingerprint } : {}) });

  const profileId = asText(profile?.id);
  const boundKitId = profileId ? store.getProjectBinding?.(profileId)?.qtKitId : undefined;
  const bound = boundKitId ? kits.find((kit) => kit.id === boundKitId) : undefined;
  if (bound) return resolve(bound, 'project_binding');

  const matching = fingerprint
    ? kits.find((kit) => kit.qt.version === fingerprint.version && kit.qt.compilerAbi === fingerprint.compilerAbi && kit.qt.architecture === fingerprint.architecture)
    : undefined;
  if (matching) return resolve(matching, 'matching_kit');

  return resolve(kits.find((kit) => kit.isDefault) ?? kits[0]!, 'default_kit');
}

/**
 * A project profile records only the logical identity of a Qt Kit.  Paths are
 * deliberately excluded: they belong to the computer on which Qt is
 * installed.  This module is dependency-free so it can be used by both the
 * main process and renderer without importing Node-only workspace code.
 */
export interface PortableQtKitFingerprint {
  version: string;
  qtMajor?: 5 | 6;
  compilerAbi: string;
  architecture: string;
}

export interface LocalQtKitFingerprint extends PortableQtKitFingerprint {
  id: string;
}

export type PortableQtKitMatch<T extends LocalQtKitFingerprint> =
  | { status: 'not_required' }
  | { status: 'matched'; kit: T }
  | { status: 'binding_required' };

/**
 * The executable paths a saved Kit hands to the build/preview toolchain. It is
 * deliberately free of `node:path` and `process` so both processes compute the
 * same answer.
 */
export interface LocalQtToolchain {
  version: string;
  uic: string;
  rcc: string;
  binDirectory: string;
  compilerAbi: string;
  architecture: string;
  cmake: string;
  cmakePrefixPath: string;
  cmakeGenerator?: string;
}

/** The saved-Kit fields the toolchain is read from; Main flattens `config`, settings rows nest it. */
export interface QtKitToolSource {
  version?: unknown;
  uic?: unknown;
  rcc?: unknown;
  binDirectory?: unknown;
  compilerAbi?: unknown;
  architecture?: unknown;
  cmake?: unknown;
  cmakePrefixPath?: unknown;
  cmakeGenerator?: unknown;
  rootDir?: unknown;
}

const asText = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const parentDirectory = (value: string): string => {
  const separator = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
  return separator > 0 ? value.slice(0, separator) : value;
};
const qtMajorFor = (version: string): 5 | 6 | undefined => {
  const major = Number(version.split('.', 1)[0]);
  return major === 5 || major === 6 ? major : undefined;
};

/** Reads only a valid portable Qt fingerprint from an untrusted project JSON. */
export function portableQtFingerprint(profile: unknown): PortableQtKitFingerprint | undefined {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return undefined;
  const qt = (profile as { qt?: unknown }).qt;
  if (!qt || typeof qt !== 'object' || Array.isArray(qt)) return undefined;
  const candidate = qt as Record<string, unknown>;
  const version = asText(candidate.version);
  const compilerAbi = asText(candidate.compilerAbi);
  const architecture = asText(candidate.architecture);
  if (!version || !compilerAbi || !architecture) return undefined;
  const derivedMajor = qtMajorFor(version);
  const declaredMajor = candidate.qtMajor;
  const qtMajor = declaredMajor === 5 || declaredMajor === 6 ? declaredMajor : derivedMajor;
  if (!qtMajor || (derivedMajor && qtMajor !== derivedMajor)) return undefined;
  return { version, qtMajor, compilerAbi, architecture };
}

/**
 * Matches exactly so a copied project never silently selects a different
 * compiler/architecture Qt installation on the destination machine.
 */
export function matchPortableQtKit<T extends LocalQtKitFingerprint>(profile: unknown, kits: readonly T[]): PortableQtKitMatch<T> {
  const fingerprint = portableQtFingerprint(profile);
  if (!fingerprint) return { status: 'not_required' };
  const kit = kits.find((candidate) => candidate.version === fingerprint.version
    && candidate.qtMajor === fingerprint.qtMajor
    && candidate.compilerAbi === fingerprint.compilerAbi
    && candidate.architecture === fingerprint.architecture);
  return kit ? { status: 'matched', kit } : { status: 'binding_required' };
}

/**
 * Reads the tool paths out of a saved Qt Kit, or `undefined` when the Kit does
 * not describe a usable Qt installation. A Kit records the Qt installation
 * itself: `cmake` is an application tool that lives on PATH, and a Kit without
 * an explicit prefix path uses its own root — the same defaults the main
 * process applies. Requiring a stored `cmake` would leave every real Kit
 * looking unconfigured.
 */
export function localQtToolchainFromKit(source: QtKitToolSource | undefined): LocalQtToolchain | undefined {
  const version = asText(source?.version); const uic = asText(source?.uic); const rcc = asText(source?.rcc); const binDirectory = asText(source?.binDirectory);
  if (!version || !uic || !rcc || !binDirectory) return undefined;
  const cmakeGenerator = asText(source?.cmakeGenerator);
  return {
    version, uic, rcc, binDirectory,
    compilerAbi: asText(source?.compilerAbi) ?? asText(source?.architecture) ?? 'unknown',
    architecture: asText(source?.architecture) ?? 'x86_64',
    cmake: asText(source?.cmake) ?? 'cmake',
    cmakePrefixPath: asText(source?.cmakePrefixPath) ?? asText(source?.rootDir) ?? parentDirectory(parentDirectory(uic)),
    ...(cmakeGenerator ? { cmakeGenerator } : {}),
  };
}

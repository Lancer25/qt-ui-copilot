import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ProjectConfigSchema, ProjectProfileSchema, type ProjectConfig, type ProjectProfile } from '@qt-ui-copilot/contracts';

export const loadProjectProfile = (profilePath: string): ProjectProfile => {
  const parsed: unknown = JSON.parse(readFileSync(profilePath, 'utf8'));
  return ProjectProfileSchema.parse(parsed);
};

export const PROJECT_CONFIG_RELATIVE_PATH = path.join('.qt-ui-copilot', 'project.json');

/** The Qt tool paths that exist only on the machine owning the Qt install. */
export type ProjectQtToolchain = ProjectConfig['qt'];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const asText = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value : undefined;

/** The project file is untrusted input, and the portable profile written by
 * `syncProjectProfile` carries a subset of the execution shape. Forward only
 * the keys the execution schema owns so a partial section still parses. */
const pick = (source: unknown, keys: readonly string[]): Record<string, unknown> => {
  if (!isRecord(source)) return {};
  return Object.fromEntries(keys.flatMap((key) => source[key] === undefined ? [] : [[key, source[key]]]));
};

const qtKeys = ['version', 'uic', 'rcc', 'binDirectory', 'compilerAbi', 'architecture', 'cmake', 'cmakePrefixPath', 'cmakeGenerator'] as const;
const previewKeys = ['sourceDirectory', 'cacheDirectory', 'width', 'height', 'locale', 'style', 'qrcFiles', 'stylesheets', 'fonts', 'pluginPaths'] as const;
const buildKeys = ['command', 'configure', 'backend'] as const;
const runKeys = ['executable', 'args', 'environment', 'routeId', 'route'] as const;

/** A file owns its Qt tool paths only when it records the whole toolchain. */
const usableQtToolchain = (value: unknown): Record<string, unknown> | undefined => isRecord(value)
  && asText(value.uic) && asText(value.rcc) && asText(value.binDirectory) && asText(value.cmake) && asText(value.cmakePrefixPath) ? value : undefined;

function expandProjectRoot(value: string, rootDir: string): string {
  return value.replaceAll('${projectRoot}', rootDir);
}

/**
 * Loads the execution-only configuration and expands its intentionally tiny
 * ${projectRoot} macro. Relative paths are interpreted relative to the app.
 *
 * `localQt` supplies the tool paths that a portable profile deliberately
 * omits: those paths belong to the computer that owns the Qt installation, so
 * a project copied between machines can only execute once the local binding
 * is merged in here. The file still wins when it records a whole toolchain.
 */
export const loadProjectConfig = (rootDir: string, localQt?: ProjectQtToolchain): ProjectConfig | undefined => {
  const profilePath = path.join(rootDir, PROJECT_CONFIG_RELATIVE_PATH);
  let source: Record<string, unknown> = {};
  if (existsSync(profilePath)) {
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(profilePath, 'utf8')); } catch { return undefined; }
    source = isRecord(raw) ? raw : {};
  } else if (!localQt) {
    return undefined;
  }
  const id = asText(source.id) ?? path.basename(rootDir);
  // A newly created project initially persists only its Qt Kit. Derive the
  // routine preview/build/run sections so that it can compile immediately.
  const parsed = ProjectConfigSchema.safeParse({
    id,
    qt: pick(usableQtToolchain(source.qt) ?? localQt ?? source.qt, qtKeys),
    preview: { sourceDirectory: rootDir, cacheDirectory: '${projectRoot}/.qt-ui-copilot/preview-cache', width: 900, height: 640, locale: 'zh_CN', style: 'Fusion', qrcFiles: [], stylesheets: [], fonts: [], pluginPaths: [], ...pick(source.preview, previewKeys) },
    build: { command: { executable: 'cmake', args: [] }, backend: 'auto', ...pick(source.build, buildKeys) },
    run: { executable: `\${projectRoot}/.qt-ui-copilot/build/${id}.exe`, args: [], environment: {}, ...pick(source.run, runKeys) },
  });
  // A project without an identifiable Qt toolchain is simply not configured;
  // callers report that as "bind a Qt Kit" rather than as a schema error.
  if (!parsed.success) return undefined;
  const config = parsed.data;
  const resolveConfiguredPath = (value: string): string => {
    const expanded = expandProjectRoot(value, rootDir);
    return path.isAbsolute(expanded) ? path.normalize(expanded) : path.resolve(rootDir, expanded);
  };
  // Qt tools are either installed paths or commands resolved from PATH; a bare
  // name must never be rewritten into a project-relative file path.
  const resolveToolExecutable = (value: string): string => {
    const expanded = expandProjectRoot(value, rootDir);
    if (path.isAbsolute(expanded)) return path.normalize(expanded);
    return expanded.includes('/') || expanded.includes('\\') ? path.resolve(rootDir, expanded) : expanded;
  };
  return {
    ...config,
    qt: {
      ...config.qt,
      uic: resolveToolExecutable(config.qt.uic), rcc: resolveToolExecutable(config.qt.rcc),
      cmake: resolveToolExecutable(config.qt.cmake),
      binDirectory: resolveConfiguredPath(config.qt.binDirectory),
      cmakePrefixPath: resolveConfiguredPath(config.qt.cmakePrefixPath),
    },
    preview: {
      ...config.preview,
      sourceDirectory: resolveConfiguredPath(config.preview.sourceDirectory), cacheDirectory: resolveConfiguredPath(config.preview.cacheDirectory),
      qrcFiles: config.preview.qrcFiles.map(resolveConfiguredPath), stylesheets: config.preview.stylesheets.map(resolveConfiguredPath),
      fonts: config.preview.fonts.map(resolveConfiguredPath), pluginPaths: config.preview.pluginPaths.map(resolveConfiguredPath),
    },
    build: {
      backend: config.build.backend,
      command: {
        ...config.build.command,
        executable: resolveConfiguredPath(config.build.command.executable),
        args: config.build.command.args.map((arg) => expandProjectRoot(arg, rootDir)),
      },
      ...(config.build.configure ? { configure: {
        ...config.build.configure,
        executable: resolveConfiguredPath(config.build.configure.executable),
        args: config.build.configure.args.map((arg) => expandProjectRoot(arg, rootDir)),
      } } : {}),
    },
    run: { ...config.run, executable: resolveConfiguredPath(config.run.executable) },
  };
};

export function profileFromConfig(rootDir: string, config: ProjectConfig): ProjectProfile {
  return ProjectProfileSchema.parse({
    id: config.id, rootDir,
    qt: { version: config.qt.version, uic: config.qt.uic, rcc: config.qt.rcc, binDirectory: config.qt.binDirectory },
    build: config.build,
    // `routeId` belongs to the execution config and is resolved by the
    // runtime workflow. ProjectProfile is the legacy launch profile and has
    // a deliberately strict run schema, so do not leak the routing metadata
    // into it.
    run: { executable: config.run.executable, args: config.run.args, environment: config.run.environment },
  });
}

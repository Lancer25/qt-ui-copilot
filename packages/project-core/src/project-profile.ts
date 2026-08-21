import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ProjectConfigSchema, ProjectProfileSchema, type ProjectConfig, type ProjectProfile } from '@qt-ui-copilot/contracts';

export const loadProjectProfile = (profilePath: string): ProjectProfile => {
  const parsed: unknown = JSON.parse(readFileSync(profilePath, 'utf8'));
  return ProjectProfileSchema.parse(parsed);
};

export const PROJECT_CONFIG_RELATIVE_PATH = path.join('.qt-ui-copilot', 'project.json');

function expandProjectRoot(value: string, rootDir: string): string {
  return value.replaceAll('${projectRoot}', rootDir);
}

/** Loads the execution-only configuration and expands its intentionally tiny
 * ${projectRoot} macro. Relative paths are interpreted relative to the app. */
export const loadProjectConfig = (rootDir: string): ProjectConfig | undefined => {
  const profilePath = path.join(rootDir, PROJECT_CONFIG_RELATIVE_PATH);
  if (!existsSync(profilePath)) return undefined;
  const raw: unknown = JSON.parse(readFileSync(profilePath, 'utf8'));
  const config = ProjectConfigSchema.parse(raw);
  const resolveConfiguredPath = (value: string): string => {
    const expanded = expandProjectRoot(value, rootDir);
    return path.isAbsolute(expanded) ? path.normalize(expanded) : path.resolve(rootDir, expanded);
  };
  return {
    ...config,
    qt: {
      ...config.qt,
      uic: resolveConfiguredPath(config.qt.uic), rcc: resolveConfiguredPath(config.qt.rcc),
      binDirectory: resolveConfiguredPath(config.qt.binDirectory), cmake: resolveConfiguredPath(config.qt.cmake),
      cmakePrefixPath: resolveConfiguredPath(config.qt.cmakePrefixPath),
    },
    preview: {
      ...config.preview,
      sourceDirectory: resolveConfiguredPath(config.preview.sourceDirectory), cacheDirectory: resolveConfiguredPath(config.preview.cacheDirectory),
      qrcFiles: config.preview.qrcFiles.map(resolveConfiguredPath), stylesheets: config.preview.stylesheets.map(resolveConfiguredPath),
      fonts: config.preview.fonts.map(resolveConfiguredPath), pluginPaths: config.preview.pluginPaths.map(resolveConfiguredPath),
    },
    build: { command: {
      ...config.build.command,
      executable: resolveConfiguredPath(config.build.command.executable),
      args: config.build.command.args.map((arg) => expandProjectRoot(arg, rootDir)),
    } },
    run: { ...config.run, executable: resolveConfiguredPath(config.run.executable) },
  };
};

export function profileFromConfig(rootDir: string, config: ProjectConfig): ProjectProfile {
  return ProjectProfileSchema.parse({
    id: config.id, rootDir,
    qt: { version: config.qt.version, uic: config.qt.uic, rcc: config.qt.rcc },
    build: config.build,
    run: config.run,
  });
}

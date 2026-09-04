import { z } from 'zod';

export const CommandSchema = z.object({
  executable: z.string().min(1),
  args: z.array(z.string()).default([]),
}).strict();

export const QtToolchainSchema = z.object({
  version: z.string().min(1),
  uic: z.string().min(1),
  rcc: z.string().min(1),
}).strict();

/** The persisted, allow-listed QtUiProbe route format. Keep this schema
 * independent from the probe-client package so project configuration can be
 * validated before any runtime worker is loaded. */
export const SemanticRouteStepSchema = z.union([
  z.object({ kind: z.literal('activateWindow'), objectName: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('resizeWindow'), objectName: z.string().min(1), width: z.number().int().positive(), height: z.number().int().positive() }).strict(),
  z.object({ kind: z.literal('invoke'), objectName: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('triggerAction'), objectName: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('selectTab'), objectName: z.string().min(1), index: z.number().int().nonnegative().optional(), text: z.string().optional() }).strict(),
  z.object({ kind: z.literal('selectComboItem'), objectName: z.string().min(1), index: z.number().int().nonnegative().optional(), text: z.string().optional() }).strict(),
  z.object({ kind: z.literal('setLineEditText'), objectName: z.string().min(1), text: z.string() }).strict(),
  z.object({ kind: z.literal('setCheckState'), objectName: z.string().min(1), checked: z.boolean() }).strict(),
  z.object({ kind: z.literal('waitForWidget'), objectName: z.string().min(1), timeoutMs: z.number().int().positive().optional() }).strict(),
  z.object({ kind: z.literal('waitForUi'), objectName: z.string().min(1), timeoutMs: z.number().int().positive().optional() }).strict(),
]);

export const SemanticRouteSchema = z.object({
  id: z.string().min(1),
  targetUi: z.string().min(1),
  steps: z.array(SemanticRouteStepSchema).min(1),
}).strict();

/**
 * The reproducible, project-owned configuration used for an actual workflow.
 * This is intentionally separate from the small ProjectProfile used by older
 * callers: importing a folder is allowed without it, but executing a task is
 * not.  Every command remains argv-only.
 */
export const ProjectConfigSchema = z.object({
  id: z.string().min(1),
  qt: QtToolchainSchema.extend({
    binDirectory: z.string().min(1),
    compilerAbi: z.string().min(1),
    architecture: z.string().min(1),
    cmake: z.string().min(1),
    cmakePrefixPath: z.string().min(1),
    cmakeGenerator: z.string().min(1).optional(),
  }).strict(),
  preview: z.object({
    sourceDirectory: z.string().min(1),
    cacheDirectory: z.string().min(1),
    width: z.number().int().positive().default(900),
    height: z.number().int().positive().default(640),
    locale: z.string().min(1).default('zh_CN'),
    style: z.string().min(1).default('Fusion'),
    qrcFiles: z.array(z.string()).default([]),
    stylesheets: z.array(z.string()).default([]),
    fonts: z.array(z.string()).default([]),
    pluginPaths: z.array(z.string()).default([]),
  }).strict(),
  build: z.object({ command: CommandSchema, configure: CommandSchema.optional(), backend: z.enum(['qmake', 'msbuild', 'auto']).default('auto') }).strict(),
  run: z.object({
    executable: z.string().min(1),
    args: z.array(z.string()).default([]),
    environment: z.record(z.string(), z.string()).default({}),
    /** Stored route id, resolved from the durable routes table when present. */
    routeId: z.string().min(1).optional(),
    /** Optional project-owned route seeded into the durable route store on import. */
    route: SemanticRouteSchema.optional(),
  }).strict(),
}).strict();

export const ProjectProfileSchema = z.object({
  id: z.string().min(1),
  rootDir: z.string().min(1),
  qt: QtToolchainSchema.extend({ binDirectory: z.string().min(1).optional() }).strict(),
  build: z.object({ command: CommandSchema, configure: CommandSchema.optional(), backend: z.enum(['qmake', 'msbuild', 'auto']).default('auto') }).strict(),
  run: z.object({
    executable: z.string().min(1),
    args: z.array(z.string()).default([]),
    environment: z.record(z.string(), z.string()).default({}),
  }).strict(),
}).strict();

export type Command = z.infer<typeof CommandSchema>;
export type QtToolchain = z.infer<typeof QtToolchainSchema>;
export type ProjectProfile = Omit<z.infer<typeof ProjectProfileSchema>, 'build'> & { build: Omit<z.infer<typeof ProjectProfileSchema>['build'], 'backend'> & { backend?: 'qmake' | 'msbuild' | 'auto' } };
export type ProjectConfig = Omit<z.infer<typeof ProjectConfigSchema>, 'build'> & { build: Omit<z.infer<typeof ProjectConfigSchema>['build'], 'backend'> & { backend?: 'qmake' | 'msbuild' | 'auto' } };
export type SemanticRoute = z.infer<typeof SemanticRouteSchema>;
export type SemanticRouteStep = z.infer<typeof SemanticRouteStepSchema>;

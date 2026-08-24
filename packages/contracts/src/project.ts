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
  build: z.object({ command: CommandSchema, configure: CommandSchema.optional() }).strict(),
  run: z.object({
    executable: z.string().min(1),
    args: z.array(z.string()).default([]),
    environment: z.record(z.string(), z.string()).default({}),
    /** Stored route id, resolved from the durable routes table when present. */
    routeId: z.string().min(1).optional(),
  }).strict(),
}).strict();

export const ProjectProfileSchema = z.object({
  id: z.string().min(1),
  rootDir: z.string().min(1),
  qt: QtToolchainSchema.extend({ binDirectory: z.string().min(1).optional() }).strict(),
  build: z.object({ command: CommandSchema, configure: CommandSchema.optional() }).strict(),
  run: z.object({
    executable: z.string().min(1),
    args: z.array(z.string()).default([]),
    environment: z.record(z.string(), z.string()).default({}),
  }).strict(),
}).strict();

export type Command = z.infer<typeof CommandSchema>;
export type QtToolchain = z.infer<typeof QtToolchainSchema>;
export type ProjectProfile = z.infer<typeof ProjectProfileSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

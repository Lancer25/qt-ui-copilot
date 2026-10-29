import { z } from 'zod';

export const ComponentDependencySchema = z.object({
  className: z.string().min(1),
  header: z.string().min(1).optional(),
  plugin: z.string().min(1).optional(),
}).strict();

/**
 * Build metadata for a user-approved binary Qt widget.  Unlike a UI fragment,
 * this describes a real promoted widget and must never be turned into a fake
 * XML fragment just to reuse the fragment insertion path.
 */
export const BinaryComponentBuildMetadataSchema = z.object({
  className: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*$/),
  baseClass: z.enum(['QWidget', 'QDialog', 'QMainWindow']),
  headerPath: z.string().min(1),
  sourcePaths: z.array(z.string().min(1)).optional(),
  includeDir: z.string().min(1).optional(),
  libPath: z.string().min(1).optional(),
  libDir: z.string().min(1).optional(),
  dllPath: z.string().min(1).optional(),
  runtimeDllPaths: z.array(z.string().min(1)).default([]),
  qssPath: z.string().min(1).optional(),
  qrcPath: z.string().min(1).optional(),
  qtModules: z.array(z.string().min(1)).default([]),
  /** Absolute only inside the application process; never exposed to the model. */
  sourceRoot: z.string().min(1),
}).strict();
export type BinaryComponentBuildMetadata = z.infer<typeof BinaryComponentBuildMetadataSchema>;

export const ComponentRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  sourceProject: z.string().min(1),
  sourceUiFile: z.string().min(1),
  rootObjectName: z.string().min(1),
  uiFragment: z.string().min(1),
  structureSummary: z.string().min(1),
  screenshotPaths: z.array(z.string().min(1)).default([]),
  widgetClasses: z.array(z.string().min(1)).default([]),
  layoutTypes: z.array(z.string().min(1)).default([]),
  qssDependencies: z.array(z.string().min(1)).default([]),
  qrcDependencies: z.array(z.string().min(1)).default([]),
  customWidgets: z.array(ComponentDependencySchema).default([]),
  connections: z.array(z.object({ sender: z.string().min(1), signal: z.string().min(1), receiver: z.string().min(1), slot: z.string().min(1) }).strict()).default([]),
  qtVersionRange: z.string().min(1).optional(),
  usageNotes: z.string().min(1).optional(),
  binaryBuild: BinaryComponentBuildMetadataSchema.optional(),
}).strict();

export type ComponentDependency = z.infer<typeof ComponentDependencySchema>;
export type ComponentRecord = z.infer<typeof ComponentRecordSchema>;

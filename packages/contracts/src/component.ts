import { z } from 'zod';

export const ComponentDependencySchema = z.object({
  className: z.string().min(1),
  header: z.string().min(1).optional(),
  plugin: z.string().min(1).optional(),
}).strict();

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
}).strict();

export type ComponentDependency = z.infer<typeof ComponentDependencySchema>;
export type ComponentRecord = z.infer<typeof ComponentRecordSchema>;

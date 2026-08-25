import { z } from 'zod';
import { UiOperationSchema } from './ui-document.js';

/** Files that are useful to a Qt Widgets workspace.  The scanner may retain
 * additional files as `other`, but binary files are never sent to a client. */
export const WorkspaceFileKindSchema = z.enum([
  'ui', 'qss', 'qrc', 'source', 'header', 'cmake', 'font', 'plugin', 'other',
]);

export const WorkspaceFileSchema = z.object({
  absolutePath: z.string().min(1),
  relativePath: z.string().min(1),
  kind: WorkspaceFileKindSchema,
  size: z.number().int().nonnegative(),
  contentHash: z.string().min(1),
  modifiedAt: z.number().finite(),
}).strict();

export const WorkspaceSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  rootDir: z.string().min(1),
  fileCount: z.number().int().nonnegative().default(0),
  lastOpenedAt: z.number().finite(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  profile: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const PreviewModeSchema = z.enum(['quick', 'enhanced']);
export const HighDpiModeSchema = z.enum(['project-default', 'logical-96', 'system']);

export const PreviewProfileSchema = z.object({
  qtKitId: z.string().min(1),
  mode: PreviewModeSchema,
  width: z.number().int().min(160).max(4096),
  height: z.number().int().min(120).max(4096),
  locale: z.string().min(2),
  style: z.string().min(1),
  qrcFiles: z.array(z.string().min(1)),
  stylesheets: z.array(z.string().min(1)),
  fonts: z.array(z.string().min(1)),
  pluginPaths: z.array(z.string().min(1)),
  highDpiMode: HighDpiModeSchema,
}).strict();

export const AiContextModeSchema = z.enum(['focused_ui', 'whole_project']);
export const ApplyModeSchema = z.enum(['approval', 'auto_apply']);

export const RevisionFindingSchema = z.object({
  severity: z.enum(['info', 'warning', 'error']),
  code: z.string().min(1),
  message: z.string().min(1),
}).strict();

export const RevisionValidationSchema = z.object({
  xml: z.boolean(),
  semantic: z.boolean(),
  uic: z.boolean(),
  preview: z.boolean(),
  findings: z.array(RevisionFindingSchema).default([]),
  validatedAt: z.number().finite(),
}).strict();

export const UiRevisionSchema = z.object({
  id: z.string().min(1),
  uiFile: z.string().min(1),
  parentId: z.string().min(1).optional(),
  conversationId: z.string().min(1),
  operations: z.array(UiOperationSchema),
  beforeHash: z.string().min(1),
  afterHash: z.string().min(1),
  validation: RevisionValidationSchema,
  createdAt: z.number().finite(),
}).strict();

export const ConversationMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string(),
  createdAt: z.number().finite(),
}).strict();

export const ConversationRecordSchema = z.object({
  id: z.string().min(1),
  uiFile: z.string().min(1),
  contextMode: AiContextModeSchema,
  applyMode: ApplyModeSchema,
  title: z.string().min(1).optional(),
  messages: z.array(ConversationMessageSchema).default([]),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
}).strict();

export const UiEditorSessionSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  filePath: z.string().min(1).refine((value) => value.toLowerCase().endsWith('.ui'), 'Editor sessions must target a .ui file'),
  preview: PreviewProfileSchema,
  conversationId: z.string().min(1),
  dirty: z.boolean().default(false),
  baselineHash: z.string().min(1).optional(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
}).strict();

export type WorkspaceFileKind = z.infer<typeof WorkspaceFileKindSchema>;
export type WorkspaceFile = z.infer<typeof WorkspaceFileSchema>;
export type WorkspaceSummary = z.infer<typeof WorkspaceSummarySchema>;
export type PreviewMode = z.infer<typeof PreviewModeSchema>;
export type PreviewProfile = z.infer<typeof PreviewProfileSchema>;
export type AiContextMode = z.infer<typeof AiContextModeSchema>;
export type ApplyMode = z.infer<typeof ApplyModeSchema>;
export type RevisionValidation = z.infer<typeof RevisionValidationSchema>;
export type UiRevision = z.infer<typeof UiRevisionSchema>;
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
export type ConversationRecord = z.infer<typeof ConversationRecordSchema>;
export type UiEditorSession = z.infer<typeof UiEditorSessionSchema>;

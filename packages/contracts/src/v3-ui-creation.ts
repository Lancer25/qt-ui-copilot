import { z } from 'zod';
import { UiValueSchema } from './ui-document.js';
import { UiCapabilityCandidateSchema } from './ui-capability.js';

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
const ATTACHMENT_KINDS = ['image', 'ui', 'qss', 'qrc', 'source'] as const;

const attachmentPayload = (value: { kind: string; mimeType: string; dataUrl?: string; text?: string }, context: z.RefinementCtx) => {
  if (value.kind === 'image') {
    if (!IMAGE_MIME_TYPES.has(value.mimeType) || !value.dataUrl?.startsWith(`data:${value.mimeType};base64,`)) {
      context.addIssue({ code: 'custom', message: 'invalid image attachment payload' });
    }
    if (value.text !== undefined) context.addIssue({ code: 'custom', message: 'image attachments cannot contain text' });
  } else {
    if (value.text === undefined) context.addIssue({ code: 'custom', message: 'text attachment content is required' });
    if (value.dataUrl !== undefined) context.addIssue({ code: 'custom', message: 'text attachments cannot contain dataUrl' });
  }
};

export const AiAttachmentSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(255),
  kind: z.enum(ATTACHMENT_KINDS),
  mimeType: z.string().min(1).max(128),
  size: z.number().int().positive().max(10 * 1024 * 1024),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  dataUrl: z.string().max(14_000_000).optional(),
  text: z.string().max(2_000_000).optional(),
}).strict().superRefine(attachmentPayload);

export type AiAttachment = z.infer<typeof AiAttachmentSchema>;

export const UiBlueprintNodeSchema: z.ZodType<UiBlueprintNode> = z.lazy(() => z.object({
  kind: z.enum(['widget', 'layout', 'spacer']),
  className: z.string().min(1).max(128),
  objectName: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  properties: z.record(z.string().min(1), UiValueSchema).default({}),
  children: z.array(UiBlueprintNodeSchema).default([]),
}).strict());

export interface UiBlueprintNode {
  kind: 'widget' | 'layout' | 'spacer';
  className: string;
  objectName: string;
  properties: Record<string, z.infer<typeof UiValueSchema>>;
  children: UiBlueprintNode[];
}

export const UiConnectionSchema = z.object({
  sender: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  signal: z.string().min(1).max(256),
  receiver: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  slot: z.string().min(1).max(256),
}).strict();

export const UiCreationBlueprintSchema = z.object({
  fileName: z.string().regex(/^[^\\/:*?"<>|]+\.ui$/i),
  rootType: z.enum(['QWidget', 'QDialog', 'QMainWindow']),
  rootObjectName: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  windowTitle: z.string().max(256),
  size: z.object({
    width: z.number().int().min(160).max(4096),
    height: z.number().int().min(120).max(4096),
  }).strict(),
  layoutTree: UiBlueprintNodeSchema,
  tabOrder: z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/)).max(512),
  connections: z.array(UiConnectionSchema).max(512),
  resourceRefs: z.array(z.string().min(1).max(1024)).max(128),
  componentIds: z.array(z.string().min(1).max(256)).max(128),
  expectedResults: z.array(z.string().min(1).max(2048)).min(1).max(128),
}).strict();

export type UiCreationBlueprint = z.infer<typeof UiCreationBlueprintSchema>;

export const UiCreationRequestSchema = z.object({
  workspaceId: z.string().min(1),
  contextMode: z.enum(['focused_ui', 'whole_project']).default('focused_ui'),
  requirement: z.string().max(20_000).default(''),
  attachments: z.array(AiAttachmentSchema).max(16),
  fileName: z.string().regex(/^[^\\/:*?"<>|]+\.ui$/i),
  rootType: z.enum(['QWidget', 'QDialog', 'QMainWindow']),
  directory: z.string().min(1).max(1024),
  qtKitId: z.string().min(1),
  useProjectResources: z.boolean().default(true),
  useComponentLibrary: z.boolean().default(true),
  createProject: z.boolean().default(false),
  buildBackend: z.enum(['qmake', 'msbuild', 'auto']).default('auto'),
  /** Bounded, non-sensitive capability summaries supplied by the application. */
  capabilityCandidates: z.array(UiCapabilityCandidateSchema).max(20).default([]),
}).strict().superRefine((value, context) => {
  const images = value.attachments.filter((attachment) => attachment.kind === 'image');
  if (images.length > 4) context.addIssue({ code: 'custom', path: ['attachments'], message: 'at most four image attachments are allowed' });
  const total = value.attachments.reduce((sum, attachment) => sum + attachment.size, 0);
  if (total > 24 * 1024 * 1024) context.addIssue({ code: 'custom', path: ['attachments'], message: 'attachments exceed the 24MB total limit' });
  if (!value.requirement.trim() && images.length === 0) context.addIssue({ code: 'custom', path: ['requirement'], message: 'requirement or an image attachment is required' });
});

export type UiCreationRequest = Omit<z.infer<typeof UiCreationRequestSchema>, 'createProject' | 'buildBackend'> & { createProject?: boolean; buildBackend?: 'qmake' | 'msbuild' | 'auto' };

const relativeProjectPath = z.string().min(1).max(1024).refine((value) => {
  const normalized = value.replaceAll('\\', '/');
  return !normalized.startsWith('/') && !/^[A-Za-z]:\//.test(normalized) && !normalized.split('/').includes('..');
}, 'project paths must be relative and stay within the workspace');

export const UiProjectFileSchema = z.object({
  relativePath: relativeProjectPath,
  content: z.string().max(16 * 1024 * 1024),
  existing: z.boolean().default(false),
  conflict: z.boolean().default(false),
}).strict();

export type UiProjectFile = z.infer<typeof UiProjectFileSchema>;

export const UiCreationCandidateSchema = z.object({
  id: z.string().min(1),
  saved: z.boolean().optional(),
  stagedPath: z.string().min(1).max(4096).optional(),
  workspaceId: z.string().min(1),
  targetPath: z.string().min(1),
  blueprint: UiCreationBlueprintSchema,
  source: z.string().min(1),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  previewDataUrl: z.string().optional(),
  files: z.array(UiProjectFileSchema).max(128).optional(),
  buildBackend: z.enum(['qmake', 'msbuild', 'auto']).optional(),
  buildDirectory: relativeProjectPath.optional(),
  executable: relativeProjectPath.optional(),
  validation: z.object({
    xml: z.boolean(), semantic: z.boolean(), uic: z.boolean(), preview: z.boolean(),
    findings: z.array(z.object({ severity: z.enum(['info', 'warning', 'error']), code: z.string(), message: z.string() }).strict()).default([]),
  }).strict(),
  createdAt: z.number().finite(),
}).strict();

export type UiCreationCandidate = z.infer<typeof UiCreationCandidateSchema>;

import { z } from 'zod';
import { UiCreationCandidateSchema, UiCreationRequestSchema, type UiCreationRequest } from './v3-ui-creation.js';

export const V3TaskArtifactSchema = z.object({
  kind: z.enum(['candidate', 'preview', 'source', 'diff', 'output']),
  id: z.string().min(1).max(256),
  filePath: z.string().min(1).max(4096).optional(),
  candidate: UiCreationCandidateSchema.optional(),
}).strict();

export type V3TaskArtifact = z.infer<typeof V3TaskArtifactSchema>;

/**
 * One immutable fact emitted while a V3 task is running.  `sequence` is
 * allocated by the main process and lets every renderer reject stale events.
 */
export const V3TaskEventSchema = z.object({
  taskId: z.string().min(1).max(128),
  sequence: z.number().int().positive(),
  timestamp: z.number().int().positive(),
  lane: z.enum(['conversation', 'generation', 'preview', 'approval']),
  type: z.enum(['message_delta', 'status', 'artifact', 'warning', 'error', 'cancelled', 'done']),
  status: z.enum(['pending', 'running', 'completed', 'warning', 'failed', 'cancelled']).optional(),
  stage: z.string().min(1).max(128).optional(),
  title: z.string().min(1).max(256),
  detail: z.string().max(4096).optional(),
  artifact: V3TaskArtifactSchema.optional(),
}).strict();

export type V3TaskEvent = z.infer<typeof V3TaskEventSchema>;

export const V3TaskPreviewSchema = z.object({
  status: z.enum(['pending', 'running', 'completed', 'warning', 'failed', 'cancelled']),
  imageDataUrl: z.string().max(14_000_000).optional(),
  mode: z.enum(['quick', 'enhanced']).optional(),
  error: z.string().max(4096).optional(),
}).strict();

export type V3TaskPreview = z.infer<typeof V3TaskPreviewSchema>;

const relativeUiPath = z.string().min(1).max(4096).refine((value) => {
  const normalized = value.replaceAll('\\', '/');
  return normalized.toLowerCase().endsWith('.ui')
    && !normalized.startsWith('/')
    && !/^[A-Za-z]:\//.test(normalized)
    && !normalized.split('/').includes('..');
}, 'uiFile must be a relative .ui path within the workspace');

/** A user-driven visual adjustment that reuses an existing V3 task session. */
export const V3TaskStreamAdjustRequestSchema = z.object({
  taskId: z.string().min(1).max(128),
  candidateId: z.string().min(1).max(128).optional(),
  uiFile: relativeUiPath,
  uiContent: z.string().max(2_000_000),
  requirement: z.string().min(1).max(10_000),
  contextMode: z.enum(['focused_ui', 'whole_project']),
  previewDataUrl: z.string().max(14_000_000).refine((value) => /^data:image\/(png|jpeg|webp);base64,/.test(value), 'previewDataUrl must be a base64 image data URL').optional(),
}).strict();

export type V3TaskStreamAdjustRequest = z.infer<typeof V3TaskStreamAdjustRequestSchema>;

/** A serializable, bounded resume point returned by the main process. */
export const V3TaskSnapshotSchema = z.object({
  taskId: z.string().min(1).max(128),
  status: z.enum(['pending', 'running', 'completed', 'warning', 'failed', 'cancelled']),
  lastSequence: z.number().int().nonnegative(),
  events: z.array(V3TaskEventSchema).max(200).default([]),
  candidate: UiCreationCandidateSchema.optional(),
  preview: V3TaskPreviewSchema.optional(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
}).strict();

export type V3TaskSnapshot = z.infer<typeof V3TaskSnapshotSchema>;

export const V3TaskStreamModifyRequestSchema = z.object({
  requirement: z.string().min(1).max(10_000),
  uiFile: z.string().min(1).max(4096),
  uiContent: z.string().max(2_000_000),
  contextMode: z.enum(['focused_ui', 'whole_project']),
  workspaceId: z.string().min(1).max(128).optional(),
}).strict();

/** The two existing V3 AI flows behind one Main-process streaming boundary. */
export const V3StartTaskInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('create'), taskId: z.string().min(1).max(128).optional(), request: UiCreationRequestSchema }).strict(),
  z.object({ kind: z.literal('modify'), taskId: z.string().min(1).max(128).optional(), request: V3TaskStreamModifyRequestSchema }).strict(),
  z.object({ kind: z.literal('adjust'), taskId: z.string().min(1).max(128), request: V3TaskStreamAdjustRequestSchema }).strict(),
]);

// Keep the newly introduced project options optional at call sites so older
// integrations can continue constructing UI-only requests. The parser still
// supplies their defaults when data crosses the process boundary.
export type V3StartTaskInput =
  | { kind: 'create'; taskId?: string; request: UiCreationRequest }
  | { kind: 'modify'; taskId?: string; request: z.infer<typeof V3TaskStreamModifyRequestSchema> }
  | { kind: 'adjust'; taskId: string; request: V3TaskStreamAdjustRequest };

import { z } from 'zod';
import { UiCreationCandidateSchema } from './v3-ui-creation.js';

export const V3TaskArtifactSchema = z.object({
  kind: z.enum(['candidate', 'preview', 'source', 'diff', 'output']),
  id: z.string().min(1).max(256),
  filePath: z.string().min(1).max(4096).optional(),
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

import { z } from 'zod';

export const UiCreationStreamEventSchema = z.object({
  taskId: z.string().min(1).max(128), sequence: z.number().int().positive(), timestamp: z.number().int().positive(),
  lane: z.enum(['generation', 'preview']), type: z.enum(['started', 'progress', 'completed', 'warning', 'failed', 'cancelled']),
  stage: z.string().min(1).max(128), title: z.string().min(1).max(256), detail: z.string().max(2048).optional(), elapsedMs: z.number().int().nonnegative().optional(),
}).strict();
export type UiCreationStreamEvent = z.infer<typeof UiCreationStreamEventSchema>;
export const UiCreationTaskSnapshotSchema = z.object({
  taskId: z.string().min(1), status: z.enum(['running', 'base_ready', 'completed', 'failed', 'cancelled']), generationStatus: z.enum(['running', 'ready', 'failed', 'cancelled']),
  baseCandidate: z.object({ sourceHash: z.string().regex(/^[a-f0-9]{64}$/), uicPassed: z.boolean(), readyAt: z.number().int().positive() }).optional(),
  preview: z.object({ status: z.enum(['idle', 'running', 'ready', 'warning', 'failed', 'cancelled']), imageDataUrl: z.string().max(14_000_000).optional(), findings: z.array(z.string()).max(128) }).strict(),
  events: z.array(UiCreationStreamEventSchema).max(200).default([]), lastSequence: z.number().int().nonnegative(), createdAt: z.number().int().positive(), updatedAt: z.number().int().positive(),
}).strict();
export type UiCreationTaskSnapshot = z.infer<typeof UiCreationTaskSnapshotSchema>;

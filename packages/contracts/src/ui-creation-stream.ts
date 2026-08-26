import { z } from 'zod';

export const UiCreationStreamEventSchema = z.object({
  taskId: z.string().min(1).max(128), sequence: z.number().int().positive(), timestamp: z.number().int().positive(),
  lane: z.enum(['generation', 'preview']), type: z.enum(['started', 'progress', 'completed', 'warning', 'failed', 'cancelled']),
  stage: z.string().min(1).max(128), title: z.string().min(1).max(256), detail: z.string().max(2048).optional(), elapsedMs: z.number().int().nonnegative().optional(),
}).strict();
export type UiCreationStreamEvent = z.infer<typeof UiCreationStreamEventSchema>;
export const UiCreationTaskSnapshotSchema = z.object({ taskId: z.string().min(1), events: z.array(UiCreationStreamEventSchema).max(200), baseCandidateReady: z.boolean(), previewStatus: z.enum(['idle', 'running', 'ready', 'warning', 'failed', 'cancelled']) }).strict();
export type UiCreationTaskSnapshot = z.infer<typeof UiCreationTaskSnapshotSchema>;

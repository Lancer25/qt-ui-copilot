import { z } from 'zod';

export const PreviewRequestSchema = z.object({
  uiFile: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  locale: z.string().min(1).optional(),
  style: z.string().min(1).optional(),
  qrcFiles: z.array(z.string().min(1)).default([]),
  stylesheets: z.array(z.string().min(1)).default([]),
  fonts: z.array(z.string().min(1)).default([]),
}).strict();

export const PreviewFindingSchema = z.object({
  severity: z.enum(['info', 'warning', 'error']),
  code: z.string().min(1),
  message: z.string().min(1),
  target: z.string().min(1).optional(),
}).strict();

export const PreviewResultSchema = z.object({
  success: z.boolean(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  imagePath: z.string().min(1).optional(),
  findings: z.array(PreviewFindingSchema).default([]),
  degradedFeatures: z.array(z.string().min(1)).default([]),
  error: z.string().min(1).optional(),
}).strict();

export type PreviewRequest = z.infer<typeof PreviewRequestSchema>;
export type PreviewResult = z.infer<typeof PreviewResultSchema>;

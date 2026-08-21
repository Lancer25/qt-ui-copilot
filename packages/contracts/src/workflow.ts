import { z } from 'zod';
import { UiOperationSchema } from './ui-document.js';

export const RiskLevelSchema = z.enum(['low', 'medium', 'high']);

export const UiPlanSchema = z.object({
  summary: z.string().min(1),
  riskLevel: RiskLevelSchema.default('medium'),
  operations: z.array(UiOperationSchema).min(1),
  expectedResults: z.array(z.string().min(1)).default([]),
  componentIds: z.array(z.string().min(1)).default([]),
}).strict();

export const VisualFindingSchema = z.object({
  type: z.string().min(1),
  target: z.string().min(1).optional(),
  description: z.string().min(1),
  confidence: z.number().min(0).max(1),
}).strict();

export const VisualReviewSchema = z.object({
  requirementSatisfied: z.boolean(),
  score: z.number().min(0).max(100),
  blockingIssues: z.array(VisualFindingSchema).default([]),
  suggestions: z.array(VisualFindingSchema).default([]),
}).strict();

export const WorkflowEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('started'), taskId: z.string().min(1), at: z.string().datetime() }).strict(),
  z.object({ type: z.literal('transitioned'), taskId: z.string().min(1), node: z.string().min(1), at: z.string().datetime() }).strict(),
  z.object({ type: z.literal('failed'), taskId: z.string().min(1), code: z.string().min(1), message: z.string().min(1), at: z.string().datetime() }).strict(),
  z.object({ type: z.literal('cancelled'), taskId: z.string().min(1), at: z.string().datetime() }).strict(),
]);

export type RiskLevel = z.infer<typeof RiskLevelSchema>;
export type UiPlan = z.infer<typeof UiPlanSchema>;
export type VisualReview = z.infer<typeof VisualReviewSchema>;
export type WorkflowEvent = z.infer<typeof WorkflowEventSchema>;

import { z } from 'zod';

const DimensionSchema = z.object({
  width: z.number().int().min(0).max(10000),
  height: z.number().int().min(0).max(10000),
}).strict();

const FontSchema = z.object({
  family: z.string().max(128).optional(),
  pointSize: z.number().int().min(1).max(200).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
}).strict();

/** The deliberately small set of operations used by the visual stage. */
export const VisualEnhancementOperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('setFont'), target: z.string().min(1).max(128), value: FontSchema }).strict(),
  z.object({
    op: z.literal('setSizeBounds'), target: z.string().min(1).max(128),
    minimum: DimensionSchema.optional(), maximum: DimensionSchema.optional(),
  }).strict(),
  z.object({
    op: z.literal('setLayoutMetrics'), target: z.string().min(1).max(128),
    spacing: z.number().int().min(0).max(1000).optional(),
    margins: z.tuple([z.number().int().min(0).max(1000), z.number().int().min(0).max(1000), z.number().int().min(0).max(1000), z.number().int().min(0).max(1000)]).optional(),
    stretch: z.string().min(1).max(128).optional(),
  }).strict(),
  z.object({ op: z.literal('setAlignment'), target: z.string().min(1).max(128), value: z.string().min(1).max(128) }).strict(),
  z.object({
    op: z.literal('setStyleToken'), target: z.string().min(1).max(128),
    token: z.enum(['primary', 'secondary', 'danger', 'title', 'muted', 'panel']),
  }).strict(),
  z.object({ op: z.literal('setResource'), target: z.string().min(1).max(128), resourcePath: z.string().min(1).max(512) }).strict(),
]);

export type VisualEnhancementOperation = z.infer<typeof VisualEnhancementOperationSchema>;

export const VisualEnhancementPlanSchema = z.object({
  operations: z.array(VisualEnhancementOperationSchema).max(128),
}).strict();

export type VisualEnhancementPlan = z.infer<typeof VisualEnhancementPlanSchema>;

export const EnhancementWarningSchema = z.object({
  code: z.enum(['unknown_target', 'unsupported_value', 'invalid_resource', 'apply_failed']),
  operation: z.string().optional(),
  target: z.string().optional(),
  message: z.string().min(1).max(2048),
}).strict();

export type EnhancementWarning = z.infer<typeof EnhancementWarningSchema>;

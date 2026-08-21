import { z } from 'zod';

const ProbeIdSchema = z.string().min(1);

export const ProbeRequestSchema = z.discriminatedUnion('method', [
  z.object({ id: ProbeIdSchema, method: z.literal('listWindows') }).strict(),
  z.object({ id: ProbeIdSchema, method: z.literal('dumpWidgetTree'), window: z.string().min(1) }).strict(),
  z.object({ id: ProbeIdSchema, method: z.literal('findWidget'), objectName: z.string().min(1) }).strict(),
  z.object({ id: ProbeIdSchema, method: z.literal('hitTest'), x: z.number(), y: z.number() }).strict(),
  z.object({ id: ProbeIdSchema, method: z.literal('captureWindow'), window: z.string().min(1) }).strict(),
  z.object({ id: ProbeIdSchema, method: z.literal('captureWidget'), objectName: z.string().min(1) }).strict(),
  z.object({ id: ProbeIdSchema, method: z.literal('getActiveModal') }).strict(),
  z.object({ id: ProbeIdSchema, method: z.literal('getFocusWidget') }).strict(),
  z.object({ id: ProbeIdSchema, method: z.literal('identifyVisibleUi') }).strict(),
]);

export const ProbeResponseSchema = z.object({
  id: ProbeIdSchema,
  success: z.boolean(),
  result: z.unknown().optional(),
  error: z.object({ code: z.string().min(1), message: z.string().min(1) }).strict().optional(),
}).strict().superRefine((value, context) => {
  if (value.success && value.error) context.addIssue({ code: 'custom', message: 'Successful responses cannot include an error' });
  if (!value.success && !value.error) context.addIssue({ code: 'custom', message: 'Failed responses must include an error' });
});

export type ProbeRequest = z.infer<typeof ProbeRequestSchema>;
export type ProbeResponse = z.infer<typeof ProbeResponseSchema>;

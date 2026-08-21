import { z } from 'zod';

export const SizePolicySchema = z.enum([
  'Fixed', 'Minimum', 'Maximum', 'Preferred', 'Expanding', 'MinimumExpanding', 'Ignored',
]);

export const UiValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.object({ kind: z.literal('enum'), value: z.string() }).strict(),
  z.object({ kind: z.literal('size'), width: z.number(), height: z.number() }).strict(),
  z.object({ kind: z.literal('rect'), x: z.number(), y: z.number(), width: z.number(), height: z.number() }).strict(),
  z.object({ kind: z.literal('stringList'), values: z.array(z.string()) }).strict(),
  z.object({ kind: z.literal('icon'), resourcePath: z.string().min(1) }).strict(),
]);

const WidgetPropertiesSchema = z.record(z.string().min(1), UiValueSchema);
const LayoutClassSchema = z.enum(['QHBoxLayout', 'QVBoxLayout', 'QGridLayout', 'QFormLayout']);

export const UiOperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('addWidget'), parentLayout: z.string().min(1), widgetClass: z.string().min(1),
    objectName: z.string().min(1), before: z.string().min(1).optional(), properties: WidgetPropertiesSchema.optional(),
  }).strict(),
  z.object({ op: z.literal('removeWidget'), target: z.string().min(1) }).strict(),
  z.object({
    op: z.literal('moveWidget'), target: z.string().min(1), parentLayout: z.string().min(1), before: z.string().min(1).optional(),
  }).strict(),
  z.object({
    op: z.literal('setProperty'), target: z.string().min(1), name: z.string().min(1), value: UiValueSchema,
  }).strict(),
  z.object({
    op: z.literal('createLayout'), parentWidget: z.string().min(1), layoutClass: LayoutClassSchema, objectName: z.string().min(1),
  }).strict(),
  z.object({
    op: z.literal('wrapInLayout'), targets: z.array(z.string().min(1)).min(1), layoutClass: LayoutClassSchema, objectName: z.string().min(1),
  }).strict(),
  z.object({
    op: z.literal('setLayoutProperty'), target: z.string().min(1),
    name: z.enum(['spacing', 'leftMargin', 'topMargin', 'rightMargin', 'bottomMargin', 'stretch']), value: z.union([z.number(), z.string()]),
  }).strict(),
  z.object({
    op: z.literal('addSpacer'), parentLayout: z.string().min(1), objectName: z.string().min(1),
    orientation: z.enum(['Horizontal', 'Vertical']), sizeType: z.enum(['Minimum', 'Expanding']),
  }).strict(),
  z.object({
    op: z.literal('setSizePolicy'), target: z.string().min(1), horizontal: SizePolicySchema, vertical: SizePolicySchema,
    horizontalStretch: z.number().int().min(0).optional(), verticalStretch: z.number().int().min(0).optional(),
  }).strict(),
  z.object({ op: z.literal('setTabOrder'), order: z.array(z.string().min(1)).min(1) }).strict(),
  z.object({ op: z.literal('setBuddy'), label: z.string().min(1), buddy: z.string().min(1) }).strict(),
  z.object({
    op: z.literal('addExistingConnection'), sender: z.string().min(1), signal: z.string().min(1),
    receiver: z.string().min(1), slot: z.string().min(1),
  }).strict(),
  z.object({
    op: z.literal('insertComponent'), componentId: z.string().min(1), parentLayout: z.string().min(1),
    objectPrefix: z.string().min(1), before: z.string().min(1).optional(),
  }).strict(),
]);

export type SizePolicy = z.infer<typeof SizePolicySchema>;
export type UiValue = z.infer<typeof UiValueSchema>;
export type UiOperation = z.infer<typeof UiOperationSchema>;

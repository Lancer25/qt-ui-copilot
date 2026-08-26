import { z } from 'zod';

/**
 * The deliberately small vocabulary used by the first (base UI) generation
 * stage.  It describes structure and content, not arbitrary Qt properties or
 * XML.  Keeping this contract semantic makes the subsequent .ui generation
 * deterministic and tolerant of model formatting differences.
 */
export type CanonicalUiNode = {
  kind: 'widget' | 'layout' | 'spacer';
  role: string;
  widget?: 'container' | 'label' | 'button' | 'lineEdit' | 'textEdit' | 'checkBox' | 'comboBox' | 'list' | 'table';
  layout?: 'vertical' | 'horizontal' | 'grid' | 'form';
  text?: string;
  placeholder?: string;
  objectName?: string;
  stretch?: number;
  children: CanonicalUiNode[];
};

export const CanonicalUiNodeSchema: z.ZodType<CanonicalUiNode> = z.lazy(() => z.object({
  kind: z.enum(['widget', 'layout', 'spacer']),
  role: z.string().min(1).max(64),
  widget: z.enum(['container', 'label', 'button', 'lineEdit', 'textEdit', 'checkBox', 'comboBox', 'list', 'table']).optional(),
  layout: z.enum(['vertical', 'horizontal', 'grid', 'form']).optional(),
  text: z.string().max(2048).optional(),
  placeholder: z.string().max(2048).optional(),
  objectName: z.string().max(128).optional(),
  stretch: z.number().int().min(0).max(100).optional(),
  children: z.array(CanonicalUiNodeSchema).max(256).default([]),
}).strict());

export interface CanonicalUiIntent {
  fileName: string;
  rootType: 'QWidget' | 'QDialog' | 'QMainWindow';
  rootObjectName: string;
  windowTitle: string;
  size?: { width: number; height: number };
  tree: CanonicalUiNode;
  expectedResults: string[];
}

export const CanonicalUiIntentSchema: z.ZodType<CanonicalUiIntent> = z.object({
  fileName: z.string().regex(/^[^\\/:*?"<>|]+\.ui$/i),
  rootType: z.enum(['QWidget', 'QDialog', 'QMainWindow']),
  rootObjectName: z.string().min(1).max(128),
  windowTitle: z.string().max(256),
  size: z.object({
    width: z.number().int().min(160).max(4096),
    height: z.number().int().min(120).max(4096),
  }).strict().optional(),
  tree: CanonicalUiNodeSchema,
  expectedResults: z.array(z.string().min(1).max(2048)).min(1).max(128),
}).strict();


import { z } from 'zod';

/**
 * The stable identifier of a registered UI capability.  Capability IDs are
 * the only representation of reusable controls that is exposed to the model;
 * class names, headers and paths remain application-owned metadata.
 */
const capabilityId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const semanticVersion = z.string().regex(/^\d+\.\d+(?:\.\d+)?$/);
const qtClassName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_:]*$/);
const relativePath = z.string().min(1).max(1024).refine((value) => {
  const normalized = value.replaceAll('\\', '/');
  return !normalized.startsWith('/') && !/^[A-Za-z]:\//.test(normalized) && !normalized.split('/').includes('..');
}, 'path must be relative to the project');
const boundedStringArray = z.array(z.string().min(1).max(1024)).max(128);

export const UiCapabilityKindSchema = z.enum(['qt_widget', 'ui_fragment', 'promoted_widget']);
export type UiCapabilityKind = z.infer<typeof UiCapabilityKindSchema>;

const UiCapabilityQtSchema = z.object({
  minVersion: semanticVersion,
  maxVersion: semanticVersion.optional(),
  modules: z.array(z.string().min(1).max(128)).min(1).max(32),
  verifiedKitIds: z.array(z.string().min(1).max(256)).max(128),
}).strict().superRefine((value, ctx) => {
  if (value.maxVersion && value.maxVersion < value.minVersion) {
    ctx.addIssue({ code: 'custom', path: ['maxVersion'], message: 'maxVersion must not be lower than minVersion' });
  }
});

const UiCapabilityDesignerSchema = z.object({
  className: qtClassName,
  baseClass: qtClassName.optional(),
  header: relativePath.optional(),
  container: z.boolean(),
}).strict();

const UiCapabilityDependenciesSchema = z.object({
  qss: boundedStringArray,
  qrc: boundedStringArray,
  fonts: boundedStringArray,
  promotedWidgets: z.array(capabilityId).max(128),
}).strict();

const UiCapabilityFallbackSchema = z.object({
  capabilityId,
  reason: z.string().min(1).max(2048),
}).strict();

const UiCapabilitySourceSchema = z.object({
  type: z.enum(['builtin', 'local_library', 'project', 'remote']),
  path: relativePath.optional(),
  adapterId: z.string().min(1).max(256).optional(),
}).strict();

export const UiCapabilitySchema = z.object({
  id: capabilityId,
  kind: UiCapabilityKindSchema,
  displayName: z.string().min(1).max(256),
  description: z.string().min(1).max(4096),
  tags: z.array(z.string().min(1).max(128)).max(64),
  qt: UiCapabilityQtSchema,
  designer: UiCapabilityDesignerSchema,
  dependencies: UiCapabilityDependenciesSchema,
  fallback: UiCapabilityFallbackSchema.optional(),
  source: UiCapabilitySourceSchema,
}).strict();

export type UiCapability = z.infer<typeof UiCapabilitySchema>;

export const UiCapabilityCandidateSchema = z.object({
  capabilityId,
  displayName: z.string().min(1).max(256),
  kind: UiCapabilityKindSchema,
  description: z.string().min(1).max(4096),
  tags: z.array(z.string().min(1).max(128)).max(64),
  dependencyStatus: z.enum(['ready', 'degraded', 'blocked']),
  reasons: z.array(z.string().min(1).max(2048)).max(32),
}).strict();

export type UiCapabilityCandidate = z.infer<typeof UiCapabilityCandidateSchema>;

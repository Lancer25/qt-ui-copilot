import { z } from 'zod';
import { UiCapabilityCandidateSchema } from './ui-capability.js';

const sourceId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const componentId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const relativePath = z.string().min(1).max(1024).refine((value) => {
  const normalized = value.replaceAll('\\', '/');
  return !normalized.startsWith('/') && !/^[A-Za-z]:\//.test(normalized) && !normalized.split('/').includes('..');
}, 'asset path must stay relative');

const LocalConfigSchema = z.object({ rootDir: z.string().min(1).max(4096), discovery: z.enum(['manifest', 'scan', 'hybrid']).default('hybrid') }).strict();
const QtBinaryDiscoverySchema = z.enum(['manifest', 'scan', 'hybrid']).default('hybrid');
const QtBinaryMappingStatusSchema = z.enum(['ready', 'needs_mapping', 'incompatible', 'missing_files', 'probe_failed']);
const QtBinaryMappingOriginSchema = z.enum(['manual', 'automatic']);
const QtBinaryMappingConfidenceSchema = z.enum(['high', 'medium', 'low']);
const QtBinaryDefaultSizeSchema = z.object({ width: z.number().int().min(1).max(16_384), height: z.number().int().min(1).max(16_384) }).strict();

export const QtBinaryComponentMappingSchema = z.object({
  componentId,
  className: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*$/, 'class name must be a C++ identifier, optionally namespace-qualified'),
  baseClass: z.enum(['QWidget', 'QDialog', 'QMainWindow']),
  headerPath: relativePath,
  integration: z.enum(['source', 'header_only', 'binary']).optional(),
  sourcePaths: z.array(relativePath).max(256).default([]),
  includeDir: relativePath.optional(),
  dllPath: relativePath.optional(),
  libPath: relativePath.optional(),
  dllAssociation: z.enum(['same_stem', 'single_library', 'ambiguous', 'missing']).optional(),
  libAssociation: z.enum(['same_stem', 'single_library', 'ambiguous', 'missing']).optional(),
  libDir: relativePath.optional(),
  runtimeDllPaths: z.array(relativePath).max(64).default([]),
  qssPath: relativePath.optional(),
  qrcPath: relativePath.optional(),
  qtModules: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/)).max(32).default([]),
  qtMajor: z.number().int().min(4).max(9).optional(),
  compilerAbi: z.string().min(1).max(128).optional(),
  architecture: z.string().min(1).max(64).optional(),
  designerPlugin: z.boolean().default(false),
  defaultSize: QtBinaryDefaultSizeSchema.optional(),
  previewProperties: z.record(z.string().min(1).max(128), z.union([z.string().max(4096), z.number(), z.boolean()])).default({}),
  origin: QtBinaryMappingOriginSchema.default('manual'),
  confidence: QtBinaryMappingConfidenceSchema.default('low'),
  inference: z.array(z.string().min(1).max(512)).max(32).default([]),
  approved: z.boolean().default(false),
}).strict();
export type QtBinaryComponentMapping = z.infer<typeof QtBinaryComponentMappingSchema>;

export const QtBinarySourceConfigSchema = z.object({
  rootDir: z.string().min(1).max(4096),
  discovery: QtBinaryDiscoverySchema,
  /** Qt Kit that compiled a DLL/LIB component library; never the target project Kit. */
  libraryQtKitId: z.string().min(1).max(128).optional(),
  /** @deprecated Kept only to migrate existing component-source records. */
  qtKitId: z.string().min(1).max(128).optional(),
  mappings: z.array(QtBinaryComponentMappingSchema).max(2_048).optional(),
}).strict();
export type QtBinarySourceConfig = z.infer<typeof QtBinarySourceConfigSchema>;

export const QtBinaryDiscoveryItemSchema = z.object({
  sourceId,
  componentId,
  className: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*$/),
  /** Best known Qt Designer base. For unresolved chains this is a direct custom base. */
  baseClass: z.string().min(1).max(256),
  directBaseClass: z.string().min(1).max(256).optional(),
  inferredQtBaseClass: z.enum(['QWidget', 'QDialog', 'QMainWindow']).optional(),
  headerPath: relativePath,
  integration: z.enum(['source', 'header_only', 'binary']).optional(),
  sourcePaths: z.array(relativePath).max(256).optional(),
  includeDir: relativePath.optional(),
  dllPath: relativePath.optional(),
  libPath: relativePath.optional(),
  dllAssociation: z.enum(['same_stem', 'single_library', 'ambiguous', 'missing']).optional(),
  libAssociation: z.enum(['same_stem', 'single_library', 'ambiguous', 'missing']).optional(),
  qssPath: relativePath.optional(),
  qrcPath: relativePath.optional(),
  hasQObject: z.boolean(),
  properties: z.array(z.string().min(1).max(128)).max(128).default([]),
  exportMacro: z.string().min(1).max(128).optional(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: QtBinaryMappingStatusSchema,
  reason: z.string().min(1).max(1024).optional(),
}).strict();
export type QtBinaryDiscoveryItem = z.infer<typeof QtBinaryDiscoveryItemSchema>;

const StdioConfigSchema = z.object({ command: z.string().min(1).max(4096), args: z.array(z.string().max(4096)).max(64).default([]), cwd: z.string().min(1).max(4096).optional() }).strict();
const HttpConfigSchema = z.object({ url: z.string().url().max(4096).refine((value) => value.startsWith('https://') || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(value), 'remote MCP endpoints must use HTTPS') }).strict();

export const ComponentSourceInputSchema = z.discriminatedUnion('kind', [
  z.object({ id: sourceId.optional(), name: z.string().min(1).max(128), kind: z.literal('local'), enabled: z.boolean().default(true), config: LocalConfigSchema, credential: z.string().min(1).max(8192).optional() }).strict(),
  z.object({ id: sourceId.optional(), name: z.string().min(1).max(128), kind: z.literal('qt_binary'), enabled: z.boolean().default(true), config: QtBinarySourceConfigSchema, credential: z.string().min(1).max(8192).optional() }).strict(),
  z.object({ id: sourceId.optional(), name: z.string().min(1).max(128), kind: z.literal('mcp_stdio'), enabled: z.boolean().default(true), config: StdioConfigSchema, credential: z.string().min(1).max(8192).optional() }).strict(),
  z.object({ id: sourceId.optional(), name: z.string().min(1).max(128), kind: z.literal('mcp_http'), enabled: z.boolean().default(true), config: HttpConfigSchema, credential: z.string().min(1).max(8192).optional() }).strict(),
]);
/** Raw caller payload; Zod supplies defaults before persistence. */
export type ComponentSourceInput = z.input<typeof ComponentSourceInputSchema>;

export const ComponentSourceHealthSchema = z.object({
  status: z.enum(['idle', 'syncing', 'ready', 'warning', 'failed', 'disabled']),
  message: z.string().max(2048).optional(),
  checkedAt: z.number().int().positive().optional(),
}).strict();
export type ComponentSourceHealth = z.infer<typeof ComponentSourceHealthSchema>;

export const ComponentSourceRecordSchema = z.object({
  id: sourceId,
  name: z.string().min(1).max(128),
  kind: z.enum(['bundled', 'local', 'qt_binary', 'mcp_stdio', 'mcp_http']),
  enabled: z.boolean(),
  protected: z.boolean().default(false),
  config: z.record(z.string(), z.unknown()),
  health: ComponentSourceHealthSchema,
  itemCount: z.number().int().nonnegative(),
  lastSyncAt: z.number().int().positive().optional(),
  hasCredential: z.boolean().default(false),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
}).strict();
export type ComponentSourceRecord = z.infer<typeof ComponentSourceRecordSchema>;

export const ComponentSourceAssetSchema = z.object({
  path: relativePath,
  kind: z.enum(['qss', 'qrc', 'font', 'image', 'text']),
  text: z.string().max(2_000_000).optional(),
  dataUrl: z.string().max(14_000_000).optional(),
}).strict().superRefine((asset, context) => {
  if (asset.kind === 'image' || asset.kind === 'font') {
    if (!asset.dataUrl?.startsWith('data:')) context.addIssue({ code: 'custom', path: ['dataUrl'], message: 'binary assets require a data URL' });
  } else if (asset.text === undefined) context.addIssue({ code: 'custom', path: ['text'], message: 'text assets require text content' });
});
export type ComponentSourceAsset = z.infer<typeof ComponentSourceAssetSchema>;

export const ComponentSourceItemSchema = z.object({
  sourceId,
  componentId,
  name: z.string().min(1).max(256),
  description: z.string().min(1).max(4096),
  tags: z.array(z.string().min(1).max(128)).max(64).default([]),
  uiSource: z.string().min(1).max(2_000_000),
  assets: z.array(ComponentSourceAssetSchema).max(128).default([]),
  qtVersionRange: z.string().min(1).max(128).optional(),
  license: z.object({ spdx: z.string().min(1).max(128).optional(), name: z.string().min(1).max(256), url: z.string().url().max(2048).optional() }).strict(),
  sourcePath: z.string().min(1).max(4096).optional(),
  inferred: z.boolean().default(false),
  previewDataUrl: z.string().max(14_000_000).optional(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  updatedAt: z.number().int().positive(),
}).strict();
export type ComponentSourceItem = z.infer<typeof ComponentSourceItemSchema>;

export const ComponentSourceSearchResultSchema = UiCapabilityCandidateSchema.extend({
  sourceId,
  componentId,
  sourceName: z.string().min(1).max(128),
  previewAvailable: z.boolean(),
  licenseName: z.string().min(1).max(256),
  inferred: z.boolean(),
  updatedAt: z.number().int().positive(),
}).strict();
export type ComponentSourceSearchResult = z.infer<typeof ComponentSourceSearchResultSchema>;

export const ComponentSourceIdSchema = z.object({ sourceId }).strict();
export const ComponentSourceSyncInputSchema = z.object({ sourceId, query: z.string().max(512).optional() }).strict();
export const ComponentPreviewInputSchema = z.object({ sourceId, componentId, workspaceId: z.string().min(1).max(128).optional() }).strict();
export type ComponentPreviewInput = z.infer<typeof ComponentPreviewInputSchema>;

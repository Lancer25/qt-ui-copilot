import { z } from 'zod';
export const WorkspaceTreeNodeSchema = z.object({ id: z.string().min(1), workspaceId: z.string().min(1), name: z.string().min(1), relativePath: z.string().min(1), kind: z.enum(['directory', 'file']), fileKind: z.string().optional(), size: z.number().nonnegative().optional(), modifiedAt: z.number().nonnegative().optional(), children: z.array(z.lazy(() => WorkspaceTreeNodeSchema)).optional(), decorations: z.array(z.enum(['active', 'git_modified', 'git_untracked', 'ai_created', 'ai_modified', 'warning', 'error'])).default([]) }).strict();
export const WorkspaceTreeSnapshotSchema = z.object({ workspaceId: z.string().min(1), root: WorkspaceTreeNodeSchema, generatedAt: z.number().positive() }).strict();
export type WorkspaceTreeNode = z.infer<typeof WorkspaceTreeNodeSchema>;
export type WorkspaceTreeSnapshot = z.infer<typeof WorkspaceTreeSnapshotSchema>;

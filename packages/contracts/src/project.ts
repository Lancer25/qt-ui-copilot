import { z } from 'zod';

export const CommandSchema = z.object({
  executable: z.string().min(1),
  args: z.array(z.string()).default([]),
}).strict();

export const QtToolchainSchema = z.object({
  version: z.string().min(1),
  uic: z.string().min(1),
  rcc: z.string().min(1),
}).strict();

export const ProjectProfileSchema = z.object({
  id: z.string().min(1),
  rootDir: z.string().min(1),
  qt: QtToolchainSchema,
  build: z.object({ command: CommandSchema }).strict(),
  run: z.object({
    executable: z.string().min(1),
    args: z.array(z.string()).default([]),
    environment: z.record(z.string(), z.string()).default({}),
  }).strict(),
}).strict();

export type Command = z.infer<typeof CommandSchema>;
export type QtToolchain = z.infer<typeof QtToolchainSchema>;
export type ProjectProfile = z.infer<typeof ProjectProfileSchema>;

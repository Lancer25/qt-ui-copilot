import { readFileSync } from 'node:fs';
import { ProjectProfileSchema, type ProjectProfile } from '@qt-ui-copilot/contracts';

export const loadProjectProfile = (profilePath: string): ProjectProfile => {
  const parsed: unknown = JSON.parse(readFileSync(profilePath, 'utf8'));
  return ProjectProfileSchema.parse(parsed);
};

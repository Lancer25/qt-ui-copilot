import { describe, expect, it, vi } from 'vitest';
import { WorkspaceDecorationService } from './workspace-decoration-service';
describe('WorkspaceDecorationService', () => { it('returns an empty map when git is unavailable', async () => { const service = new WorkspaceDecorationService(); expect(await service.git('D:/missing-workspace')).toBeInstanceOf(Map); }); });

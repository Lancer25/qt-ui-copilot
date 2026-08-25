import { describe, expect, it } from 'vitest';
import { ContextService } from './context-service';

const files = [
  { absolutePath: 'ui/Settings.ui', relativePath: 'ui/Settings.ui', kind: 'ui' as const, size: 1, modifiedAt: 1, contentHash: 'ui' },
  { absolutePath: 'resources/dark.qss', relativePath: 'resources/dark.qss', kind: 'qss' as const, size: 1, modifiedAt: 1, contentHash: 'qss' },
  { absolutePath: 'src/BillingEngine.cpp', relativePath: 'src/BillingEngine.cpp', kind: 'source' as const, size: 1, modifiedAt: 1, contentHash: 'cpp' },
];
describe('ContextService', () => {
  it('keeps focused UI context scoped to ui resources', async () => {
    const service = new ContextService(async (path) => path.includes('.ui') ? '<ui/>' : 'stylesheet');
    const context = await service.buildFocusedUiContext(files[0], files, []);
    expect(context.mode).toBe('focused_ui'); expect(JSON.stringify(context)).toContain('dark.qss'); expect(JSON.stringify(context)).not.toContain('BillingEngine.cpp');
  });
  it('searches bounded whole-project excerpts', async () => {
    const service = new ContextService(async (path) => path.includes('Billing') ? 'connect testConnectionButton' : '<ui/>');
    const context = await service.searchWholeProject('testConnectionButton', files);
    expect(context.files[0].path).toBe('src/BillingEngine.cpp');
  });
});

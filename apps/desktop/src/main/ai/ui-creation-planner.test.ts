import { describe, expect, it } from 'vitest';
import type { ModelRequest } from '@qt-ui-copilot/agent-workflow';
import type { AiAttachment } from '@qt-ui-copilot/contracts';
import { UiCreationPlanner } from './ui-creation-planner';

const image: AiAttachment = { id: 'img', name: 'reference.png', kind: 'image', mimeType: 'image/png', size: 3, contentHash: 'a'.repeat(64), dataUrl: 'data:image/png;base64,YWJj' };
const blueprint = { fileName: 'Login.ui', rootType: 'QDialog', rootObjectName: 'loginDialog', windowTitle: 'Login', size: { width: 520, height: 360 }, layoutTree: { kind: 'layout', className: 'QVBoxLayout', objectName: 'mainLayout', properties: {}, children: [] }, tabOrder: [], connections: [], resourceRefs: [], componentIds: [], expectedResults: ['uic passes'] } as const;

class FakeProvider {
  requests: ModelRequest[] = [];
  async generate(request: ModelRequest): Promise<unknown> { this.requests.push(request); return blueprint; }
}

describe('UiCreationPlanner', () => {
  it('sends a strict creation request with image data outside attachment metadata', async () => {
    const provider = new FakeProvider();
    const result = await new UiCreationPlanner(provider).plan({ requirement: 'Create login dialog', attachments: [image], targetQtVersion: '5.9.6', fileName: 'Login.ui', rootType: 'QDialog' });
    expect(result.rootType).toBe('QDialog');
    expect((provider.requests[0].input.attachments as Array<Record<string, unknown>>)[0]).not.toHaveProperty('dataUrl');
    expect(provider.requests[0].kind).toBe('ui_creation');
    expect(provider.requests[0].responseSchema).toContain('layoutTree');
  });
});


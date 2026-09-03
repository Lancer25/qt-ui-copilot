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

  it('normalizes common table list shorthand and drops invalid properties', async () => {
    const provider = new FakeProvider();
    const malformed = structuredClone(blueprint) as Record<string, unknown>;
    malformed.layoutTree = { kind: 'layout', className: 'QVBoxLayout', objectName: 'mainLayout', properties: {}, children: [{ kind: 'widget', className: 'QTableWidget', objectName: 'table', properties: { items: ['A', 'B'], horizontalHeaderLabels: ['Name'], font: { family: 'Segoe UI' }, broken: { nope: true } }, children: [{ type: 'futureQtWidget', class: 'QFutureWidget', name: 'futureWidget' }] }] };
    provider.generate = async (request) => { provider.requests.push(request); return malformed; };
    const result = await new UiCreationPlanner(provider).plan({ requirement: 'Create table', attachments: [], targetQtVersion: '5.9.6', fileName: 'Login.ui', rootType: 'QDialog' });
    const properties = result.layoutTree.children[0]?.properties ?? {};
    expect(properties.items).toEqual({ kind: 'stringList', values: ['A', 'B'] });
    expect(properties.horizontalHeaderLabels).toEqual({ kind: 'stringList', values: ['Name'] });
    expect(properties.broken).toBeUndefined();
    expect(result.layoutTree.children[0]?.children[0]?.className).toBe('QFutureWidget');
  });

  it('normalizes object resource references from model shorthand', async () => {
    const provider = new FakeProvider();
    provider.generate = async (request) => { provider.requests.push(request); return { ...blueprint, resourceRefs: [{ path: 'resources/app.qrc' }], componentIds: [{ id: 'card' }], expectedResults: [{ name: 'renders' }] }; };
    const result = await new UiCreationPlanner(provider).plan({ requirement: 'Create app', attachments: [], targetQtVersion: '6.10.2', fileName: 'Login.ui', rootType: 'QDialog' });
    expect(result.resourceRefs).toEqual(['resources/app.qrc']);
    expect(result.componentIds).toEqual(['card']);
    expect(result.expectedResults).toEqual(['renders']);
  });

  it('fills optional blueprint collections when a model omits them', async () => {
    const provider = new FakeProvider();
    provider.generate = async (request) => { provider.requests.push(request); const { tabOrder: _tabOrder, connections: _connections, resourceRefs: _resourceRefs, componentIds: _componentIds, expectedResults: _expectedResults, ...partial } = blueprint; return partial; };
    const result = await new UiCreationPlanner(provider).plan({ requirement: 'Create app', attachments: [], targetQtVersion: '6.10.2', fileName: 'Login.ui', rootType: 'QDialog' });
    expect(result.tabOrder).toEqual([]);
    expect(result.connections).toEqual([]);
    expect(result.expectedResults.length).toBeGreaterThan(0);
  });
});

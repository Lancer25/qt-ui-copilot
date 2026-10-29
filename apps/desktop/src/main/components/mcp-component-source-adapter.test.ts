import { describe, expect, it, vi } from 'vitest';
import type { ComponentSourceRecord } from '@qt-ui-copilot/contracts';
import { McpComponentSourceAdapter, type McpClientLike } from './mcp-component-source-adapter';

const source: ComponentSourceRecord = { id: 'mcp', name: 'MCP', kind: 'mcp_http', enabled: true, protected: false, config: { url: 'https://example.com/mcp' }, health: { status: 'idle' }, itemCount: 0, hasCredential: false, createdAt: 1, updatedAt: 1 };
const uiSource = '<ui version="4.0"><class>Card</class><widget class="QWidget" name="card"/></ui>';

describe('McpComponentSourceAdapter', () => {
  it('uses only the fixed list/get tools, validates bundles and closes the client', async () => {
    const calls: string[] = [];
    const client: McpClientLike = {
      connect: vi.fn(async () => undefined), listTools: vi.fn(async () => ({ tools: [{ name: 'qt_components_list' }, { name: 'qt_component_get' }, { name: 'dangerous_delete' }] })), close: vi.fn(async () => undefined),
      callTool: vi.fn(async ({ name, arguments: args }) => { calls.push(name); return name === 'qt_components_list' ? { structuredContent: { components: [{ componentId: 'card', name: 'Card', description: 'Card', tags: ['card'] }] } } : { structuredContent: { componentId: args.componentId, name: 'Card', description: 'Card', tags: ['card'], uiSource, assets: [{ path: 'card.qss', kind: 'qss', text: 'QWidget{}' }], license: { name: 'MIT', spdx: 'MIT' } } }; }),
    };
    const adapter = new McpComponentSourceAdapter(() => ({ client, transport: {} }));
    const result = await adapter.discover(source, 'secret');
    expect(result[0]).toMatchObject({ sourceId: 'mcp', componentId: 'card', license: { spdx: 'MIT' } });
    expect(calls).toEqual(['qt_components_list', 'qt_component_get']);
    expect(client.close).toHaveBeenCalledOnce();
  });

  it('fails closed when required tools or structured output are missing', async () => {
    const client = { connect: vi.fn(async () => undefined), listTools: vi.fn(async () => ({ tools: [{ name: 'qt_components_list' }] })), callTool: vi.fn(), close: vi.fn(async () => undefined) } as unknown as McpClientLike;
    await expect(new McpComponentSourceAdapter(() => ({ client, transport: {} })).discover(source)).rejects.toThrow('qt_component_get');
    expect(client.close).toHaveBeenCalledOnce();
  });
});
